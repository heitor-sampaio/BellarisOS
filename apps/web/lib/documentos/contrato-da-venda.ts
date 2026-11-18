import { mesmoPagamento } from '@/lib/checkout/pagamento'

/**
 * O contrato de pacote ANTES da venda (PC2, o Heitor, 2026-11-13: "ele assina
 * pelo pacote. o ideal era funcionar como no plano de tratamento"; e do plano:
 * "primeiro colhe assinatura, depois paga" — a auditoria das regras de
 * 2026-11-18 corrigiu o "a venda não espera"). Com o contrato de pacote ativo
 * na rede, o dinheiro da venda só entra com ele assinado — ou dispensado, com
 * o motivo. Os termos e os outros documentos do pacote não seguram o dinheiro:
 * nascem com a venda, como antes.
 *
 * - `VENDE`: sem contrato (a rede não tem um ativo), dispensado, ou assinado
 *   com ESTE combinado (ou um que não cita o pagamento) nesta unidade.
 * - `ASSINAR`: o contrato está aberto (a montar, a assinar, faltam dados).
 * - `SUBSTITUIR`: assinado com outro pagamento (ou noutra unidade) — a venda
 *   pergunta antes de trocar, como o checkout do plano (A45 da 5ª).
 */
export type SituacaoDoContratoDaVenda = 'VENDE' | 'ASSINAR' | 'SUBSTITUIR'

export interface ContratoDaVendaLido {
  status: string
  /** O retrato do pagamento que o texto cita (`pagamentoNormalizado`). */
  payment_snapshot: unknown
  branch_id: string | null
  /** A versão do modelo cita o pagamento (`uses_payment`). */
  citaPagamento: boolean
}

export function situacaoDoContratoDaVenda(
  doc: ContratoDaVendaLido | null,
  /** O combinado desta venda, normalizado (`pagamentoNormalizado(pagamento, desconto)`). */
  combinado: unknown,
  unidade: string,
): SituacaoDoContratoDaVenda {
  if (!doc || doc.status === 'DISPENSADO') return 'VENDE'
  if (doc.status !== 'ASSINADO') return 'ASSINAR'
  if (doc.branch_id && doc.branch_id !== unidade) return 'SUBSTITUIR'
  if (!doc.citaPagamento) return 'VENDE'
  return mesmoPagamento(doc.payment_snapshot, (combinado ?? {}) as Record<string, string | number | null>) ? 'VENDE' : 'SUBSTITUIR'
}
