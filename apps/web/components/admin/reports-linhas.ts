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

/**
 * Uma parcela a receber: desde 2026-09-30 cada parcela é um LANÇAMENTO
 * (`financial_transactions` com `parcela_*`) — `installments` é histórico.
 */
export interface LinhaParcela {
  id:             string
  amount:         number
  due_date:       string
  description:    string
  branch_id:      string
  parcela_numero: number
  parcela_total:  number
  clients:        Embutido<{ name: string }>
}
