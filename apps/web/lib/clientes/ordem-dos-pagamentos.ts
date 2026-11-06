/**
 * A ordem dos pagamentos no app da cliente — UMA, no Financeiro e no
 * Histórico → Pagamentos (D4 da 7ª e D17 da 8ª simulação): o que falta pagar
 * vem primeiro, pela próxima a vencer; o resto, do mais recente para o mais
 * antigo, pelo dia de referência (o do pagamento). As duas telas liam pela
 * CRIAÇÃO, e as parcelas criadas juntas apareciam 2/2 antes da 1/2.
 */
export function ordemDosPagamentosDoApp<T extends { vencimento?: string | null; referencia?: string | null }>(a: T, b: T): number {
  if (!!a.vencimento !== !!b.vencimento) return a.vencimento ? -1 : 1
  if (a.vencimento && b.vencimento) return a.vencimento.localeCompare(b.vencimento)
  return (b.referencia ?? '').localeCompare(a.referencia ?? '')
}
