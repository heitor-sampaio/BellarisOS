'use server'

import { revalidatePath } from 'next/cache'
import { getTenantContext, assertPermission, can } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { injectableTotals, emptyInjectableMap, type InjectableMapValue } from '@/lib/anamnesis'

/**
 * Mapa de injetáveis do cliente.
 *
 * Era um campo dentro da ficha de UM atendimento: no atendimento seguinte
 * começava do zero e não havia como comparar com o que foi aplicado antes.
 *
 * Aqui são duas coisas: o mapa VIVO (planejamento atual, um por cliente, que se
 * edita à vontade) e as APLICAÇÕES (cópia congelada do que foi aplicado num
 * atendimento — documento de prontuário, nunca reescrito).
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

/** O mapa vivo + o histórico de aplicações do cliente. */
export async function getMapaDoCliente(clientId: string): Promise<{
  mapa?: InjectableMapValue
  aplicacoes?: AplicacaoInjetavel[]
  error?: string
}> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'medical_records', 'VIEW')
  const admin = createAdminClient()

  if (!(await clienteDoTenant(admin, clientId, ctx.tenantId!))) {
    return { error: 'Cliente não encontrado.' }
  }

  const [{ data: mapaRaw }, { data: apsRaw }] = await Promise.all([
    admin.from('injectable_maps').select('view, points').eq('client_id', clientId).maybeSingle(),
    admin
      .from('injectable_applications')
      .select('id, appointment_id, applied_at, notes, view, points, totals, users!professional_id(name)')
      .eq('client_id', clientId)
      .order('applied_at', { ascending: false }),
  ])

  const mapa: InjectableMapValue = mapaRaw
    ? { view: 'front', points: (mapaRaw.points as InjectableMapValue['points']) ?? [], confirmedAt: null }
    : emptyInjectableMap()

  const aplicacoes: AplicacaoInjetavel[] = (apsRaw ?? []).map(a => ({
    id:            a.id as string,
    appointmentId: (a.appointment_id as string | null) ?? null,
    appliedAt:     a.applied_at as string,
    profissional:  (a.users as unknown as { name?: string } | null)?.name ?? null,
    notes:         (a.notes as string | null) ?? null,
    mapa:          { view: 'front', points: (a.points as InjectableMapValue['points']) ?? [], confirmedAt: a.applied_at as string },
    totais:        (a.totals as AplicacaoInjetavel['totais']) ?? [],
  }))

  return { mapa, aplicacoes }
}

/** Salva o planejamento — o mapa vivo, que pode ser reescrito à vontade. */
export async function salvarMapaDoCliente(
  clientId: string,
  mapa: InjectableMapValue,
  slug: string,
): Promise<{ error?: string }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'medical_records', 'MANAGE')
  const admin = createAdminClient()

  const cliente = await clienteDoTenant(admin, clientId, ctx.tenantId!)
  if (!cliente) return { error: 'Cliente não encontrado.' }

  const { error } = await admin
    .from('injectable_maps')
    .upsert({
      client_id:  clientId,
      branch_id:  cliente.branch_id,
      view:       mapa.view ?? 'front',
      points:     mapa.points ?? [],
      updated_by: ctx.internalUserId,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'client_id' })

  if (error) return { error: error.message }

  if (slug) revalidatePath(`/${slug}/clients/${clientId}`)
  revalidatePath(`/admin/clients/${clientId}`)
  return {}
}

/**
 * Congela o que foi aplicado num atendimento.
 *
 * O mapa vivo continua editável depois disso: é justamente a diferença entre
 * planejar a próxima aplicação e registrar a que aconteceu.
 */
