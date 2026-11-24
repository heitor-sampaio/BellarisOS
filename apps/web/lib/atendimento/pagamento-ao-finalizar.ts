/**
 * De onde vem o pagamento, dito na janela do "Finalizar" (J-40, 2026-10-30) e
 * no atendimento concluído. Dizia sempre "O pagamento será confirmado pela
 * recepcionista" — também na sessão do plano já pago, ao lado do "Nada a
 * cobrar agora" do plano.
 *
 * A4 da 26ª (princípio 3): o pacote vendido no crediário, com parcelas em
 * aberto, não está "pago na venda" — a sessão é "incluída no pacote", como a
 * faixa da sessão já dizia (D4 da 21ª, `textoDaSessaoDoPacote`). Nada a
 * receber nesta sessão continua valendo.
 */

const temEmAberto = (v: number | null | undefined) => v != null && Math.round(v * 100) > 0

export function textoDoPagamentoAoFinalizar(t: {
  plano: boolean; pacote: boolean; pacoteDeFora?: boolean; prePago: boolean; semCobranca: boolean
  /** O que o pacote ainda tem em aberto (as parcelas do crediário). */
  pacoteEmAberto?: number | null
}): string {
  if (t.plano)       return 'Sessão do plano de tratamento: o pagamento é o do plano, nada a receber neste atendimento.'
  if (t.pacote && t.pacoteDeFora) return 'Sessão do pacote trazido de fora: já paga antes do sistema, nada a receber.'
  if (t.pacote && temEmAberto(t.pacoteEmAberto)) return 'Sessão de pacote: incluída no pacote, que tem parcelas em aberto; nada a receber neste atendimento.'
  if (t.pacote)      return 'Sessão de pacote: paga na venda do pacote, nada a receber.'
  if (t.prePago)     return 'Procedimento pré-pago: pago na venda, nada a receber.'
  if (t.semCobranca) return 'Sem cobrança: atendimento de R$ 0,00.'
  return 'O pagamento é recebido no PDV.'
}

/** A linha do pagamento da sessão de pacote no atendimento concluído. */
export function textoDoPacoteNoConcluido(s: { deFora: boolean; emAberto?: number | null }): string {
  if (s.deFora) return 'Sessão do pacote trazido de fora — já paga antes do sistema, nada a receber.'
  if (temEmAberto(s.emAberto)) return 'Sessão de pacote — incluída no pacote, que tem parcelas em aberto; nada a receber nesta sessão.'
  return 'Sessão de pacote — paga na venda do pacote.'
}
