'use server'

import { revalidatePath } from 'next/cache'
import { getTenantContext, assertPermission, can } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { injectableTotals, emptyInjectableMap, type InjectableMapValue } from '@/lib/anamnesis'

/**
 * Planejamento de injetáveis.
 *
 * Começou como um campo dentro da ficha de UM atendimento: no atendimento
 * seguinte recomeçava do zero. Virou um mapa vivo por cliente. Desde 2026-09-18
 * é um **planejamento com nome**, no mesmo desenho do plano de tratamento:
 *
 *   • tem nome próprio e é achado por ele;
 *   • o cliente é OPCIONAL — dá para planejar avulso (avaliação por foto,
 *     orçamento no balcão) e ligar depois;
 *   • um cliente pode ter vários ao longo do tempo.
 *
 * E as APLICAÇÕES, que são outra coisa: cópia congelada do que foi aplicado num
 * atendimento, documento de prontuário, nunca reescrita. Por isso registrar
 * aplicação exige cliente, mesmo que planejar não exija.
 */

export interface AplicacaoInjetavel {
  id:             string
  appointmentId:  string | null
  appliedAt:      string
  profissional:   string | null
  notes:          string | null
  mapa:           InjectableMapValue
  totais:         { product: string; unit: string; planned: number; applied: number }[]
}

/** Um planejamento aberto para edição. */
export interface PlanejamentoInjetavel {
  id:          string
  nome:        string
  clientId:    string | null
  clientName:  string | null
  unidade:     string | null
  mapa:        InjectableMapValue
  aplicacoes:  AplicacaoInjetavel[]
}

/** Uma linha da lista de Injetáveis. */
export interface MapaNaLista {
  id:           string
  nome:         string
  clientId:     string | null
  clientName:   string | null
  clientPhone:  string | null
  unidade:      string | null
  pontos:       number
  produtos:     string[]
  atualizadoEm: string | null
  /** Última aplicação registrada — o que separa "planejado" de "aplicado". */
  ultimaAplicacao: string | null
  aplicacoes:      number
}

const SEM_NOME = 'Planejamento sem nome'

/** Confere que o planejamento é do tenant de quem chama. */
async function mapaDoTenant(
  admin: ReturnType<typeof createAdminClient>,
  mapId: string,
  tenantId: string,
) {
  const { data } = await admin
    .from('injectable_maps')
    .select('id, tenant_id, client_id, branch_id, name')
    .eq('id', mapId)
    .maybeSingle()
  return data && data.tenant_id === tenantId ? data : null
}

/** Confere que o cliente é do tenant de quem chama. */
async function clienteDoTenant(
  admin: ReturnType<typeof createAdminClient>,
  clientId: string,
  tenantId: string,
) {
  const { data } = await admin
    .from('clients')
    .select('id, tenant_id, branch_id')
    .eq('id', clientId)
    .maybeSingle()
  return data && data.tenant_id === tenantId ? data : null
}

/**
 * Cria um planejamento. Sem cliente é planejamento avulso — é só o nome que o
 * identifica até alguém ligá-lo a uma pessoa.
 */
export async function criarPlanejamentoInjetavel({
  nome, clientId = null, branchId = null,
}: {
  nome:      string
  clientId?: string | null
  branchId?: string | null
}): Promise<{ id?: string; error?: string }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'medical_records', 'MANAGE')
  const admin = createAdminClient()

  const titulo = nome.trim()
  if (!titulo) return { error: 'Dê um nome ao planejamento.' }

  let filial = branchId
  if (clientId) {
    const cliente = await clienteDoTenant(admin, clientId, ctx.tenantId!)
    if (!cliente) return { error: 'Cliente não encontrado.' }
    // A unidade do planejamento é a de onde ele está sendo feito; sem ela, a de
    // cadastro do cliente. Cliente é da rede, então isso pode ser nulo.
    filial = filial || (cliente.branch_id as string | null)
  }

  const { data, error } = await admin
    .from('injectable_maps')
    .insert({
      tenant_id:  ctx.tenantId!,
      client_id:  clientId,
      branch_id:  filial,
      name:       titulo,
      view:       'front',
      points:     [],
      updated_by: ctx.internalUserId,
    })
    .select('id')
    .single()

  if (error || !data) return { error: `Erro ao criar o planejamento: ${error?.message}` }

  revalidatePath('/admin/injetaveis')
  return { id: data.id as string }
}