export async function registrarAplicacao(
  clientId: string,
  appointmentId: string | null,
  mapa: InjectableMapValue,
  notes: string | null,
  slug: string,
): Promise<{ error?: string; id?: string }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'medical_records', 'MANAGE')
  const admin = createAdminClient()

  if (!(await clienteDoTenant(admin, clientId, ctx.tenantId!))) {
    return { error: 'Cliente não encontrado.' }
  }
  if ((mapa.points ?? []).length === 0) {
    return { error: 'Marque ao menos um ponto antes de registrar a aplicação.' }
  }

  const { data, error } = await admin
    .from('injectable_applications')
    .insert({
      client_id:       clientId,
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

  if (slug) {
    revalidatePath(`/${slug}/clients/${clientId}`)
    if (appointmentId) revalidatePath(`/${slug}/agenda/${appointmentId}`)
  }
  revalidatePath(`/admin/clients/${clientId}`)
  if (appointmentId) revalidatePath(`/admin/agenda/${appointmentId}`)

  return { id: data.id as string }
}

/** Quem pode editar o mapa — para a tela decidir o que mostrar. */
export async function podeEditarMapa(): Promise<boolean> {
  const ctx = await getTenantContext()
  return can(ctx, 'medical_records', 'MANAGE')
}

/** Uma linha da tela de Injetáveis: o cliente e o estado do mapa dele. */
export interface MapaNaLista {
  clientId:     string
  clientName:   string
  clientPhone:  string | null
  unidade:      string | null
  pontos:       number
  produtos:     string[]
  atualizadoEm: string | null
  /** Última aplicação registrada — o que separa "planejado" de "aplicado". */
  ultimaAplicacao: string | null
  aplicacoes:      number
}

/**
 * Quem tem mapa de injetáveis, com o estado de cada um.
 *
 * Existe porque o mapa só era alcançável por dentro da ficha de um cliente:
 * quem queria "ver os planejamentos de injetáveis" precisava saber de antemão
 * de quem eram. `branchId` nulo = a rede inteira.
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
    .select('client_id, branch_id, points, updated_at, clients!inner(id, name, phone, tenant_id), branches(name)')
    .eq('clients.tenant_id', ctx.tenantId!)
    .order('updated_at', { ascending: false })
    .limit(300)
  if (branchId) q = q.eq('branch_id', branchId)

  const { data: mapasRaw, error } = await q
  if (error) return { mapas: [], error: `Não foi possível carregar os mapas: ${error.message}` }

  const linhas = (mapasRaw ?? []) as unknown as {
    client_id: string
    points: InjectableMapValue['points'] | null
    updated_at: string | null
    clients: { name: string; phone: string | null } | null
    branches: { name: string } | null
  }[]

  // Aplicações dos mesmos clientes, para a lista dizer o que já foi aplicado.
  const ids = linhas.map(l => l.client_id)
  const porCliente = new Map<string, { ultima: string; total: number }>()
  if (ids.length > 0) {
    const { data: aps } = await admin
      .from('injectable_applications')
      .select('client_id, applied_at')
      .in('client_id', ids)
      .order('applied_at', { ascending: false })

    for (const a of (aps ?? []) as { client_id: string; applied_at: string }[]) {
      const atual = porCliente.get(a.client_id)
      // A consulta já vem da mais recente para a mais antiga: a primeira que
      // chega de cada cliente é a última aplicação dele.
      if (!atual) porCliente.set(a.client_id, { ultima: a.applied_at, total: 1 })
      else atual.total++
    }
  }

  const mapas: MapaNaLista[] = linhas.map(l => {
    const pontos = l.points ?? []
    const produtos = [...new Set(pontos.map(p => p.product?.trim()).filter(Boolean) as string[])]
    const ap = porCliente.get(l.client_id)
    return {
      clientId:        l.client_id,
      clientName:      l.clients?.name ?? 'Cliente',
      clientPhone:     l.clients?.phone ?? null,
      unidade:         l.branches?.name ?? null,
      pontos:          pontos.length,
      produtos,
      atualizadoEm:    l.updated_at,
      ultimaAplicacao: ap?.ultima ?? null,
      aplicacoes:      ap?.total ?? 0,
    }
  })

  return { mapas }
}
