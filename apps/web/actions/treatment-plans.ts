'use server'

import { revalidatePath } from 'next/cache'
import { getTenantContext, assertPermission, assertPodeReceber, can } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { getOpenCashRegisterId } from '@/lib/cash-register'
import { montarCheckoutPlan } from '@/lib/checkout/plano-para-checkout'
import type { CheckoutPlan } from '@/components/branch/checkout-wizard'

/**
 * Quem pode o quê, neste arquivo.
 *
 * Tudo aqui exigia `procedures: MANAGE` — o módulo do CATÁLOGO de procedimentos
 * da rede. O efeito era que ninguém operava o fluxo: a profissional (catálogo em
 * "Ver") não conseguia gerar o plano da avaliação, e a recepção (caixa, mas
 * catálogo em "Ver") não conseguia fechar o checkout. Só quem podia editar preço
 * da rede vendia.
 *
 * Agora cada gesto exige a permissão do que ele é:
 *
 * - montar, salvar e propor o plano → `medical_records: MANAGE` (quem atende)
 * - fechar, receber e assinar termo  → caixa ou financeiro (`assertPodeReceber`)
 * - agendar as sessões do plano      → `agenda: MANAGE`, conferido na hora
 * - ler plano e sessões              → `agenda: VIEW`
 */

// -- Tipos ---------------------------------------------------------------------

export interface PlanSessionProduct {
  productId: string
  name:      string
  unit:      string
  quantity:  number
}

export interface PlanSessionProcedure {
  procedureId: string
  price:       number
  sortOrder?:  number
  products?:   PlanSessionProduct[]
}

export interface PlanSessionInput {
  procedures: PlanSessionProcedure[]
  sortOrder?: number
}

export interface PlanSessionForCheckout {
  id:              string
  sortOrder:       number
  totalPrice:      number
  mainProcedureId: string
  mainDurationMin: number
  procedures:      {
    procedureId: string
    name:        string
    price:       number
    durationMin: number
    products:    { productId: string; name: string; unit: string; quantity: number }[]
  }[]
  appointmentId:   string | null
}

export interface AnamnesisData {
  skinType:                  string
  allergies:                 string
  medications:               string
  healthConditions:          string
  previousProcedures:        string
  isPregnantOrBreastfeeding: boolean
  useSunscreen:              boolean
  observations:              string
}

/**
 * Regrava as sessões de um plano.
 *
 * ⚠️ Não é export: todo export de arquivo `'use server'` vira endpoint público,
 * e esta função não autoriza nada — quem chama já conferiu.
 */
async function gravarSessoes(
  admin: ReturnType<typeof createAdminClient>,
  planId: string,
  sessions: PlanSessionInput[],
): Promise<{ error?: string }> {
  // Apaga as antigas (cascade leva os procedimentos junto)
  await admin.from('treatment_plan_sessions').delete().eq('plan_id', planId)

  for (let i = 0; i < sessions.length; i++) {
    const sess = sessions[i]!
    const { data: newSess, error: sessErr } = await admin
      .from('treatment_plan_sessions')
      .insert({ plan_id: planId, sort_order: i })
      .select('id')
      .single()
    if (sessErr || !newSess) return { error: `Erro ao salvar sessão ${i + 1}: ${sessErr?.message}` }

    if (sess.procedures.length > 0) {
      const { error } = await admin.from('treatment_plan_session_procedures').insert(
        sess.procedures.map((p, j) => ({
          session_id:   newSess.id,
          procedure_id: p.procedureId,
          price:        p.price,
          sort_order:   p.sortOrder ?? j,
          products:     (p.products ?? []).map(pr => ({
            product_id: pr.productId, name: pr.name, unit: pr.unit, quantity: pr.quantity,
          })),
        })),
      )
      if (error) return { error: `Erro ao salvar os procedimentos da sessão ${i + 1}: ${error.message}` }
    }
  }
  return {}
}

/** Confere que o plano é do tenant de quem chama e devolve o essencial dele. */
async function planoDoTenant(
  admin: ReturnType<typeof createAdminClient>,
  planId: string,
  tenantId: string,
) {
  const { data } = await admin
    .from('treatment_plans')
    .select('id, status, client_id, branch_id, evaluation_appointment_id, branches!branch_id(slug, tenant_id)')
    .eq('id', planId)
    .maybeSingle()
  const branch = data?.branches as unknown as { slug: string; tenant_id: string } | null
  if (!data || branch?.tenant_id !== tenantId) return null
  return { ...data, slug: branch!.slug }
}

// -- Salvar rascunho do plano (profissional) -----------------------------------

export async function saveTreatmentPlan(
  appointmentId: string,
  sessions: PlanSessionInput[],
  notes: string,
  slug: string,
): Promise<{ planId?: string; error?: string }> {
  const ctx   = await getTenantContext()
  assertPermission(ctx, 'medical_records', 'MANAGE')
  const admin = createAdminClient()

  const { data: appt, error: apptErr } = await admin
    .from('appointments')
    .select('id, branch_id, client_id')
    .eq('id', appointmentId)
    .single()
  if (apptErr || !appt) return { error: 'Agendamento não encontrado.' }

  const { data: plan, error: planErr } = await admin
    .from('treatment_plans')
    .upsert({
      evaluation_appointment_id: appointmentId,
      client_id:                 appt.client_id,
      branch_id:                 appt.branch_id,
      professional_id:           ctx.internalUserId!,
      professional_notes:        notes,
      status:                    'DRAFT',
      updated_at:                new Date().toISOString(),
    }, { onConflict: 'evaluation_appointment_id' })
    .select('id')
    .single()
  if (planErr || !plan) return { error: `Erro ao salvar plano: ${planErr?.message}` }

  const res = await gravarSessoes(admin, plan.id as string, sessions)
  if (res.error) return res

  revalidatePath(`/${slug}/agenda/${appointmentId}`)
  return { planId: plan.id as string }
}

// -- Planejamento do CLIENTE ---------------------------------------------------
//
// O plano nascia sempre dentro de uma consulta de avaliação e só existia ali:
// não dava para planejar antes, revisar depois nem abrir durante outro
// atendimento. `evaluation_appointment_id` continua, agora como "atendimento de
// origem" — opcional.

