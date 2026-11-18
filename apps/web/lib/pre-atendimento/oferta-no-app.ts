import { fichaDeSaudeVencida } from '@/lib/pre-atendimento/validade'

/**
 * O app oferece a ficha de saúde à cliente (15ª A33 = 16ª A11): com o envio
 * automático desligado (o padrão — princípio 6), o pendente nunca nascia, e a
 * cliente com atendimento marcado não tinha onde responder. Com atendimento
 * futuro e sem ficha válida (nunca respondida, ou vencida pela validade da
 * rede), o Início oferece "Responda a sua ficha de saúde"; o pendente nasce
 * no clique DELA (`pre_atendimento_abrir_manual`), não sozinho.
 *
 * Devolve o agendamento por onde a ficha se abre, ou null.
 */
export function ofereceAFichaNoApp(o: {
  /** Já há um pendente (o Início mostra o dele). */
  pendente: boolean
  proximoAgendamentoId: string | null
  /** A rede tem a ficha de saúde ativa. */
  temFichaAtiva: boolean
  /** A última resposta com conteúdo (a ficha gravada vazia não conta). */
  ultimaResposta: string | null
  validadeMeses: number
  agora?: Date
}): string | null {
  if (o.pendente || !o.proximoAgendamentoId || !o.temFichaAtiva) return null
  if (o.ultimaResposta && !fichaDeSaudeVencida(o.ultimaResposta, o.validadeMeses, o.agora)) return null
  return o.proximoAgendamentoId
}