/** Um planejamento com o mapa e as aplicações do cliente dele. */
export async function getPlanejamentoInjetavel(mapId: string): Promise<{
  planejamento?: PlanejamentoInjetavel
  error?: string
}> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'medical_records', 'VIEW')
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('injectable_maps')
    .select('id, tenant_id, name, client_id, view, points, clients(name), branches(name)')
    .eq('id', mapId)
    .maybeSingle()

  if (error) return { error: `Não foi possível abrir o planejamento: ${error.message}` }
  if (!data || data.tenant_id !== ctx.tenantId) return { error: 'Planejamento não encontrado.' }

  const clientId = (data.client_id as string | null) ?? null

  // As aplicações são do CLIENTE, não do planejamento: quem abre um mapa novo
  // precisa ver o que já foi aplicado antes, senão planeja em cima do escuro.
  const aplicacoes = clientId ? await aplicacoesDoCliente(admin, clientId) : []

  return {
    planejamento: {
      id:         data.id as string,
      nome:       (data.name as string | null) ?? SEM_NOME,
      clientId,
      clientName: (data.clients as { name?: string } | null)?.name ?? null,
      unidade:    (data.branches as { name?: string } | null)?.name ?? null,
      mapa: {
        ...emptyInjectableMap(),
        view:   (data.view as InjectableMapValue['view']) ?? 'front',
        points: (data.points as InjectableMapValue['points']) ?? [],
      },
      aplicacoes,
    },
  }
}

async function aplicacoesDoCliente(
  admin: ReturnType<typeof createAdminClient>,
  clientId: string,
): Promise<AplicacaoInjetavel[]> {
  const { data } = await admin
    .from('injectable_applications')
    .select('id, appointment_id, applied_at, notes, view, points, totals, users(name)')
    .eq('client_id', clientId)
    .order('applied_at', { ascending: false })

  return (data ?? []).map((a: any) => ({
    id:            a.id as string,
    appointmentId: (a.appointment_id as string | null) ?? null,
    appliedAt:     a.applied_at as string,
    profissional:  (a.users as { name?: string } | null)?.name ?? null,
    notes:         (a.notes as string | null) ?? null,
    mapa: {
      ...emptyInjectableMap(),
      view:   (a.view as InjectableMapValue['view']) ?? 'front',
      points: (a.points as InjectableMapValue['points']) ?? [],
    },
    totais: (a.totals as AplicacaoInjetavel['totais']) ?? [],
  }))
}

/** Salva o desenho — o planejamento é reescrito à vontade. */
export async function salvarPlanejamentoInjetavel(
  mapId: string,
  mapa: InjectableMapValue,
  slug: string,
): Promise<{ error?: string }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'medical_records', 'MANAGE')
  const admin = createAdminClient()

  const plano = await mapaDoTenant(admin, mapId, ctx.tenantId!)
  if (!plano) return { error: 'Planejamento não encontrado.' }

  const { error } = await admin
    .from('injectable_maps')
    .update({
      view:       mapa.view ?? 'front',
      points:     mapa.points ?? [],
      updated_by: ctx.internalUserId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', mapId)

  if (error) return { error: error.message }

  revalidarPlanejamento(slug, plano.client_id as string | null)
  return {}
}

export async function renomearPlanejamentoInjetavel(
  mapId: string,
  nome: string,
): Promise<{ error?: string }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'medical_records', 'MANAGE')
  const admin = createAdminClient()

  const plano = await mapaDoTenant(admin, mapId, ctx.tenantId!)
  if (!plano) return { error: 'Planejamento não encontrado.' }
  if (!nome.trim()) return { error: 'Dê um nome ao planejamento.' }

  const { error } = await admin
    .from('injectable_maps')
    .update({ name: nome.trim(), updated_at: new Date().toISOString() })
    .eq('id', mapId)

  if (error) return { error: error.message }

  revalidatePath('/admin/injetaveis')
  return {}
}