/** Planos de um cliente, do mais recente para o mais antigo. */
export async function getPlanosDoCliente(clientId: string): Promise<{
  planos: {
    id: string; status: string; notes: string | null; criadoEm: string
    total: number; sessoes: number; origemId: string | null
  }[]
}> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'agenda', 'VIEW')
  const admin = createAdminClient()

  const { data } = await admin
    .from('treatment_plans')
    .select(`
      id, status, professional_notes, created_at, evaluation_appointment_id,
      clients!inner(tenant_id),
      treatment_plan_sessions(treatment_plan_session_procedures(price))
    `)
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })

  type RawSess = { treatment_plan_session_procedures: { price: number }[] }

  const planos = (data ?? [])
    .filter(p => (p.clients as unknown as { tenant_id: string } | null)?.tenant_id === ctx.tenantId)
    .map(p => {
      const sessoes = (p.treatment_plan_sessions as unknown as RawSess[]) ?? []
      return {
        id:       p.id as string,
        status:   p.status as string,
        notes:    (p.professional_notes as string | null) ?? null,
        criadoEm: p.created_at as string,
        sessoes:  sessoes.length,
        total:    sessoes.reduce(
          (s, sess) => s + (sess.treatment_plan_session_procedures ?? []).reduce((t, pr) => t + Number(pr.price), 0),
          0,
        ),
        origemId: (p.evaluation_appointment_id as string | null) ?? null,
      }
    })

  return { planos }
}

/**
 * Abre um plano novo.
 *
 * `clientId` é opcional: `appointments.client_id` é NOT NULL, então toda
 * avaliação já obrigava a cadastrar cliente (com CPF e e-mail, porque o
 * cadastro cria login) antes mesmo de existir um plano. Aqui a profissional
 * nomeia o plano e liga a um cliente quando houver um — o aceite é que exige.
 *
 * `appointmentId` é só a origem: de qual atendimento a conversa saiu.
 */
export async function criarPlanoDoCliente(
  clientId: string | null,
  branchId: string,
  appointmentId?: string | null,
  nome?: string,
): Promise<{ planId?: string; error?: string }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'medical_records', 'MANAGE')
  const admin = createAdminClient()

  let filial = branchId

  if (clientId) {
    const { data: cliente } = await admin
      .from('clients')
      .select('id, tenant_id, branch_id')
      .eq('id', clientId)
      .maybeSingle()
    if (!cliente || cliente.tenant_id !== ctx.tenantId) return { error: 'Cliente não encontrado.' }
    // A filial do plano é a de onde ele está sendo feito; sem ela, a de cadastro
    // do cliente. É o que o aceite usa depois para o caixa e os agendamentos.
    filial = filial || (cliente.branch_id as string | null) || ''
  }

  if (!filial) return { error: 'Selecione a unidade do plano.' }

  const { data, error } = await admin
    .from('treatment_plans')
    .insert({
      client_id:                 clientId,
      branch_id:                 filial,
      professional_id:           ctx.internalUserId!,
      evaluation_appointment_id: appointmentId ?? null,
      name:                      nome?.trim() || 'Plano de tratamento',
      status:                    'DRAFT',
    })
    .select('id')
    .single()

  if (error || !data) return { error: `Erro ao criar o plano: ${error?.message}` }
  return { planId: data.id as string }
}

/**
 * Liga um plano a um cliente — na criação ou depois.
 *
 * É o gesto que transforma um planejamento feito "para a Marina que veio por
 * indicação" no plano de uma pessoa cadastrada, sem refazer nada.
 */
export async function vincularClienteAoPlano(
  planId: string,
  clientId: string,
): Promise<{ error?: string }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'medical_records', 'MANAGE')
  const admin = createAdminClient()

  const plan = await planoDoTenant(admin, planId, ctx.tenantId!)
  if (!plan) return { error: 'Plano não encontrado.' }

  const { data: cliente } = await admin
    .from('clients')
    .select('id, tenant_id')
    .eq('id', clientId)
    .maybeSingle()
  if (!cliente || cliente.tenant_id !== ctx.tenantId) return { error: 'Cliente não encontrado.' }

  const { error } = await admin
    .from('treatment_plans')
    .update({ client_id: clientId, updated_at: new Date().toISOString() })
    .eq('id', planId)
  if (error) return { error: error.message }

  revalidatePath(`/${plan.slug}/clients/${clientId}`)
  revalidatePath(`/admin/clients/${clientId}`)
  return {}
}

/**
 * Clientes para ligar a um plano.
 *
 * Busca por nome, telefone ou CPF — os três jeitos de reencontrar alguém no
 * balcão. Devolve poucos: é um seletor, não uma listagem.
 */
export async function buscarClientesParaPlano(termo: string): Promise<{
  clientes: { id: string; name: string; phone: string | null; document: string | null }[]
}> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'clients', 'VIEW')

  const busca = termo.trim()
  if (busca.length < 2) return { clientes: [] }

  const admin = createAdminClient()
  const digitos = busca.replace(/\D/g, '')

  const { data } = await admin
    .from('clients')
    .select('id, name, phone, document')
    .eq('tenant_id', ctx.tenantId!)
    .eq('is_active', true)
    .or(
      digitos.length >= 3
        ? `name.ilike.%${busca}%,phone.ilike.%${digitos}%,document.ilike.%${digitos}%`
        : `name.ilike.%${busca}%`,
    )
    .order('name')
    .limit(8)

  return { clientes: (data ?? []) as { id: string; name: string; phone: string | null; document: string | null }[] }
}

/** Renomeia o plano. */
export async function renomearPlano(planId: string, nome: string): Promise<{ error?: string }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'medical_records', 'MANAGE')
  const admin = createAdminClient()

  const plan = await planoDoTenant(admin, planId, ctx.tenantId!)
  if (!plan) return { error: 'Plano não encontrado.' }
  if (!nome.trim()) return { error: 'Dê um nome ao plano.' }

  const { error } = await admin
    .from('treatment_plans')
    .update({ name: nome.trim(), updated_at: new Date().toISOString() })
    .eq('id', planId)
  return error ? { error: error.message } : {}
}

/**
 * Todos os planejamentos da rede/unidade, com busca e filtro.
 *
 * A busca acha pelo NOME DO PLANO (o único jeito enquanto não há cliente) e
 * pelos dados de quem já está ligado: nome, CPF ou telefone.
 */
