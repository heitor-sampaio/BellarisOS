import { descontoDoRetrato, mesmoPagamento, pagamentoNormalizado, type PagamentoDoPlano } from '@/lib/checkout/pagamento'

/**
 * D1 da 33ª (DG-03 e VD-10 do catálogo): o que se recebe na comanda do
 * atendimento muda o combinado do contrato ASSINADO? A comparação é a do plano
 * (`mesmoPagamento` sobre `pagamentoNormalizado`, com o desconto em reais): a
 * forma, o meio, as vezes, o crediário (entrada, parcelas, o dia do 1º
 * vencimento) e o desconto. A maquininha e a bandeira não são do combinado
 * (MQ-15: "o pagamento combinado do contrato não pergunta").
 *
 * O combinado "no atendimento" (`NADA_AGORA`) não diz a forma — qualquer forma
 * o cumpre; só o desconto dele conta (decisão do Claude, 26/11, princípio 3:
 * o que o contrato diz é o que se confere). Sem retrato, o contrato não cita o
 * pagamento: nada a perguntar.
 */
export function mudaOCombinadoDoContrato(retrato: unknown, pagamento: PagamentoDoPlano | null, desconto: number): boolean {
  if (!retrato || typeof retrato !== 'object') return false
  const recebido = pagamentoNormalizado(pagamento, desconto)
  if ((retrato as Record<string, unknown>).forma === 'NADA_AGORA') {
    return Math.round(descontoDoRetrato(retrato) * 100) !== Math.round(Math.max(desconto, 0) * 100)
  }
  return !mesmoPagamento(retrato, recebido)
}
