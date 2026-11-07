import 'server-only'
import type { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'

/**
 * Agendar usando o que o cliente JÁ PAGOU (fase 3 de "Vender", 2026-09-30):
 * uma unidade de procedimento pré-pago (`procedure_sale_units`) ou uma sessão
 * de pacote (`package_sessions`). O crédito decide o procedimento e o preço do
 * agendamento, e fica ligado a ele (`appointment_id`) — é essa ligação que faz
 * a conclusão usar o crédito, a recepção não cobrar e a comissão sair da venda.
 *
 * Mora fora de `actions/` (todo export de lá é endpoint). O núcleo do
 * agendamento (`createAppointmentCore`) é quem usa: agenda, inbox e a ficha
 * passam por ele, com conflito de horário, histórico e evento.
 */

type Admin = ReturnType<typeof createAdminClient>

/**
 * `PLANO` (A18 e D5 da 9ª simulação, 2026-11-07): a sessão LIVRE de um plano
 * fechado — "os dois são, em essencia, conjuntos de procedimentos" (decisão 2
 * do Heitor). Ela decide o procedimento (o primeiro da sessão), o preço (a soma
 * dos procedimentos dela no plano, com o desconto) e a DURAÇÃO (a soma das
 * durações): o modal das sessões mandava o preço e a duração da sessão vizinha.
 */
export type TipoDeCredito = 'PRE_PAGO' | 'PACOTE' | 'PLANO'
export interface CreditoDeAgendamento { tipo: TipoDeCredito; id: string }

const UUID = /^[0-9a-f-]{36}$/i
const TIPOS: readonly string[] = ['PRE_PAGO', 'PACOTE', 'PLANO']

/** "PRE_PAGO:<id>" (do formulário) ou { tipo, id } → o crédito, ou null. */
export function lerCredito(v: unknown): CreditoDeAgendamento | null {
  if (typeof v === 'string') {
    const [tipo, id] = v.split(':')
    return tipo && TIPOS.includes(tipo) && id && UUID.test(id) ? { tipo: tipo as TipoDeCredito, id } : null
  }
  if (v && typeof v === 'object') {
    const { tipo, id } = v as Record<string, unknown>
    return typeof tipo === 'string' && TIPOS.includes(tipo) && typeof id === 'string' && UUID.test(id) ? { tipo: tipo as TipoDeCredito, id } : null
  }
  return null
}

/** O que a sessão de um plano vale para o agendamento: o procedimento principal, o preço e a duração dela. */
export interface ValoresDaSessaoDoPlano { procedureId: string; preco: number; duracaoMin: number }

/**
 * A sessão do plano → os valores do agendamento dela (pura): o PRIMEIRO
 * procedimento (pela ordem), a soma dos preços no plano (em centavos) e a soma
 * das durações (60 min no procedimento sem duração) — a conta do checkout
 * (`getTreatmentPlanSessions`).
 */
export function valoresDaSessaoDoPlano(
  procs: { procedure_id: string; price: number | string | null; sort_order: number | null; duracao: number | null }[],
): ValoresDaSessaoDoPlano | null {
  const ordem = [...procs].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  if (!ordem[0]) return null
  return {
    procedureId: ordem[0].procedure_id,
    preco:       Math.round(ordem.reduce((t, p) => t + Number(p.price ?? 0) * 100, 0)) / 100,
    duracaoMin:  ordem.reduce((t, p) => t + (p.duracao ?? 60), 0),
  }
}

/**
 * Confere que o crédito é DESTE cliente, da rede, livre (sem agendamento) e
 * dentro da validade; devolve o procedimento e o preço dele (e, na sessão do
 * plano, a duração e o plano).
 */
export async function conferirCredito(
  admin: Admin, tenantId: string, clientId: string, c: CreditoDeAgendamento,
): Promise<{ procedureId: string; preco: number; duracaoMin?: number; planoId?: string } | { error: string }> {
  const agora = Date.now()
  if (c.tipo === 'PLANO') {
    const s = await ler(admin.from('treatment_plan_sessions')
      .select('appointment_id, plan_id, treatment_plans!inner(status, client_id, branches!inner(tenant_id)), treatment_plan_session_procedures(procedure_id, price, sort_order, procedures(duration_min))')
      .eq('id', c.id).maybeSingle(), 'buscar a sessão do plano')
    const tp = s?.treatment_plans as unknown as { status: string; client_id: string | null; branches: { tenant_id: string } } | undefined
    if (!s || tp?.branches.tenant_id !== tenantId || tp.client_id !== clientId) return { error: 'Crédito não encontrado para este cliente.' }
    if (tp.status !== 'ACCEPTED') return { error: 'Este plano não está em andamento: a sessão não se agenda.' }
    if (s.appointment_id) return { error: 'Esta sessão já foi feita ou agendada.' }
    type P = { procedure_id: string; price: number; sort_order: number; procedures: { duration_min: number | null } | null }
    const v = valoresDaSessaoDoPlano(((s.treatment_plan_session_procedures ?? []) as unknown as P[])
      .map(p => ({ procedure_id: p.procedure_id, price: p.price, sort_order: p.sort_order, duracao: p.procedures?.duration_min ?? null })))
    if (!v) return { error: 'A sessão do plano não tem procedimento.' }
    return { ...v, planoId: s.plan_id as string }
  }
  if (c.tipo === 'PRE_PAGO') {
    const u = await ler(admin.from('procedure_sale_units')
      .select('status, appointment_id, preco, procedure_sales!inner(tenant_id, client_id, procedure_id, expires_at)')
      .eq('id', c.id).maybeSingle(), 'buscar a unidade pré-paga')
    const venda = u?.procedure_sales as unknown as { tenant_id: string; client_id: string; procedure_id: string; expires_at: string | null } | undefined
    if (!u || venda?.tenant_id !== tenantId || venda.client_id !== clientId) return { error: 'Crédito não encontrado para este cliente.' }
    if (u.status !== 'DISPONIVEL' || u.appointment_id) return { error: 'Este crédito já foi usado ou agendado.' }
    if (venda.expires_at && new Date(venda.expires_at).getTime() < agora) return { error: 'Este crédito venceu.' }
    return { procedureId: venda.procedure_id, preco: Number(u.preco) }
  }
  const s = await ler(admin.from('package_sessions')
    .select('status, appointment_id, procedure_id, preco, client_packages!inner(client_id, price, total_sessions, expires_at, branches!inner(tenant_id), service_packages(procedure_id, price, total_sessions))')
    .eq('id', c.id).maybeSingle(), 'buscar a sessão do pacote')
  const cp = s?.client_packages as unknown as {
    client_id: string; price: number | null; total_sessions: number; expires_at: string | null
    branches: { tenant_id: string }; service_packages: { procedure_id: string | null; price: number; total_sessions: number } | null
  } | undefined
  if (!s || cp?.branches.tenant_id !== tenantId || cp.client_id !== clientId) return { error: 'Crédito não encontrado para este cliente.' }
  if (s.status !== 'AVAILABLE' || s.appointment_id) return { error: 'Esta sessão já foi usada ou agendada.' }
  if (cp.expires_at && new Date(cp.expires_at).getTime() < agora) return { error: 'Este pacote venceu.' }
  const procedureId = (s.procedure_id as string | null) ?? cp.service_packages?.procedure_id ?? null
  if (!procedureId) return { error: 'A sessão do pacote não tem procedimento.' }
  // A parte da sessão no rateio da venda; pacote de antes do rateio: preço ÷ sessões.
  const preco = s.preco != null
    ? Number(s.preco)
    : Math.round(Number(cp.price ?? cp.service_packages?.price ?? 0) * 100 / Math.max(1, cp.total_sessions)) / 100
  return { procedureId, preco }
}

/**
 * Liga o crédito ao agendamento, só se ainda estiver livre (compare-and-swap:
 * dois agendamentos ao mesmo tempo não usam o mesmo crédito). Devolve se ligou.
 */
export async function ligarCredito(admin: Admin, c: CreditoDeAgendamento, appointmentId: string): Promise<boolean> {
  if (c.tipo === 'PLANO') {
    const { data, error } = await admin.from('treatment_plan_sessions')
      .update({ appointment_id: appointmentId })
      .eq('id', c.id).is('appointment_id', null)
      .select('id')
    if (error) throw new Error(`Erro ao ligar a sessão do plano: ${error.message}`)
    return (data ?? []).length > 0
  }
  const tabela = c.tipo === 'PRE_PAGO' ? 'procedure_sale_units' : 'package_sessions'
  const livre = c.tipo === 'PRE_PAGO' ? 'DISPONIVEL' : 'AVAILABLE'
  const { data, error } = await admin.from(tabela)
    .update({ appointment_id: appointmentId })
    .eq('id', c.id).eq('status', livre).is('appointment_id', null)
    .select('id')
  if (error) throw new Error(`Erro ao ligar o crédito: ${error.message}`)
  return (data ?? []).length > 0
}

export interface CreditoParaAgendar {
  tipo:         TipoDeCredito
  /** A próxima unidade/sessão livre deste grupo — é ela que o agendamento usa. */
  id:           string
  procedureId:  string
  procedimento: string
  /** "Pré-pago" ou o nome do pacote. */
  origem:       string
  preco:        number
  restantes:    number
  venceEm:      string | null
  /** O número da sessão/unidade que o agendamento vai usar e o total da venda ("sessão 2 de 3", D10 da 8ª). */
  numero?:      number
  total?:       number
  /** A duração do agendamento, quando não é a do procedimento (a sessão do plano: a soma da sessão). */
  duracaoMin?:  number
}

/**
 * O que o cliente tem para agendar: por venda de pré-pago e por procedimento
 * de cada pacote, a próxima unidade/sessão livre (sem agendamento e dentro da
 * validade) e quantas restam.
 */
export async function creditosDoCliente(admin: Admin, tenantId: string, clientId: string): Promise<CreditoParaAgendar[]> {
  const agora = Date.now()
  const valido = (vence: string | null) => !vence || new Date(vence).getTime() >= agora
  const [vendas, pacotes, planos] = await Promise.all([
    ler(admin.from('procedure_sales')
      .select('procedure_id, expires_at, sold_at, procedures(name), procedure_sale_units(id, numero, preco, status, appointment_id)')
      .eq('tenant_id', tenantId).eq('client_id', clientId).order('sold_at'), 'buscar os pré-pagos do cliente'),
    ler(admin.from('client_packages')
      .select('id, expires_at, price, total_sessions, purchased_at, branches!inner(tenant_id), service_packages(name, procedure_id), package_sessions(id, session_number, procedure_id, preco, status, appointment_id, procedures(name))')
      .eq('client_id', clientId).eq('branches.tenant_id', tenantId).order('purchased_at'), 'buscar os pacotes do cliente'),
    // A18 da 9ª: as sessões livres dos planos FECHADOS (o "+ Agendar" da ficha as oferecia só pelo cartão do tratamento).
    ler(admin.from('treatment_plans')
      .select('id, created_at, branches!inner(tenant_id), treatment_plan_sessions(id, sort_order, appointment_id, treatment_plan_session_procedures(procedure_id, price, sort_order, procedures(name, duration_min)))')
      .eq('client_id', clientId).eq('status', 'ACCEPTED').eq('branches.tenant_id', tenantId).order('created_at'), 'buscar os planos do cliente'),
  ])
  const saida: CreditoParaAgendar[] = []

  type U = { id: string; numero: number; preco: number; status: string; appointment_id: string | null }
  for (const v of (vendas ?? []) as unknown as { procedure_id: string; expires_at: string | null; procedures: { name: string } | null; procedure_sale_units: U[] }[]) {
    if (!valido(v.expires_at)) continue
    const livres = (v.procedure_sale_units ?? []).filter(u => u.status === 'DISPONIVEL' && !u.appointment_id).sort((a, b) => a.numero - b.numero)
    if (!livres.length) continue
    saida.push({
      tipo: 'PRE_PAGO', id: livres[0]!.id, procedureId: v.procedure_id, procedimento: v.procedures?.name ?? 'Procedimento',
      origem: 'Pré-pago', preco: Number(livres[0]!.preco), restantes: livres.length, venceEm: v.expires_at,
      numero: livres[0]!.numero, total: (v.procedure_sale_units ?? []).length,
    })
  }

  type S = { id: string; session_number: number; procedure_id: string | null; preco: number | null; status: string; appointment_id: string | null; procedures: { name: string } | null }
  for (const p of (pacotes ?? []) as unknown as {
    id: string; expires_at: string | null; price: number | null; total_sessions: number
    service_packages: { name: string; procedure_id: string | null } | null; package_sessions: S[]
  }[]) {
    if (!valido(p.expires_at)) continue
    const livres = (p.package_sessions ?? []).filter(s => s.status === 'AVAILABLE' && !s.appointment_id).sort((a, b) => a.session_number - b.session_number)
    const porProcedimento = new Map<string, S[]>()
    for (const s of livres) {
      const proc = s.procedure_id ?? p.service_packages?.procedure_id
      if (!proc) continue
      porProcedimento.set(proc, [...(porProcedimento.get(proc) ?? []), s])
    }
    for (const [procedureId, sessoes] of porProcedimento) {
      const primeira = sessoes[0]!
      saida.push({
        tipo: 'PACOTE', id: primeira.id, procedureId, procedimento: primeira.procedures?.name ?? 'Procedimento',
        origem: p.service_packages?.name ?? 'Pacote',
        preco: primeira.preco != null ? Number(primeira.preco) : Math.round(Number(p.price ?? 0) * 100 / Math.max(1, p.total_sessions)) / 100,
        restantes: sessoes.length, venceEm: p.expires_at,
        numero: primeira.session_number, total: p.total_sessions,
      })
    }
  }

  // Os planos: por procedimento principal, a próxima sessão livre (a ordem do plano).
  type SP = { procedure_id: string; price: number; sort_order: number; procedures: { name: string; duration_min: number | null } | null }
  type SS = { id: string; sort_order: number; appointment_id: string | null; treatment_plan_session_procedures: SP[] }
  for (const pl of (planos ?? []) as unknown as { id: string; treatment_plan_sessions: SS[] }[]) {
    const todas = [...(pl.treatment_plan_sessions ?? [])].sort((a, b) => a.sort_order - b.sort_order)
    const porProcedimento = new Map<string, { s: SS; numero: number; v: ValoresDaSessaoDoPlano; nome: string }[]>()
    todas.forEach((s, i) => {
      if (s.appointment_id) return
      const procs = s.treatment_plan_session_procedures ?? []
      const v = valoresDaSessaoDoPlano(procs.map(p => ({ procedure_id: p.procedure_id, price: p.price, sort_order: p.sort_order, duracao: p.procedures?.duration_min ?? null })))
      if (!v) return
      const nomes = [...procs].sort((a, b) => a.sort_order - b.sort_order).map(p => p.procedures?.name ?? 'Procedimento')
      porProcedimento.set(v.procedureId, [...(porProcedimento.get(v.procedureId) ?? []), { s, numero: i + 1, v, nome: [...new Set(nomes)].join(' + ') }])
    })
    for (const [procedureId, livres] of porProcedimento) {
      const primeira = livres[0]!
      saida.push({
        tipo: 'PLANO', id: primeira.s.id, procedureId, procedimento: primeira.nome,
        origem: 'Plano de tratamento', preco: primeira.v.preco, restantes: livres.length, venceEm: null,
        numero: primeira.numero, total: todas.length, duracaoMin: primeira.v.duracaoMin,
      })
    }
  }
  return saida
}