export async function listarPlanejamentos(opcoes?: {
  status?: string
  busca?:  string
  branchId?: string | null
}): Promise<{
  planos: {
    id: string; nome: string; status: string; criadoEm: string
    total: number; sessoes: number
    cliente: { id: string; name: string; phone: string | null } | null
    unidade: string | null
  }[]
}> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'agenda', 'VIEW')
  const admin = createAdminClient()

  // `treatment_plans` não tem tenant_id: o recorte é pela filial.
  const { data: filiais } = await admin
    .from('branches')
    .select('id, name')
    .eq('tenant_id', ctx.tenantId!)
  const doTenant = (filiais ?? []) as { id: string; name: string }[]
  const alcance  = opcoes?.branchId
    ? doTenant.filter(b => b.id === opcoes.branchId)
    : doTenant

  let query = admin
    .from('treatment_plans')
    .select(`
      id, name, status, created_at, branch_id,
      clients(id, name, phone, document),
      treatment_plan_sessions(treatment_plan_session_procedures(price))
    `)
    .in('branch_id', alcance.map(b => b.id))
    .order('created_at', { ascending: false })
    .limit(200)

  if (opcoes?.status) query = query.eq('status', opcoes.status)

  const { data, error } = await query
  if (error) throw new Error(`Falha ao carregar os planejamentos: ${error.message}`)

  type RawCli  = { id: string; name: string; phone: string | null; document: string | null }
  type RawSess = { treatment_plan_session_procedures: { price: number }[] }

  const termo = (opcoes?.busca ?? '').trim().toLowerCase()
  const digitos = termo.replace(/\D/g, '')

  const planos = (data ?? [])
    .map(p => {
      const cli     = p.clients as unknown as RawCli | null
      const sessoes = (p.treatment_plan_sessions as unknown as RawSess[]) ?? []
      return {
        id:       p.id as string,
        nome:     (p.name as string | null) ?? 'Plano de tratamento',
        status:   p.status as string,
        criadoEm: p.created_at as string,
        sessoes:  sessoes.length,
        total:    sessoes.reduce(
          (s, sess) => s + (sess.treatment_plan_session_procedures ?? []).reduce((t, pr) => t + Number(pr.price), 0),
          0,
        ),
        cliente:  cli ? { id: cli.id, name: cli.name, phone: cli.phone } : null,
        unidade:  doTenant.find(b => b.id === p.branch_id)?.name ?? null,
        _doc:     cli?.document ?? '',
        _fone:    cli?.phone ?? '',
      }
    })
    .filter(p => {
      if (!termo) return true
      if (p.nome.toLowerCase().includes(termo)) return true
      if (p.cliente?.name.toLowerCase().includes(termo)) return true
      if (digitos && (p._doc.includes(digitos) || p._fone.replace(/\D/g, '').includes(digitos))) return true
      return false
    })
    .map(({ _doc, _fone, ...p }) => p)

  return { planos }
}

/** Um plano no formato que o editor entende. */
export async function getPlanoParaEditar(planId: string): Promise<{
  plano?: {
    id: string; status: string; notes: string | null
    sessions: { procedures: { procedureId: string; name: string; price: number; products?: { productId: string; name: string; unit: string; quantity: number }[] }[] }[]
  }
  error?: string
}> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'agenda', 'VIEW')
  const admin = createAdminClient()

  const plan = await planoDoTenant(admin, planId, ctx.tenantId!)
  if (!plan) return { error: 'Plano não encontrado.' }

  const { data } = await admin
    .from('treatment_plans')
    .select(`
      id, status, professional_notes,
      treatment_plan_sessions(sort_order, treatment_plan_session_procedures(procedure_id, price, sort_order, products, procedures(name)))
    `)
    .eq('id', planId)
    .maybeSingle()
  if (!data) return { error: 'Plano não encontrado.' }

  type RawProd = { product_id: string; name: string; unit: string; quantity: number }
  type RawProc = { procedure_id: string; price: number; sort_order: number; products: RawProd[]; procedures: { name: string } | null }
  type RawSess = { sort_order: number; treatment_plan_session_procedures: RawProc[] }

  const sessions = ((data.treatment_plan_sessions as unknown as RawSess[]) ?? [])
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(s => ({
      procedures: (s.treatment_plan_session_procedures ?? [])
        .sort((a, b) => a.sort_order - b.sort_order)
        .map(p => ({
          procedureId: p.procedure_id,
          name:        p.procedures?.name ?? '—',
          price:       Number(p.price),
          products:    (p.products ?? []).map(pr => ({
            productId: pr.product_id, name: pr.name, unit: pr.unit, quantity: Number(pr.quantity),
          })),
        })),
    }))

  return {
    plano: {
      id:       data.id as string,
      status:   data.status as string,
      notes:    (data.professional_notes as string | null) ?? null,
      sessions,
    },
  }
}

/** Salva sessões e observações de um plano que já existe. */
export async function salvarPlanoDoCliente(
  planId: string,
  sessions: PlanSessionInput[],
  notes: string,
): Promise<{ error?: string }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'medical_records', 'MANAGE')
  const admin = createAdminClient()

  const plan = await planoDoTenant(admin, planId, ctx.tenantId!)
  if (!plan) return { error: 'Plano não encontrado.' }
  if (plan.status === 'ACCEPTED' || plan.status === 'COMPLETED') {
    return { error: 'Este plano já foi fechado e não pode mais ser alterado.' }
  }

  const { error } = await admin
    .from('treatment_plans')
    .update({ professional_notes: notes || null, updated_at: new Date().toISOString() })
    .eq('id', planId)
  if (error) return { error: error.message }

  const res = await gravarSessoes(admin, planId, sessions)
  if (res.error) return res

  revalidatePath(`/${plan.slug}/clients/${plan.client_id}`)
  revalidatePath(`/admin/clients/${plan.client_id}`)
  if (plan.evaluation_appointment_id) {
    revalidatePath(`/${plan.slug}/agenda/${plan.evaluation_appointment_id}`)
    revalidatePath(`/admin/agenda/${plan.evaluation_appointment_id}`)
  }
  return {}
}

// -- Buscar sessões do plano (para checkout wizard) ----------------------------


