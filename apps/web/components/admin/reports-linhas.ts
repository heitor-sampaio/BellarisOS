/**
 * As linhas que `reports-bi-section` busca e `reports-bi-view` desenha — uma
 * por consulta, com os campos que o `select` de lá pede.
 *
 * Eram `any[]` dos dois lados, e foi assim que a consulta de comissões pediu
 * uma coluna que não existe (`created_at`) e a tela mostrou R$ 0 por meses sem
 * nada acusar. Mudou um `select`, muda o tipo aqui junto.
 */

/** Um item de relação embutida (`tabela(colunas)`): objeto, ou nulo sem vínculo. */
type Embutido<T> = T | null

export interface LinhaTransacao {
  id:             string
  amount:         number
  type:           string
  is_paid:        boolean
  branch_id:      string
  client_id:      string | null
  payment_method: string | null
  category:       string | null
  notes:          string | null
  created_at:     string
  paid_at:        string | null
}

export type LinhaTransacaoAnterior = Pick<LinhaTransacao, 'amount' | 'type' | 'is_paid' | 'branch_id'>

export interface LinhaAtendimento {
  id:              string
  branch_id:       string
  procedure_id:    string | null
  professional_id: string | null
  client_id:       string | null
  price:           number | null
  scheduled_at:    string
  source:          string | null
  procedures:      Embutido<{ name: string; category: string | null }>
  users:           Embutido<{ name: string }>
  clients:         Embutido<{ birth_date: string | null }>
}

export interface LinhaClienteNovo { id: string; branch_id: string | null }

export interface LinhaCliente {
  id:         string
  name:       string
  birth_date: string | null
  gender:     string | null
  city:       string | null
  state:      string | null
  created_at: string
}

export interface LinhaAgendamento {
  id:           string
  branch_id:    string
  status:       string
  source:       string | null
  scheduled_at: string
}

export interface LinhaComissao {
  amount:          number
  professional_id: string | null
  status:          string
  branch_id:       string
  users:           Embutido<{ name: string }>
  appointments:    Embutido<{ scheduled_at: string }>
}

export interface LinhaMovimentoDeEstoque {
  quantity:   number
  created_at: string
  branch_id:  string
  product_id: string
  products:   Embutido<{ name: string; cost_price: number | null; category: string | null }>
}

export interface LinhaEstoqueDaUnidade {
  current_stock:      number
  current_rendimento: number | null
  min_stock:          number | null
  branch_id:          string
  product_id:         string
  products:           Embutido<{ name: string; category: string | null; cost_price: number | null; is_active: boolean }>
  branches:           Embutido<{ name: string }>
}

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

export interface LinhaCustoDoProcedimento {
  procedure_id: string
  quantity:     number
  products:     Embutido<{ cost_price: number | null }>
  procedures:   Embutido<{ tenant_id: string; labor_cost: number | null; other_costs: number | null }>
}