/** Liga o planejamento avulso a um cliente. */
export async function vincularClienteAoPlanejamento(
  mapId: string,
  clientId: string,
): Promise<{ error?: string }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'medical_records', 'MANAGE')
  const admin = createAdminClient()

  const plano = await mapaDoTenant(admin, mapId, ctx.tenantId!)
  if (!plano) return { error: 'Planejamento não encontrado.' }

  const cliente = await clienteDoTenant(admin, clientId, ctx.tenantId!)
  if (!cliente) return { error: 'Cliente não encontrado.' }

  const { error } = await admin
    .from('injectable_maps')
    .update({
      client_id:  clientId,
      // Sem unidade própria, herda a do cliente — é ela que a lista mostra.
      branch_id:  (plano.branch_id as string | null) ?? (cliente.branch_id as string | null),
      updated_at: new Date().toISOString(),
    })
    .eq('id', mapId)

  if (error) return { error: error.message }

  revalidatePath('/admin/injetaveis')
  revalidatePath(`/admin/clients/${clientId}`)
  return {}
}

/**
 * Congela o que foi aplicado num atendimento.
 *
 * O planejamento continua editável depois disso: é a diferença entre planejar a
 * próxima aplicação e registrar a que aconteceu. Exige cliente — aplicação é
 * prontuário, e prontuário é de alguém.
 */
export async function registrarAplicacao(
  mapId: string,
  appointmentId: string | null,
  mapa: InjectableMapValue,
  notes: string | null,
  slug: string,
): Promise<{ error?: string; id?: string }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'medical_records', 'MANAGE')
  const admin = createAdminClient()

  const plano = await mapaDoTenant(admin, mapId, ctx.tenantId!)
  if (!plano) return { error: 'Planejamento não encontrado.' }

  const clientId = plano.client_id as string | null
  if (!clientId) {
    return { error: 'Ligue o planejamento a um cliente antes de registrar a aplicação.' }
  }
  if ((mapa.points ?? []).length === 0) {
    return { error: 'Marque ao menos um ponto antes de registrar a aplicação.' }
  }

  const { data, error } = await admin
    .from('injectable_applications')
    .insert({
      client_id:       clientId,
      map_id:          mapId,
      appointment_id:  appointmentId,
      professional_id: ctx.internalUserId,
      view:            mapa.view ?? 'front',
      points:          mapa.points,
      totals:          injectableTotals(mapa),
      notes:           notes?.trim() || null,
    })
    .select('id')
    .single()

  if (error || !data) return { error: `Erro ao registrar a aplicação: ${error?.message}` }

  revalidarPlanejamento(slug, clientId)
  if (appointmentId) {
    if (slug) revalidatePath(`/${slug}/agenda/${appointmentId}`)
    revalidatePath(`/admin/agenda/${appointmentId}`)
  }

  return { id: data.id as string }
}

function revalidarPlanejamento(slug: string, clientId: string | null) {
  if (clientId) {
    if (slug) revalidatePath(`/${slug}/clients/${clientId}`)
    revalidatePath(`/admin/clients/${clientId}`)
  }
  if (slug) revalidatePath(`/${slug}/injetaveis`)
  revalidatePath('/admin/injetaveis')
}

/** Quem pode editar — para a tela decidir o que mostrar. */
export async function podeEditarMapa(): Promise<boolean> {
  const ctx = await getTenantContext()
  return can(ctx, 'medical_records', 'MANAGE')
}