export async function getTreatmentPlanSessions(planId: string): Promise<{
  sessions: PlanSessionForCheckout[]
  total:    number
}> {
  const ctx   = await getTenantContext()
  assertPermission(ctx, 'agenda', 'VIEW')
  const admin = createAdminClient()

  const { data: plan } = await admin
    .from('treatment_plans')
    .select('branch_id')
    .eq('id', planId)
    .maybeSingle()
  if (!plan) return { sessions: [], total: 0 }

  const { data: branch } = await admin
    .from('branches')
    .select('tenant_id')
    .eq('id', plan.branch_id)
    .maybeSingle()
  if (branch?.tenant_id !== ctx.tenantId) return { sessions: [], total: 0 }

  const { data: rawSessions } = await admin
    .from('treatment_plan_sessions')
    .select(`
      id, sort_order, appointment_id,
      treatment_plan_session_procedures(procedure_id, price, sort_order, products, procedures(name, duration_min))
    `)
    .eq('plan_id', planId)
    .order('sort_order')

  type RawProcProduct = { product_id: string; name: string; unit: string; quantity: number }
  type RawProc = { procedure_id: string; price: number; sort_order: number; products: RawProcProduct[]; procedures: { name: string; duration_min: number } | null }
  type RawSess = { id: string; sort_order: number; appointment_id: string | null; treatment_plan_session_procedures: RawProc[] }

  const sessions: PlanSessionForCheckout[] = ((rawSessions ?? []) as unknown as RawSess[]).map(s => {
    const procs = (s.treatment_plan_session_procedures ?? [])
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(p => ({
        procedureId: p.procedure_id,
        name:        p.procedures?.name ?? '—',
        price:       Number(p.price),
        durationMin: p.procedures?.duration_min ?? 60,
        products:    (p.products ?? []).map((pr: RawProcProduct) => ({
          productId: pr.product_id, name: pr.name, unit: pr.unit, quantity: Number(pr.quantity),
        })),
      }))
    const totalPrice = procs.reduce((sum, p) => sum + p.price, 0)
    return {
      id:              s.id,
      sortOrder:       s.sort_order,
      totalPrice,
      mainProcedureId: procs[0]?.procedureId ?? '',
      mainDurationMin: procs.reduce((sum, p) => sum + p.durationMin, 0),
      procedures:      procs,
      appointmentId:   s.appointment_id ?? null,
    }
  })

  const total = sessions.reduce((sum, s) => sum + s.totalPrice, 0)
  return { sessions, total }
}

// -- Enviar plano para recepção (DRAFT → PROPOSED) -----------------------------

export async function proposeTreatmentPlan(planId: string, slug: string) {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'medical_records', 'MANAGE')

  const admin = createAdminClient()

  const { data: plan } = await admin
    .from('treatment_plans')
    .select('id, status, evaluation_appointment_id, branch_id, professional_notes, client_id')
    .eq('id', planId)
    .single()

  if (!plan)               return { error: 'Plano não encontrado.' }
  if (plan.status !== 'DRAFT') return { error: 'Apenas planos em rascunho podem ser enviados.' }

  // 1. Observações da profissional
  if (!plan.professional_notes?.trim()) {
    return { error: 'Preencha as observações antes de enviar.' }
  }

  // 2. Pelo menos 1 sessão
  const { count: itemCount } = await admin
    .from('treatment_plan_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('plan_id', planId)
  if (!itemCount || itemCount === 0) {
    return { error: 'Adicione ao menos uma sessão ao plano antes de enviar.' }
  }

  // 3. Dores do cliente (appointment.notes)
  if (plan.evaluation_appointment_id) {
    const { data: appt } = await admin
      .from('appointments')
      .select('notes')
      .eq('id', plan.evaluation_appointment_id)
      .single()
    if (!appt?.notes?.trim()) {
      return { error: 'Registre as dores/queixas do cliente antes de enviar.' }
    }
  }

  // 4. Anamnese preenchida
  const { data: medRecord } = await admin
    .from('medical_records')
    .select('general_anamnesis')
    .eq('client_id', plan.client_id)
    .maybeSingle()
  if (!medRecord?.general_anamnesis) {
    return { error: 'Preencha a anamnese do cliente antes de enviar.' }
  }

  const { error } = await admin
    .from('treatment_plans')
    .update({ status: 'PROPOSED', updated_at: new Date().toISOString() })
    .eq('id', planId)

  if (error) return { error: error.message }

  revalidatePath(`/${slug}/agenda`)
  if (plan.evaluation_appointment_id) {
    revalidatePath(`/${slug}/agenda/${plan.evaluation_appointment_id}`)
  }
  return {}
}

// -- Cancelar checkout (PROPOSED → DRAFT) -------------------------------------

export async function cancelCheckout(
  planId: string,
  reason: string,
  slug:   string,
): Promise<{ error?: string }> {
  const ctx = await getTenantContext()
  assertPodeReceber(ctx)
  const admin = createAdminClient()

  const { data: plan } = await admin
    .from('treatment_plans')
    .select('id, status, branch_id, evaluation_appointment_id')
    .eq('id', planId)
    .maybeSingle()
  if (!plan) return { error: 'Plano não encontrado.' }

  const { data: branch } = await admin
    .from('branches')
    .select('tenant_id')
    .eq('id', plan.branch_id)
    .maybeSingle()
  if (branch?.tenant_id !== ctx.tenantId) return { error: 'Acesso negado.' }

  if (plan.status === 'ACCEPTED') return { error: 'Plano já foi aprovado e não pode ser cancelado.' }

  const { error } = await admin
    .from('treatment_plans')
    .update({ status: 'DRAFT', updated_at: new Date().toISOString() })
    .eq('id', planId)
  if (error) return { error: error.message }

  if (plan.evaluation_appointment_id) {
    await admin.from('appointment_history').insert({
      appointment_id:  plan.evaluation_appointment_id,
      changed_by_id:   ctx.internalUserId,
      changed_by_name: ctx.userName || ctx.roleLabel || 'Recepção',
      action:          'CHECKOUT_CANCELLED',
      description:     reason.trim() ? `Checkout cancelado: ${reason.trim()}` : 'Checkout cancelado pela recepção',
    })
  }

  revalidatePath(`/${slug}/agenda`)
  revalidatePath(`/${slug}/checkout/${planId}`)
  return {}
}

// -- Cancelar tratamento em andamento (ACCEPTED → CANCELLED) ------------------

