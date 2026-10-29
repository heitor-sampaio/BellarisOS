import 'server-only'
import { alcancaUnidade, can, isOwnScope } from '@/lib/auth'
import type { TenantContext } from '@estetica-os/types'
import type { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'
import { clienteNoEscopo } from '@/lib/clientes/atendida-por'
import type { AnamnesisRow } from '@/lib/anamnesis'
import {
  planejamentosDaFicha, comRetratos, type PlanejamentoParaRetrato,
} from '@/lib/atendimento/retrato-dos-injetaveis'

/**
 * Quem alcança um planejamento de injetáveis — a regra UMA das actions de
 * `actions/injectable-map.ts` e do planejador da ficha do procedimento
 * (2026-10-29). Mora fora do arquivo `'use server'`: lá, todo export é
 * endpoint.
 */

type Admin = ReturnType<typeof createAdminClient>

/**
 * O planejamento está ao alcance de quem age? Planejamento avulso (sem unidade)
 * aparece em qualquer recorte — é a regra da lista —; o de uma unidade, só para
 * ela e para a rede (§11).
 */
export function mapaAoAlcance(ctx: TenantContext, branchId: string | null): boolean {
  return branchId === null || alcancaUnidade(ctx, branchId)
}

/** A cliente é atendida por ela (o "dela" do prontuário OWN)? */
export async function clienteDaProfissional(admin: Admin, ctx: TenantContext, clientId: string): Promise<boolean> {
  return clienteNoEscopo(admin, ctx, 'medical_records', clientId)
}

/**
 * Com o prontuário "só os meus", o mapa é DELA? (Decisão do Heitor,
 * 2026-10-28: "quem tem 'só os meus' vê 'só os meus', em qualquer lugar".)
 *
 * O plano é da CLIENTE, não da profissional: o mapa de uma cliente que ela
 * atende (um agendamento com ela — a regra da ficha e de `recusaDoAnexo`) é
 * dela, quem quer que o tenha desenhado. O avulso (sem cliente) é dela quando
 * foi ela quem o mexeu por último (`updated_by`). Sem o escopo OWN, todo mapa
 * ao alcance.
 */
export async function mapaDaProfissional(
  admin: Admin,
  ctx: TenantContext,
  mapa: { client_id: string | null; updated_by: string | null },
): Promise<boolean> {
  if (!isOwnScope(ctx, 'medical_records')) return true
  if (!ctx.internalUserId) return false
  if (!mapa.client_id) return mapa.updated_by === ctx.internalUserId
  return clienteDaProfissional(admin, ctx, mapa.client_id)
}

/**
 * Confere que o planejamento é da rede de quem chama, da unidade ao alcance
 * e, com o prontuário "só os meus", dela (§11: o escopo vale pelo id).
 */
export async function mapaDoTenant(admin: Admin, mapId: string, ctx: TenantContext) {
  const data = await ler(admin
    .from('injectable_maps')
    .select('id, tenant_id, client_id, branch_id, name, updated_by')
    .eq('id', mapId)
    .maybeSingle(), 'carregar o planejamento')
  if (!data || data.tenant_id !== ctx.tenantId || !mapaAoAlcance(ctx, data.branch_id as string | null)) return null
  return (await mapaDaProfissional(admin, ctx, data as { client_id: string | null; updated_by: string | null })) ? data : null
}

/**
 * Os planejamentos DESTA cliente, entre `ids`, que quem age pode abrir: da
 * rede, da unidade ao alcance e, no "só os meus", de cliente que ela atende.
 * Sem o prontuário, nenhum. É o que a ficha lida mostra como link.
 */
export async function planejamentosQueAbrem(
  admin: Admin,
  ctx: TenantContext,
  clientId: string,
  ids: string[],
): Promise<PlanejamentoParaRetrato[]> {
  const unicos = [...new Set(ids)].filter(id => /^[0-9a-f-]{36}$/i.test(id))
  if (unicos.length === 0 || !can(ctx, 'medical_records', 'VIEW')) return []
  if (!(await clienteDaProfissional(admin, ctx, clientId))) return []
  const linhas = await ler(admin
    .from('injectable_maps')
    .select('id, name, view, points, branch_id')
    .eq('tenant_id', ctx.tenantId!)
    .eq('client_id', clientId)
    .in('id', unicos), 'carregar os planejamentos da ficha')
  return ((linhas ?? []) as (PlanejamentoParaRetrato & { branch_id: string | null })[])
    .filter(m => mapaAoAlcance(ctx, m.branch_id))
    .map(({ id, name, view, points }) => ({ id, name, view, points }))
}

/**
 * As respostas da ficha do procedimento com o RETRATO de cada planejamento
 * usado no campo do planejador, lido agora do banco (2026-10-29). Usado pelo
 * "Salvar ficha" (`salvarFichaDoProcedimento`) e pelo "Finalizar"
 * (`finishSession`, que grava na transação da conclusão). O planejamento tem
 * de ser da cliente DO ATENDIMENTO e estar ao alcance de quem age.
 */
export async function retratarInjetaveis(
  admin: Admin,
  ctx: TenantContext,
  { rows, answers, clientId }: { rows: AnamnesisRow[]; answers: Record<string, unknown>; clientId: string | null },
): Promise<{ answers: Record<string, unknown> } | { error: string }> {
  const ids = planejamentosDaFicha(rows, answers)
  const mapas = ids.length > 0 && clientId ? await planejamentosQueAbrem(admin, ctx, clientId, ids) : []
  return comRetratos(rows, answers, new Map(mapas.map(m => [m.id, m])), new Date().toISOString())
}

/**
 * Dos planejamentos retratados nas fichas lidas (a aba Prontuário da ficha da
 * cliente), os ids que quem vê pode abrir — é a eles que a ficha dá o link
 * "Abrir planejamento". O que saiu do alcance (ou não existe mais) fica só
 * com o retrato.
 */
export async function planejamentosAbriveisDasFichas(
  admin: Admin,
  ctx: TenantContext,
  clientId: string,
  fichas: ({ rows: AnamnesisRow[]; answers: Record<string, unknown> } | null)[],
): Promise<string[]> {
  const ids = fichas.flatMap(f => (f ? planejamentosDaFicha(f.rows, f.answers) : []))
  if (ids.length === 0) return []
  return (await planejamentosQueAbrem(admin, ctx, clientId, ids)).map(m => m.id)
}
