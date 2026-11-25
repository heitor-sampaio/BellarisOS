/**
 * O filtro de Tags dos Relatórios (CLAUDE.md §1, o Heitor, 13/11: "onde tiver
 * for passível de filtro, um dos filtros que ela pode usar são as tags … além
 * dos filtros que a gente já apresenta ali fixos em cada página"). Puro: a
 * tela, as páginas, a seção e a exportação dividem.
 *
 * Decisões do Claude (princípios 3 e 7; `docs/regras/indicadores.md`, "O
 * filtro de Tags nos Relatórios"):
 * - a tag filtra PESSOAS: a linha entra se a cliente dela (`clients.tags`; na
 *   aba Oportunidades, a pessoa da oportunidade — a cliente; sem ela, o
 *   contato; o Heitor, 18/11: "a tag é da pessoa") tem TODAS as tags
 *   marcadas (E, sem distinguir a caixa, como a lista de Clientes); a linha
 *   sem cliente sai quando há tag. A conta mora no banco
 *   (`public.metrics_tem_as_tags`, `metrics_cliente_tem_as_tags`);
 * - o filtro existe em toda aba com pessoa; no Estoque (sem pessoa), não. A
 *   Visão geral e o Financeiro o ganharam na revisão de 24/11 (Q05 do catálogo
 *   dos Indicadores: "têm filtros, então ganham o de Tags"): com tag, a
 *   despesa, a compra de estoque e as perdas (sem cliente) saem, e o lucro e o
 *   DRE são das mesmas linhas que os cartões.
 */

import { tagsDaUrl, tagsParaAUrl } from '@/lib/tags/filtro-na-url'

export const ABAS_COM_FILTRO_DE_TAGS = ['overview', 'financeiro', 'vendas', 'agenda', 'clientes', 'procedimentos', 'profissionais', 'comercial'] as const

export function abaTemFiltroDeTags(aba: string): boolean {
  return (ABAS_COM_FILTRO_DE_TAGS as readonly string[]).includes(aba)
}

/**
 * `?tags=VIP,Noivas` → ['VIP', 'Noivas']: sem vazio e sem repetir ("VIP" e
 * "vip" são a mesma tag). O leitor é o das outras telas (Financeiro, Agenda):
 * a vírgula do nome vai escapada, e "Pacote, 10x" não se parte em duas.
 */
export { tagsDaUrl }

/** A lista de volta para a URL; sem tag, nada (o parâmetro sai). */
export function tagsNaUrl(tags: readonly string[]): string | null {
  return tagsParaAUrl(tags) || null
}

/** As tags que valem na aba: numa aba sem o filtro, nenhuma (a da URL não chega à conta). */
export function tagsDaAba(aba: string, tags: readonly string[]): string[] {
  return abaTemFiltroDeTags(aba) ? [...tags] : []
}

/**
 * O `p_tags` das funções `metrics_*`, só quando há tag: sem ela, a chamada é
 * a de antes (o padrão da função é nulo).
 */
export function paramDeTags(tags?: readonly string[] | null): { p_tags?: string[] } {
  return tags && tags.length ? { p_tags: [...tags] } : {}
}