export async function cancelTreatmentPlan(
  planId: string,
  reason: string,
  slug:   string,
): Promise<{ error?: string }> {
  const ctx   = await getTenantContext()
  assertPermission(ctx, 'agenda', 'MANAGE')
  const admin = createAdminClient()

  const { data: plan } = await admin
    .from('treatment_plans')
    .select('id, status, branch_id, client_id, evaluation_appointment_id')
    .eq('id', planId)
    .maybeSingle()
  if (!plan) return { error: 'Plano não encontrado.' }

  const { data: branch } = await admin
    .from('branches')
    .select('tenant_id')
    .eq('id', plan.branch_id)
    .maybeSingle()
  if (branch?.tenant_id !== ctx.tenantId) return { error: 'Acesso negado.' }

  if (plan.status !== 'ACCEPTED') return { error: 'Apenas tratamentos ativos (aceitos) podem ser cancelados.' }

  // Cancelar tratamento é gestão de procedimentos. Para os de múltiplas sessões
  // exige-se também abrangência de rede — que é atributo do membro
  // (`users.branch_id = null`), não mais o nome do cargo NETWORK_ADMIN.
  const { count: sessionCount } = await admin
    .from('treatment_plan_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('plan_id', planId)

  if ((sessionCount ?? 0) > 1 && ctx.branchId !== null) {
    return { error: 'Tratamentos com múltiplas sessões só podem ser cancelados por quem tem abrangência de rede.' }
  }

  const { error } = await admin
    .from('treatment_plans')
    .update({ status: 'CANCELLED', updated_at: new Date().toISOString() })
    .eq('id', planId)
  if (error) return { error: error.message }

  // Cancela agendamentos futuros vinculados ao plano
  const cancelledAt  = new Date().toISOString()
  const cancelReason = reason.trim() ? `Tratamento cancelado: ${reason.trim()}` : 'Tratamento cancelado'

  const { data: futureAppts } = await admin
    .from('appointments')
    .select('id, price')
    .eq('treatment_plan_id', planId)
    .in('status', ['SCHEDULED', 'CONFIRMED'])

  if (futureAppts && futureAppts.length > 0) {
    const apptIds = futureAppts.map(a => a.id)

    await admin
      .from('appointments')
      .update({
        status:              'CANCELLED',
        cancelled_at:        cancelledAt,
        cancellation_reason: cancelReason,
      })
      .in('id', apptIds)

    // Registra histórico em cada agendamento cancelado
    await admin.from('appointment_history').insert(
      apptIds.map(apptId => ({
        appointment_id:  apptId,
        changed_by_id:   ctx.internalUserId,
        changed_by_name: ctx.userName || ctx.roleLabel || 'Equipe',
        action:          'CANCELLED',
        description:     cancelReason,
      }))
    )

    // Emite crédito interno pelo valor das sessões não realizadas (plano já estava pago)
    const totalCredit = futureAppts.reduce((s, a) => s + Number(a.price ?? 0), 0)
    if (totalCredit > 0 && plan.client_id) {
      await admin.from('internal_credits').insert({
        client_id:   plan.client_id,
        branch_id:   plan.branch_id,
        amount:      totalCredit,
        description: `Cancelamento de plano — ${futureAppts.length} sessão(ões) não realizada(s)`,
        created_at:  new Date().toISOString(),
      })
    }
  }

  if (plan.evaluation_appointment_id) {
    await admin.from('appointment_history').insert({
      appointment_id:  plan.evaluation_appointment_id,
      changed_by_id:   ctx.internalUserId,
      changed_by_name: ctx.userName || ctx.roleLabel || 'Equipe',
      action:          'TREATMENT_CANCELLED',
      description:     cancelReason,
    })
  }

  revalidatePath(`/${slug}/clients`)
  return {}
}

// -- Gerar plano completo de uma só vez (avaliação) ----------------------------

export async function generateEvaluationPlan(
  appointmentId:         string,
  complaints:            string,
  anamnesis:             AnamnesisData,
  sessions:              PlanSessionInput[],
  planNotes:             string,
  sessionNotes:          string,
  sessionIntercurrences: string,
  slug:                  string,
): Promise<{ error?: string; planId?: string }> {
  const ctx   = await getTenantContext()
  assertPermission(ctx, 'medical_records', 'MANAGE')
  const admin = createAdminClient()

  if (!complaints.trim()) return { error: 'Registre as dores/queixas do cliente.' }
  if (sessions.length === 0) return { error: 'Adicione ao menos uma sessão ao plano antes de enviar.' }

  const { data: appt } = await admin
    .from('appointments')
    .select('id, branch_id, client_id, professional_id')
    .eq('id', appointmentId)
    .single()
  if (!appt) return { error: 'Agendamento não encontrado.' }

  // 1. Queixas do cliente → appointment.notes
  await admin.from('appointments').update({ notes: complaints.trim() }).eq('id', appointmentId)

  // 2. Anamnese → medical_records.general_anamnesis
  await admin.from('medical_records').upsert(
    { client_id: appt.client_id, general_anamnesis: { ...anamnesis, updatedAt: new Date().toISOString(), updatedBy: ctx.internalUserId } },
    { onConflict: 'client_id' },
  )

  // 3. Upsert plano + salvar sessões enviadas pelo editor → PROPOSED
  const { data: plan, error: planErr } = await admin
    .from('treatment_plans')
    .upsert({
      evaluation_appointment_id: appointmentId,
      client_id:                 appt.client_id,
      branch_id:                 appt.branch_id,
      professional_id:           ctx.internalUserId!,
      professional_notes:        planNotes.trim() || null,
      status:                    'PROPOSED',
      updated_at:                new Date().toISOString(),
    }, { onConflict: 'evaluation_appointment_id' })
    .select('id')
    .single()
  if (planErr || !plan) return { error: `Erro ao gerar plano: ${planErr?.message}` }

  // Salva as sessões do editor (sobrescreve o que havia no banco)
  await admin.from('treatment_plan_sessions').delete().eq('plan_id', plan.id)
  for (let i = 0; i < sessions.length; i++) {
    const sess = sessions[i]!
    const { data: newSess, error: sessErr } = await admin
      .from('treatment_plan_sessions')
      .insert({ plan_id: plan.id, sort_order: i })
      .select('id').single()
    if (sessErr || !newSess) return { error: `Erro ao salvar sessão ${i + 1}: ${sessErr?.message}` }
    if (sess.procedures.length > 0) {
      await admin.from('treatment_plan_session_procedures').insert(
        sess.procedures.map((p, j) => ({
          session_id:   newSess.id,
          procedure_id: p.procedureId,
          price:        p.price,
          sort_order:   p.sortOrder ?? j,
          products:     (p.products ?? []).map(pr => ({
            product_id: pr.productId, name: pr.name, unit: pr.unit, quantity: pr.quantity,
          })),
        })),
      )
    }
  }
  const count = sessions.length

  // 4. Observações do atendimento → medical_record_entries
  if (sessionNotes.trim() || sessionIntercurrences.trim()) {
    let { data: medRecord } = await admin
      .from('medical_records').select('id').eq('client_id', appt.client_id).maybeSingle()
    if (!medRecord) {
      const { data: newRec } = await admin.from('medical_records').insert({ client_id: appt.client_id }).select('id').single()
      medRecord = newRec
    }
    if (medRecord) {
      await admin.from('medical_record_entries').upsert({
        medical_record_id: medRecord.id,
        appointment_id:    appointmentId,
        professional_id:   appt.professional_id,
        notes:             sessionNotes.trim() || null,
        intercurrences:    sessionIntercurrences.trim() || null,
      }, { onConflict: 'appointment_id' })
    }
  }

  // 5. Log
  await admin.from('appointment_history').insert({
    appointment_id:  appointmentId,
    changed_by_id:   ctx.internalUserId,
    changed_by_name: ctx.userName || ctx.roleLabel || 'Profissional',
    action:          'PLAN_PROPOSED',
    description:     `Plano de tratamento enviado para recepção — ${count} sessão(ões)`,
  })

  revalidatePath(`/${slug}/agenda`)
  revalidatePath(`/${slug}/agenda/${appointmentId}`)
  revalidatePath(`/${slug}/checkout`)
  return { planId: plan.id as string }
}

// -- Assinar termo de consentimento digitalmente -------------------------------

export async function signConsentTerm(consentId: string, signatureDataUrl: string, slug: string) {
  const ctx = await getTenantContext()
  assertPodeReceber(ctx)

  const admin = createAdminClient()

  const { error } = await admin
    .from('consent_terms')
    .update({
      status:         'SIGNED',
      signed_at:      new Date().toISOString(),
      signed_via:     'web',
      signature_data: signatureDataUrl,
    })
    .eq('id', consentId)

  if (error) return { error: error.message }

  revalidatePath(`/${slug}/checkout`)
  return {}
}

/**
 * Dados do checkout de um plano, para abrir o wizard fora da página dele.
 *
 * É o que permite fechar a venda dentro da tela do atendimento: quem acabou de
 * montar o plano, se puder receber, não precisa mandar o cliente para a
 * recepção nem trocar de tela.
 */
export async function getCheckoutPlan(planId: string): Promise<{ plan?: CheckoutPlan; error?: string }> {
  const ctx = await getTenantContext()
  assertPodeReceber(ctx)

  const admin = createAdminClient()
  const { data: plan } = await admin
    .from('treatment_plans')
    .select('branch_id, branches!branch_id(name, tenant_id)')
    .eq('id', planId)
    .maybeSingle()

  const branch = plan?.branches as unknown as { name: string; tenant_id: string } | null
  if (!plan?.branch_id || !branch || branch.tenant_id !== ctx.tenantId) {
    return { error: 'Plano não encontrado.' }
  }

  const { plan: checkout, error } = await montarCheckoutPlan(
    planId, plan.branch_id as string, branch.name, ctx.tenantId!,
  )
  return checkout ? { plan: checkout } : { error: error ?? 'Plano não encontrado.' }
}

/**
 * Termo assinado em papel.
 *
 * O passo de documentação tinha um botão "Imprimir documentos" que não imprimia
 * nada — só destravava o passo seguinte — e os termos ficavam PENDENTES para
 * sempre no prontuário. Quem imprime e colhe a assinatura na folha registra por
 * aqui; quem assina na tela usa `signConsentTerm`.
 */
export async function marcarTermoAssinadoEmPapel(consentId: string, slug: string) {
  const ctx = await getTenantContext()
  assertPodeReceber(ctx)

  const admin = createAdminClient()
  const { error } = await admin
    .from('consent_terms')
    .update({
      status:     'SIGNED',
      signed_at:  new Date().toISOString(),
      signed_via: 'paper',
    })
    .eq('id', consentId)

  if (error) return { error: error.message }

  if (slug) revalidatePath(`/${slug}/checkout`)
  return {}
}

// -- Criar termos de consentimento para o checkout -----------------------------

export async function createCheckoutConsentTerms(
  planId: string,
  medicalRecordId: string,
  clientName: string,
  branchName: string,
  items: { procedureName: string; sessions: number; unitPrice: number }[],
  totalAmount: number,
) {
  const ctx = await getTenantContext()
  assertPodeReceber(ctx)

  const admin  = createAdminClient()

  // Os termos deste plano já existem? Reaproveita.
  //
  // Entrar duas vezes no passo de documentação criava outro par, e todo
  // checkout abandonado deixava dois termos PENDING soltos no prontuário. Como
  // agora eles carregam `treatment_plan_id`, dá para reencontrá-los — inclusive
  // já assinados, quando alguém volta ao checkout depois de assinar.
  const { data: existentes } = await admin
    .from('consent_terms')
    .select('id, title, content, status, signed_via')
    .eq('treatment_plan_id', planId)
    .order('created_at')

  if (existentes && existentes.length > 0) return { terms: existentes }

  const today  = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
  const totalBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalAmount)

  const itemsText = items
    .map(it => `• ${it.procedureName} — ${it.sessions} sessão(ões) — R$ ${it.unitPrice.toFixed(2).replace('.', ',')} cada`)
    .join('\n')

  const anamnesisContent = `TERMO DE ANAMNESE E SAÚDE

Data: ${today}
Paciente: ${clientName}
Clínica: ${branchName}

Declaro que as informações prestadas sobre meu histórico de saúde são verdadeiras e completas. Estou ciente de que omissões ou informações incorretas podem comprometer a segurança e eficácia dos procedimentos realizados.

Confirmo não ter alergia a produtos utilizados nos procedimentos contratados ou, caso tenha, a informei à profissional durante a avaliação.

Li, entendi e concordo com este Termo de Anamnese.`

  const contractContent = `CONTRATO DE PRESTAÇÃO DE SERVIÇOS ESTÉTICOS

Data: ${today}
Contratante: ${clientName}
Contratada: ${branchName}

SERVIÇOS CONTRATADOS:
${itemsText}

VALOR TOTAL: ${totalBRL}

A contratada se compromete a executar os procedimentos listados com profissionalismo, higiene e os materiais adequados.

O contratante declara ter sido informado sobre os procedimentos, seus benefícios esperados e possíveis contraindicações.

Li, entendi e concordo com os termos deste Contrato de Prestação de Serviços.`

  // `signed_via` nasce nulo: quem assina é que diz por onde — tela ou papel.
  // Antes já entrava como 'web' aqui, o que fazia todo termo parecer assinado
  // digitalmente mesmo sem ninguém ter assinado nada.
  const { data: terms, error } = await admin
    .from('consent_terms')
    .insert([
      {
        medical_record_id: medicalRecordId,
        treatment_plan_id: planId,
        title:             'Termo de Anamnese',
        content:           anamnesisContent,
        status:            'PENDING',
      },
      {
        medical_record_id: medicalRecordId,
        treatment_plan_id: planId,
        title:             'Contrato de Prestação de Serviços',
        content:           contractContent,
        status:            'PENDING',
      },
    ])
    .select('id, title, content, status, signed_via')

  if (error) return { error: error.message }
  return { terms }
}

