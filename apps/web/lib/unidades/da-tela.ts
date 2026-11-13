import 'server-only'
import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler, contar } from '@/lib/db'
import { oQueFicaNaUnidade } from '@/lib/unidades/desativar'
import { escolherUnidadesDeLeitura, temOQueFicou } from '@/lib/unidades/o-que-fica'
import { resolvePeriod } from '@/lib/metrics/period'
import { fusoDaRede } from '@/lib/unidades/fuso-da-unidade'

export { nomeNaTela, SELO_DESATIVADA } from '@/lib/unidades/o-que-fica'

/**
 * QUAIS unidades uma tela mostra — a regra é uma só (F72; H6 em
 * `plataforma.md`, o Heitor; C45 em `indicadores.md`; D1, D2 e A32 da 14ª):
 *
 * - **para LER** (totais, listas, o `?unidade=` da rede, os relatórios, o
 *   dashboard, a agenda, o estoque, as comissões, o fechamento, o a receber):
 *   as ativas e as DESATIVADAS que ainda têm movimento, saldo ou pendência —
 *   agendamento futuro, estoque com saldo, a receber, comissão a pagar
 *   (`oQueFicaNaUnidade`) — ou movimento no período da tela. A desativada vem
 *   com `ativa: false`, e a tela diz "Unidade desativada" (`nomeNaTela`). Sem
 *   isso, fechar a Pampulha tirava R$ 894,80 do estoque e R$ 630 dos
 *   Relatórios, e o "Ver os agendamentos" da janela abria a outra unidade.
 * - **para CRIAR** (agendar em, entrada em, vender, cadastrar, campanha,
 *   equipe, o seletor do portal): só as ativas.
 *
 * Nenhuma tela filtra `is_active` das unidades por conta própria:
 * `tests/unidades-da-tela.test.ts` trava.
 */

export interface UnidadeDaTela { id: string; name: string; slug: string; ativa: boolean }

type Periodo = { de: Date; ate: Date }

const colunasDe = (extra?: string) => `id, name, slug, is_active${extra ? `, ${extra}` : ''}`

/** As unidades da rede (todas), por nome. */
const todasDaRede = cache(async (tenantId: string, extra: string) =>
  ((await ler(createAdminClient().from('branches').select(colunasDe(extra))
    .eq('tenant_id', tenantId).order('name'), 'carregar as unidades')) ?? []) as unknown as Record<string, unknown>[])

/** A desativada teve movimento no período: dinheiro pago ou agendamento nele. */
async function movimentoNoPeriodo(branchId: string, p: Periodo): Promise<boolean> {
  const admin = createAdminClient()
  const [pagos, agendados] = await Promise.all([
    contar(admin.from('financial_transactions').select('id', { count: 'exact', head: true })
      .eq('branch_id', branchId).eq('is_paid', true).gte('paid_at', p.de.toISOString()).lte('paid_at', p.ate.toISOString()),
      'ver o movimento da unidade no período'),
    contar(admin.from('appointments').select('id', { count: 'exact', head: true })
      .eq('branch_id', branchId).gte('scheduled_at', p.de.toISOString()).lte('scheduled_at', p.ate.toISOString()),
      'ver a agenda da unidade no período'),
  ])
  return (pagos ?? 0) > 0 || (agendados ?? 0) > 0
}

/** A desativada ainda é lida: o que ficou nela, ou o movimento no período da tela. */
const desativadaComAlgo = cache(async (tenantId: string, branchId: string, de: number | null, ate: number | null) => {
  if (temOQueFicou(await oQueFicaNaUnidade(createAdminClient(), tenantId, branchId))) return true
  return de != null && ate != null ? movimentoNoPeriodo(branchId, { de: new Date(de), ate: new Date(ate) }) : false
})

/**
 * As unidades de LEITURA: as ativas e as desativadas com o que ficou (ou com
 * movimento no `periodo`). `colunas` traz o que a tela precisa a mais
 * (`'horario, fuso'`).
 */
export async function unidadesParaLer<Extra extends object = object>(
  tenantId: string,
  opcoes: { periodo?: Periodo; colunas?: string } = {},
): Promise<(UnidadeDaTela & Extra)[]> {
  const linhas = await todasDaRede(tenantId, opcoes.colunas ?? '')
  const todas = linhas.map(({ is_active, ...resto }) => ({ ...resto, ativa: is_active === true }) as unknown as UnidadeDaTela & Extra)
  const desativadas = todas.filter(u => !u.ativa)
  const comAlgo = new Set<string>()
  await Promise.all(desativadas.map(async u => {
    if (await desativadaComAlgo(tenantId, u.id, opcoes.periodo?.de.getTime() ?? null, opcoes.periodo?.ate.getTime() ?? null)) comAlgo.add(u.id)
  }))
  return escolherUnidadesDeLeitura(todas, comAlgo)
}

/**
 * O período da tela (o `?period=`/`from`/`to`), para dizer quais desativadas
 * tiveram movimento nele — no fuso da rede, do começo ao FIM do período.
 */
export async function periodoDaTela(tenantId: string, rawPeriod?: string, rawFrom?: string, rawTo?: string): Promise<Periodo> {
  const p = resolvePeriod(rawPeriod, rawFrom, rawTo, new Date(), await fusoDaRede(tenantId))
  return { de: p.from, ate: p.fullTo }
}

/** As unidades para CRIAR coisa nova (agendar, dar entrada, vender, cadastrar): só as ativas. */
export async function unidadesParaCriar<Extra extends object = object>(
  tenantId: string,
  colunas?: string,
): Promise<({ id: string; name: string; slug: string } & Extra)[]> {
  const linhas = await todasDaRede(tenantId, colunas ?? '')
  return linhas.filter(l => l.is_active === true)
    .map(l => Object.fromEntries(Object.entries(l).filter(([k]) => k !== 'is_active')) as unknown as { id: string; name: string; slug: string } & Extra)
}

/** Quantas unidades ATIVAS a rede tem (o "mais de uma unidade" do app da cliente, o setup). */
export async function quantasUnidadesAtivas(tenantId: string): Promise<number> {
  return (await unidadesParaCriar(tenantId)).length
}
