import { bandeiraDoPagamento, temBandeira } from '@/lib/financeiro/bandeiras'
import { recusaDasVezesDaRede } from '@/lib/financeiro/vezes-da-rede'

/**
 * O pagamento NOVO do usado (r2-ven-05): ao estornar o pagamento inteiro de um
 * pacote, plano, unidade pré-paga, venda de produto ou de crédito, o que fica
 * entra de novo na forma que a recepção escolher. É um recebimento como os
 * outros, e a regra do cartão vale (C75, vendas-financeiro.md §9.6): com mais
 * de uma maquininha ativa, o cartão não segue sem ela — era o banco pondo a
 * primeira calado (VF-01 da varredura de 18/11).
 */
export interface PagamentoDoUsado {
  metodo:      string
  vezes?:      number | null
  bandeira?:   string | null
  maquininha?: string | null
}

/** A recusa das vezes e da maquininha da rede — no crédito E no débito. */
export async function recusaDoPagamentoDoUsado(tenantId: string, novo: PagamentoDoUsado | null | undefined): Promise<string | null> {
  if (!novo || !temBandeira(novo.metodo)) return null
  return recusaDasVezesDaRede(tenantId, novo.metodo === 'CREDIT_CARD' ? novo.vezes ?? 1 : 1, novo.maquininha ?? null, novo.metodo)
}

/** O `p_novo` das funções do banco: as vezes só no crédito; a bandeira e a maquininha só no cartão. */
export function pagamentoDoUsadoParaOBanco(novo: PagamentoDoUsado | null | undefined) {
  if (!novo) return null
  return {
    metodo:     novo.metodo,
    vezes:      novo.metodo === 'CREDIT_CARD' ? novo.vezes ?? 1 : 1,
    bandeira:   bandeiraDoPagamento(novo.metodo, novo.bandeira),
    maquininha: temBandeira(novo.metodo) ? novo.maquininha || null : null,
  }
}