// -- Finalizar checkout (pagamento + agendamento de execução) ------------------

export type SessionScheduleInput = {
  planSessionId:  string
  scheduledAt:    string
  professionalId: string
  branchId:       string
}

/**
 * Como o plano foi pago.
 *
 * `entrada` só existe em `PARCELADO`, e vale 0 quando não houve entrada. As
 * parcelas são o SALDO (total − entrada) dividido em `parcelas` vezes, a partir
 * de `primeiroVencimento`.
 */
export type PagamentoDoPlano =
  | { forma: 'AVISTA';    metodo: string }
  | { forma: 'PARCELADO'; metodo: string; entrada: number; parcelas: number; primeiroVencimento: string }
  | { forma: 'A_RECEBER'; metodo: string | null; vencimento: string }

/**
 * Como o pagamento entra na linha do tempo do atendimento.
 *
 * ⚠️ Não é export: todo export de um arquivo `'use server'` vira endpoint
 * público, e isto é formatação de texto.
 */
function rotuloDoPagamento(p: PagamentoDoPlano): string {
  if (p.forma === 'AVISTA')    return `${p.metodo} à vista`
  if (p.forma === 'A_RECEBER') return 'a receber'
  const entrada = p.entrada > 0
    ? `entrada de R$ ${p.entrada.toFixed(2).replace('.', ',')} + `
    : ''
  return `${entrada}${p.parcelas}x em ${p.metodo}`
}