/** Os planejamentos de um cliente — a aba na ficha e o atendimento. */
export async function listarPlanejamentosDoCliente(clientId: string): Promise<{
  mapas: MapaNaLista[]
  error?: string
}> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'medical_records', 'VIEW')
  const admin = createAdminClient()

  if (!(await clienteDoTenant(admin, clientId, ctx.tenantId!))) {
    return { mapas: [], error: 'Cliente não encontrado.' }
  }

  const { data, error } = await admin
    .from('injectable_maps')
    .select('id, name, client_id, points, updated_at, clients(name, phone), branches(name)')
    .eq('client_id', clientId)
    .order('updated_at', { ascending: false })

  if (error) return { mapas: [], error: `Não foi possível carregar: ${error.message}` }

  const aplicacoes = await contarAplicacoes(admin, [clientId])
  return { mapas: (data ?? []).map(l => linhaDaLista(l as any, aplicacoes)) }
}

/**
 * Todos os planejamentos da rede/unidade.
 *
 * A busca acha pelo NOME (o único jeito enquanto não há cliente) e pelos dados
 * de quem já está ligado. `branchId` nulo = a rede inteira.
 */
export async function listarMapasDeInjetaveis({ branchId }: { branchId: string | null }): Promise<{
  mapas: MapaNaLista[]
  error?: string
}> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'medical_records', 'VIEW')
  const admin = createAdminClient()

  let q = admin
    .from('injectable_maps')
    .select('id, name, client_id, points, updated_at, clients(name, phone), branches(name)')
    .eq('tenant_id', ctx.tenantId!)
    .order('updated_at', { ascending: false })
    .limit(300)
  // Planejamento avulso não tem unidade: ele aparece em qualquer recorte, senão
  // sumiria da tela exatamente de quem acabou de criá-lo.
  if (branchId) q = q.or(`branch_id.eq.${branchId},branch_id.is.null`)

  const { data, error } = await q
  if (error) return { mapas: [], error: `Não foi possível carregar os planejamentos: ${error.message}` }

  const linhas = (data ?? []) as any[]
  const ids = linhas.map(l => l.client_id).filter(Boolean) as string[]
  const aplicacoes = await contarAplicacoes(admin, ids)

  return { mapas: linhas.map(l => linhaDaLista(l, aplicacoes)) }
}

type ResumoAplicacoes = Map<string, { ultima: string; total: number }>

async function contarAplicacoes(
  admin: ReturnType<typeof createAdminClient>,
  clientIds: string[],
): Promise<ResumoAplicacoes> {
  const porCliente: ResumoAplicacoes = new Map()
  if (clientIds.length === 0) return porCliente

  const { data } = await admin
    .from('injectable_applications')
    .select('client_id, applied_at')
    .in('client_id', clientIds)
    .order('applied_at', { ascending: false })

  for (const a of (data ?? []) as { client_id: string; applied_at: string }[]) {
    const atual = porCliente.get(a.client_id)
    // A consulta vem da mais recente para a mais antiga: a primeira de cada
    // cliente é a última aplicação dele.
    if (!atual) porCliente.set(a.client_id, { ultima: a.applied_at, total: 1 })
    else atual.total++
  }
  return porCliente
}

function linhaDaLista(l: any, aplicacoes: ResumoAplicacoes): MapaNaLista {
  const pontos = (l.points as InjectableMapValue['points']) ?? []
  const produtos = [...new Set(pontos.map(p => p.product?.trim()).filter(Boolean) as string[])]
  const clientId = (l.client_id as string | null) ?? null
  const ap = clientId ? aplicacoes.get(clientId) : undefined

  return {
    id:              l.id as string,
    nome:            (l.name as string | null) ?? SEM_NOME,
    clientId,
    clientName:      (l.clients as { name?: string } | null)?.name ?? null,
    clientPhone:     (l.clients as { phone?: string } | null)?.phone ?? null,
    unidade:         (l.branches as { name?: string } | null)?.name ?? null,
    pontos:          pontos.length,
    produtos,
    atualizadoEm:    (l.updated_at as string | null) ?? null,
    ultimaAplicacao: ap?.ultima ?? null,
    aplicacoes:      ap?.total ?? 0,
  }
}
