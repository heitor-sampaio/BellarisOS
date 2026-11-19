import { literalDeArrayDoPostgres } from '@/lib/tags/filtro-na-url'

/**
 * O filtro de Tags das listas do Financeiro (A receber, A pagar,
 * Movimentações — CLAUDE.md §1, Tags; vendas-financeiro.md §9.6, "As Tags nas
 * listas do Financeiro").
 *
 * A tag filtra PESSOAS: o lançamento entra se a CLIENTE dele (`clients.tags`)
 * tem TODAS as tags marcadas (E, como a lista de Clientes e o inbox). Vai NA
 * CONSULTA (CLAUDE.md §14: filtrar um lote já lido é o mesmo corte): a cliente
 * entra pelo embed INNER — o lançamento sem cliente (a despesa, o fornecedor)
 * sai quando há tag marcada — e o `cs` (contém) do PostgREST pede todas.
 * Lido em páginas (`lerTodas`), como a lista: nada de `.in(<ids>)` que
 * cresce com a base. O embed é VAZIO (`!inner()`): filtra a linha sem trazer a
 * cliente de volta (PostgREST 11+; conferido na produção em 18/11: 284 → 5 com "VIP").
 */
export const EMBED_DAS_TAGS_DA_CLIENTE = 'tags_da_cliente:clients!financial_transactions_client_id_fkey!inner()'

/** O select da lista, com o embed da cliente só quando há tag marcada. */
export function selectComAsTags(select: string, tags: readonly string[]): string {
  return tags.length ? `${select}, ${EMBED_DAS_TAGS_DA_CLIENTE}` : select
}

/** A consulta com o filtro das tags (sem tag, a mesma consulta). */
export function comAsTags<Q extends { filter(coluna: string, operador: string, valor: string): Q }>(q: Q, tags: readonly string[]): Q {
  return tags.length ? q.filter('tags_da_cliente.tags', 'cs', literalDeArrayDoPostgres(tags)) : q
}