export async function checkoutTreatmentPlan(
  planId:           string,
  pagamento:        PagamentoDoPlano,
  sessionSchedules: SessionScheduleInput[],
  slug:             string,
) {
  const ctx   = await getTenantContext()
  assertPodeReceber(ctx)
  const admin = createAdminClient()

  const { data: plan } = await admin
    .from('treatment_plans')
    .select('id, status, client_id, branch_id, evaluation_appointment_id')
    .eq('id', planId)
    .single()

  if (!plan)                      return { error: 'Plano não encontrado.' }
  if (plan.status !== 'PROPOSED') return { error: 'Apenas planos enviados para recepção podem ser finalizados.' }

  // Busca sessões com procedimentos
  const { sessions, total } = await getTreatmentPlanSessions(planId)
  if (sessions.length === 0) return { error: 'Plano sem sessões cadastradas.' }

  // Caixa aberto da unidade. Antes isto procurava `status = 'OPEN'`, coluna que
  // não existe em `cash_registers` — o erro era descartado, `cash_register_id`
  // ficava sempre nulo e a venda do plano nunca entrava num fechamento.
  const cashRegisterId = await getOpenCashRegisterId(plan.branch_id as string)

  const agora     = new Date().toISOString()
  const descricao = 'Plano de tratamento — checkout novo paciente'

  /** Uma transação do plano; devolve o id ou aborta com erro. */
  async function lancar(campos: Record<string, unknown>) {
    return admin
      .from('financial_transactions')
      .insert({
        branch_id:   plan!.branch_id,
        client_id:   plan!.client_id,
        type:        'INCOME',
        category:    'Serviços',
        description: descricao,
        created_by:  ctx.internalUserId,
        ...campos,
      })
      .select('id')
      .single()
  }

  // 1. Dinheiro.
  //
  // O que foi RECEBIDO agora e o que ficou A RECEBER são transações separadas:
  // `revenueCash` conta INCOME pago com eixo em `paid_at`, então uma transação
  // única marcada como não paga faria a entrada sumir do caixa do dia.
  let transactionId: string | null = null

  if (pagamento.forma === 'AVISTA') {
    const { data, error } = await lancar({
      cash_register_id: cashRegisterId,
      amount:           total,
      payment_method:   pagamento.metodo,
      is_paid:          true,
      paid_at:          agora,
    })
    if (error) return { error: `Erro ao registrar pagamento: ${error.message}` }
    transactionId = data!.id as string

  } else if (pagamento.forma === 'PARCELADO') {
    const entrada = Math.max(0, Math.min(pagamento.entrada, total))
    const saldo   = Math.round((total - entrada) * 100) / 100
    const vezes   = Math.max(1, Math.min(pagamento.parcelas, 48))

    if (entrada > 0) {
      const { data, error } = await lancar({
        cash_register_id: cashRegisterId,
        amount:           entrada,
        payment_method:   pagamento.metodo,
        is_paid:          true,
        paid_at:          agora,
        notes:            'Entrada do plano de tratamento',
      })
      if (error) return { error: `Erro ao registrar a entrada: ${error.message}` }
      transactionId = data!.id as string
    }

    if (saldo > 0) {
      const { data, error } = await lancar({
        amount:         saldo,
        payment_method: pagamento.metodo,
        is_paid:        false,
        due_date:       pagamento.primeiroVencimento,
        notes:          `Saldo do plano em ${vezes}x`,
      })
      if (error) return { error: `Erro ao registrar as parcelas: ${error.message}` }
      transactionId = transactionId ?? (data!.id as string)

      // Mesmo formato das despesas parceladas (actions/financial.ts): valor
      // dividido igualmente e um vencimento por mês a partir do primeiro.
      const valorParcela = Math.round((saldo / vezes) * 100) / 100
      const base         = new Date(pagamento.primeiroVencimento)
      const { error: parcErr } = await admin.from('installments').insert(
        Array.from({ length: vezes }, (_, i) => {
          const venc = new Date(base)
          venc.setMonth(venc.getMonth() + i)
          return {
            transaction_id: data!.id as string,
            number:         i + 1,
            total:          vezes,
            amount:         valorParcela,
            due_date:       venc.toISOString(),
            is_paid:        false,
          }
        }),
      )
      if (parcErr) return { error: `Erro ao registrar as parcelas: ${parcErr.message}` }
    }

  } else {
    const { data, error } = await lancar({
      amount:         total,
      payment_method: pagamento.metodo,
      is_paid:        false,
      due_date:       pagamento.vencimento,
    })
    if (error) return { error: `Erro ao registrar o valor a receber: ${error.message}` }
    transactionId = data!.id as string
  }

  // 2. Para cada sessão: criar appointment (se agendado)
  //
  // Marcar horário na agenda é gesto de agenda: quem recebe mas não gerencia
  // agenda fecha a venda e as sessões ficam para marcar depois, em vez de a tela
  // inteira ser negada.
  const podeAgendar = can(ctx, 'agenda', 'MANAGE')
  let newAppointmentId: string | null = null

  for (const sess of sessions) {
    const sched = podeAgendar
      ? sessionSchedules.find(s => s.planSessionId === sess.id) ?? null
      : null
    let appointmentId: string | null = null

    if (sched && sess.mainProcedureId) {
      const { data: appt } = await admin
        .from('appointments')
        .insert({
          branch_id:         sched.branchId,
          client_id:         plan.client_id,
          procedure_id:      sess.mainProcedureId,
          professional_id:   sched.professionalId,
          scheduled_at:      sched.scheduledAt,
          duration_min:      sess.mainDurationMin,
          price:             sess.totalPrice,
          status:            'SCHEDULED',
          source:            'INTERNAL',
          treatment_plan_id: planId,
        })
        .select('id')
        .single()
      appointmentId = appt?.id ?? null
      if (!newAppointmentId) newAppointmentId = appointmentId
    }

    // Atualiza treatment_plan_sessions.appointment_id
    await admin
      .from('treatment_plan_sessions')
      .update({ appointment_id: appointmentId })
      .eq('id', sess.id)
  }

  // 3. Marcar plano como ACCEPTED
  await admin
    .from('treatment_plans')
    .update({ status: 'ACCEPTED', updated_at: new Date().toISOString() })
    .eq('id', planId)

  // 4. Log no appointment de avaliação
  if (plan.evaluation_appointment_id) {
    await admin.from('appointment_history').insert({
      appointment_id:    plan.evaluation_appointment_id,
      changed_by_id:     ctx.internalUserId,
      changed_by_name:   ctx.userName || ctx.roleLabel || 'Recepção',
      action:            'CHECKOUT_COMPLETED',
      description:       `Checkout concluído — R$ ${total.toFixed(2).replace('.', ',')} — ${rotuloDoPagamento(pagamento)}`,
    })
  }

  if (slug) {
    revalidatePath(`/${slug}/agenda`)
    revalidatePath(`/${slug}/checkout`)
    revalidatePath(`/${slug}/dashboard`)
  }
  revalidatePath('/admin/checkout')
  revalidatePath('/admin/dashboard')

  // A tela do atendimento de origem também muda: o plano deixa de estar
  // "aguardando checkout". Sem isto, fechar a venda ali mesmo não atualizava
  // nada — a pessoa continuava vendo o convite para fechar o que acabara de
  // fechar.
  if (plan.evaluation_appointment_id) {
    if (slug) revalidatePath(`/${slug}/agenda/${plan.evaluation_appointment_id}`)
    revalidatePath(`/admin/agenda/${plan.evaluation_appointment_id}`)
  }

  return { transactionId, newAppointmentId }
}

