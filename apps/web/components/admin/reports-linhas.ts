/**
 * As LISTAS que `reports-bi-section` busca e `reports-bi-view` desenha, com
 * os campos que o `select` de lá pede.
 *
 * Eram doze tipos, um por consulta de linhas cruas. Desde que os números da
 * tela vêm agregados do Postgres (`metrics_relatorio`), só sobram as duas
 * listas curtas e com limite: lotes vencendo e parcelas pendentes.
 */

/** Um item de relação embutida (`tabela(colunas)`): objeto, ou nulo sem vínculo. */
type Embutido<T> = T | null

export interface LinhaLote {
  id:           string
  product_id:   string
  batch_number: string | null
  expires_at:   string
  quantity:     number
  products:     Embutido<{ name: string; tenant_id: string }>
}

export interface LinhaParcela {
  id:       string
  amount:   number
  due_date: string
  financial_transactions: Embutido<{ branch_id: string; clients: Embutido<{ name: string }> }>
}
