import 'server-only'
import { alcancaUnidade, can } from '@/lib/auth'
import type { TenantContext } from '@estetica-os/types'
import type { createAdminClient } from '@/lib/supabase/admin'
import { ler, lerTodas } from '@/lib/db'
import type { AnamnesisRow } from '@/lib/anamnesis'
import { unidadeDoInsumo, type UnidadesDoProduto } from '@/lib/estoque/unidade-de-consumo'
import { ehInsumo } from '@/lib/estoque/uso'
import type { ProdutoDoMapa } from '@/lib/injetaveis/medida-do-ponto'
import {
  planejamentosDaFicha, comRetratos, comOPlanejamentoAplicado, temPlanejadorSemPlanejamento, type PlanejamentoParaRetrato,
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

/** Confere que o planejamento é da rede de quem chama e da unidade ao alcance. */
export async function mapaDoTenant(admin: Admin, mapId: string, ctx: TenantContext) {
  const data = await ler(admin
    .from('injectable_maps')
    .select('id, tenant_id, client_id, branch_id, name, updated_by, points')
    .eq('id', mapId)
    .maybeSingle(), 'carregar o planejamento')
  if (!data || data.tenant_id !== ctx.tenantId || !mapaAoAlcance(ctx, data.branch_id as string | null)) return null
  return data
}

/**
 * Os produtos que o ponto do mapa pode ter, com a medida de cada um: os
 * insumos ativos da rede, na medida de consumo (`unidadeDoInsumo`) — o que a
 * tela oferece no atendimento e na tela de Injetáveis. É com eles que o
 * servidor confere a medida do ponto (o Heitor, 27/11: "O consumo é sempre na
 * unidade cadastrada no produto, seja no mapa, seja no atendimento, seja no
 * consumo do estoque."; `recusaDaMedidaDosPontos`).
 */
export async function produtosDoMapaDaRede(admin: Admin, tenantId: string): Promise<ProdutoDoMapa[]> {
  const linhas = await lerTodas((de, ate) => admin.from('products')
    .select('id, name, unit, consumption_unit, units_per_package, uso')
    .eq('tenant_id', tenantId).eq('is_active', true).order('id').range(de, ate),
    'carregar os produtos do estoque') as ({ name: string; uso: string | null } & UnidadesDoProduto)[]
  return linhas.filter(p => ehInsumo(p.uso)).map(p => ({ name: p.name, unit: unidadeDoInsumo(p) }))
}

/**
 * Os planejamentos DESTA cliente, entre `ids`, que quem age pode abrir: da
 * rede e da unidade ao alcance. Sem o prontuário, nenhum. É o que a ficha lida mostra como link.
 */
export async function planejamentosQueAbrem(
  admin: Admin,
  ctx: TenantContext,
  clientId: string,
  ids: string[],
): Promise<PlanejamentoParaRetrato[]> {
  const unicos = [...new Set(ids)].filter(id => /^[0-9a-f-]{36}$/i.test(id))
  if (unicos.length === 0 || !can(ctx, 'medical_records', 'VIEW')) return []
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
  { rows, answers, clientId, appointmentId = null }: {
    rows: AnamnesisRow[]; answers: Record<string, unknown>; clientId: string | null; appointmentId?: string | null
  },
): Promise<{ answers: Record<string, unknown> } | { error: string }> {
  // D6 da 7ª: o campo sem planejamento ganha o que tem a aplicação DESTE
  // atendimento (registrada por Planejamento → Injetáveis), se ao alcance.
  const aplicado = appointmentId && clientId && temPlanejadorSemPlanejamento(rows, answers)
    ? await planejamentoAplicadoNoAtendimento(admin, appointmentId, clientId)
    : null
  const ids = [...new Set([...planejamentosDaFicha(rows, answers), ...(aplicado ? [aplicado] : [])])]
  const mapas = ids.length > 0 && clientId ? await planejamentosQueAbrem(admin, ctx, clientId, ids) : []
  const respostas = aplicado && mapas.some(m => m.id === aplicado) ? comOPlanejamentoAplicado(rows, answers, aplicado) : answers
  return comRetratos(rows, respostas, new Map(mapas.map(m => [m.id, m])), new Date().toISOString())
}

/**
 * O planejamento com a aplicação registrada NESTE atendimento (a mais
 * recente), da cliente dele — ou nulo (D6 da 7ª simulação).
 */
export async function planejamentoAplicadoNoAtendimento(admin: Admin, appointmentId: string, clientId: string): Promise<string | null> {
  const linha = await ler(admin.from('injectable_applications').select('map_id')
    .eq('appointment_id', appointmentId).eq('client_id', clientId).not('map_id', 'is', null)
    .order('created_at', { ascending: false }).limit(1).maybeSingle(), 'buscar a aplicação do atendimento') as { map_id: string } | null
  return linha?.map_id ?? null
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