// -- Ficha de tratamento -------------------------------------------------------

export interface TreatmentFileSession {
  id:          string
  sortOrder:   number
  procedures:  Array<{ name: string; durationMin: number; price: number }>
  appointment: {
    id:           string
    scheduledAt:  string
    status:       string
    completedAt:  string | null
    notes:        string | null
  } | null
}

export interface TreatmentFileDetails {
  id:                   string
  status:               string
  professionalNotes:    string | null
  createdAt:            string
  professionalName:     string | null
  evaluationDate:       string | null
  evaluationComplaints: string | null
  evaluationNotes:      string | null
  sessions:             TreatmentFileSession[]
  anamnesis:            AnamnesisData | null
}

export async function getTreatmentPlanDetails(planId: string, clientId: string): Promise<{ data?: TreatmentFileDetails; error?: string }> {
  try {
    const ctx = await getTenantContext()
    assertPermission(ctx, 'agenda', 'VIEW')

    const admin = createAdminClient()

    // 1. Busca o plano (sem joins — evita erro de FK alias no PostgREST)
    const { data: plan, error: planErr } = await admin
      .from('treatment_plans')
      .select('id, status, professional_notes, created_at, professional_id, evaluation_appointment_id')
      .eq('id', planId)
      .eq('client_id', clientId)
      .single()

    if (planErr || !plan) return { error: 'Plano não encontrado.' }

    // 2. Busca em paralelo: profissional, avaliação, sessões, agendamentos e anamnese
    const [
      { data: professional },
      { data: evalAppt },
      { data: sessionsRaw },
      { data: appts },
      { data: medRecord },
    ] = await Promise.all([
      plan.professional_id
        ? admin.from('users').select('name').eq('id', plan.professional_id).single()
        : Promise.resolve({ data: null }),

      plan.evaluation_appointment_id
        ? admin.from('appointments').select('id, scheduled_at, notes').eq('id', plan.evaluation_appointment_id).single()
        : Promise.resolve({ data: null }),

      admin.from('treatment_plan_sessions')
        .select('id, sort_order, treatment_plan_session_procedures(procedure_id, price, procedures(name, duration_min))')
        .eq('plan_id', planId)
        .order('sort_order'),

      admin.from('appointments')
        .select('id, scheduled_at, status, completed_at, notes')
        .eq('treatment_plan_id', planId)
        .order('scheduled_at'),

      admin.from('medical_records')
        .select('general_anamnesis')
        .eq('client_id', clientId)
        .maybeSingle(),
    ])

    // 3. Zipa sessões com agendamentos pela ordem (sort_order ↔ scheduled_at asc)
    const sortedAppts = (appts ?? []).slice().sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))
    const sessions: TreatmentFileSession[] = (sessionsRaw ?? []).map((s, i) => {
      type RawProc = { procedure_id: string; price: number; procedures: { name: string; duration_min: number } | null }
      const procs = (s.treatment_plan_session_procedures as unknown as RawProc[] | null) ?? []
      const appt  = sortedAppts[i] ?? null
      return {
        id:        s.id,
        sortOrder: s.sort_order,
        procedures: procs.map(p => ({
          name:        p.procedures?.name ?? '—',
          durationMin: p.procedures?.duration_min ?? 60,
          price:       Number(p.price ?? 0),
        })),
        appointment: appt ? {
          id:          appt.id,
          scheduledAt: appt.scheduled_at,
          status:      appt.status,
          completedAt: appt.completed_at ?? null,
          notes:       appt.notes ?? null,
        } : null,
      }
    })

    return {
      data: {
        id:                   plan.id,
        status:               plan.status,
        professionalNotes:    plan.professional_notes ?? null,
        createdAt:            plan.created_at,
        professionalName:     (professional as { name?: string } | null)?.name ?? null,
        evaluationDate:       (evalAppt as { scheduled_at?: string } | null)?.scheduled_at ?? null,
        evaluationComplaints: (evalAppt as { notes?: string } | null)?.notes ?? null,
        evaluationNotes:      null,
        sessions,
        anamnesis:            (medRecord?.general_anamnesis as AnamnesisData | null) ?? null,
      },
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Erro inesperado.' }
  }
}
