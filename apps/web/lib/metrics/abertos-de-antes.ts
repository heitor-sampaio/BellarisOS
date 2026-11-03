// Os atendimentos de dias ANTERIORES ainda abertos (J-32, 2026-10-30), na
// fonte única dos indicadores (ind-02, revisão de 2026-11-02: "todo número
// exibido vem da fonte única" — morava em lib/agenda). Sem 'use server': a
// página que chama já conferiu a sessão e a unidade.
//
// A cliente que "Chegou" às 23:50 e não foi atendida sumia do dia depois da
// meia-noite — a agenda abre em hoje —, e o atendimento ficava aberto para
// sempre: sem conclusão, sem cobrança, sem falta. A agenda e o dashboard da
// unidade avisam, em DOIS grupos:
// - ABERTOS: quem CHEGOU (ARRIVED) ou está EM ATENDIMENTO (IN_PROGRESS) — a
//   cliente esteve na clínica e nada foi fechado;
// - SEM CHEGADA (agenda-03, revisão de 2026-11-02): o agendado/confirmado que
//   passou sem ninguém mexer — "marcar falta ou concluir?". A falta não
//   registrada distorce a agenda e os números.
// Só os últimos 30 dias contam; o total é contado no banco (`count: exact`).
// Respeita o "só os meus" da agenda (`ownerFilter`).

import type { TenantContext } from '@estetica-os/types'
import { createAdminClient } from '@/lib/supabase/admin'
import { ownerFilter } from '@/lib/auth'
import { startOfDayTZ } from '@/lib/datetime'
import { mensagemDoErro } from '@/lib/db'

export const STATUS_ABERTOS_DE_ANTES = ['ARRIVED', 'IN_PROGRESS'] as const
export const STATUS_SEM_CHEGADA = ['SCHEDULED', 'CONFIRMED'] as const
const JANELA_DIAS = 30
const NA_TELA = 20

export interface AbertoDeAntes {
  id: string
  scheduledAt: string
  status: 'ARRIVED' | 'IN_PROGRESS' | 'SCHEDULED' | 'CONFIRMED'
  clientName: string
  professionalName: string
  /** A unidade (H3: no dashboard da rede, cada linha diz a dela). */
  branchName: string
}

export interface GrupoDeAbertos { total: number; itens: AbertoDeAntes[] }

const VAZIO: GrupoDeAbertos = { total: 0, itens: [] }

async function grupo(ctx: TenantContext, unidades: string[], agora: Date, status: readonly string[]): Promise<GrupoDeAbertos> {
  if (unidades.length === 0) return VAZIO
  const hoje = startOfDayTZ(agora)
  const desde = new Date(hoje.getTime() - JANELA_DIAS * 86_400_000)
  let q = createAdminClient().from('appointments')
    .select('id, scheduled_at, status, clients(name), users!professional_id(name), branches!inner(tenant_id, name)', { count: 'exact' })
    .in('branch_id', unidades)
    .eq('branches.tenant_id', ctx.tenantId!)
    .in('status', [...status])
    .lt('scheduled_at', hoje.toISOString())
    .gte('scheduled_at', desde.toISOString())
  const dono = ownerFilter(ctx, 'agenda')
  if (dono) q = q.eq('professional_id', dono)
  const { data, count, error } = await q.order('scheduled_at').order('id').limit(NA_TELA)
  // É aviso: a falha vai ao log e a tela segue sem ele.
  if (error) { console.error('[abertos-de-antes]', mensagemDoErro(error)); return VAZIO }
  return {
    total: count ?? (data ?? []).length,
    itens: ((data ?? []) as unknown as {
      id: string; scheduled_at: string; status: AbertoDeAntes['status']
      clients: { name: string } | null; users: { name: string } | null; branches: { name: string } | null
    }[]).map(a => ({
      id: a.id, scheduledAt: a.scheduled_at, status: a.status,
      clientName: a.clients?.name ?? '—', professionalName: a.users?.name ?? '—', branchName: a.branches?.name ?? '—',
    })),
  }
}

/**
 * `unidades`: a da unidade (o dashboard e a agenda dela) ou as da rede (o
 * dashboard da rede — H3, "a dona vê tudo, sempre": a dona da clínica única usa
 * o /admin e nunca via o aviso).
 */
export async function abertosDeAntes(ctx: TenantContext, unidades: string | string[], agora = new Date()): Promise<{ abertos: GrupoDeAbertos; semChegada: GrupoDeAbertos }> {
  const ids = typeof unidades === 'string' ? [unidades] : unidades
  const [abertos, semChegada] = await Promise.all([
    grupo(ctx, ids, agora, STATUS_ABERTOS_DE_ANTES),
    grupo(ctx, ids, agora, STATUS_SEM_CHEGADA),
  ])
  return { abertos, semChegada }
}

export const SEM_ABERTOS_DE_ANTES = { abertos: VAZIO, semChegada: VAZIO }
