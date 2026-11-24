/**
 * A ficha de saúde está VENCIDA? (atend-05, revisão do Heitor de 2026-11-02:
 * "mantém como está mas com aviso de que a ficha de saúde está vencida").
 *
 * A resposta fora da validade da rede (`tenants.pre_atendimento_validade_meses`)
 * continua contando como resposta no "Finalizar" — barrar a cliente já
 * atendida travaria a recepção —, mas o atendimento AVISA. A conta é a do
 * gatilho do envio (`trg_pre_atendimento_no_agendamento`): respondida há N
 * meses ou mais (`now() - make_interval(months => N)`), com o fim de mês
 * curto como o Postgres (31/03 menos um mês é 28/02 ou 29/02).
 */
export function fichaDeSaudeVencida(respondidoEm: string | null | undefined, validadeMeses: number, agora: Date = new Date()): boolean {
  if (!respondidoEm || !(validadeMeses > 0)) return false
  const quando = new Date(respondidoEm)
  if (Number.isNaN(quando.getTime())) return false
  const ano = agora.getUTCFullYear(), mes = agora.getUTCMonth() - validadeMeses, dia = agora.getUTCDate()
  const ultimoDia = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate()
  const limite = new Date(Date.UTC(ano, mes, Math.min(dia, ultimoDia),
    agora.getUTCHours(), agora.getUTCMinutes(), agora.getUTCSeconds(), agora.getUTCMilliseconds()))
  return quando.getTime() <= limite.getTime()
}

/**
 * Até quando a ficha de saúde vale (A1 da 26ª): a resposta mais a validade da
 * rede, em meses, com o fim de mês curto (31/08 + 6 meses = 28/02). Sem
 * validade (zero), nulo: não vence. A conta de `fichaDeSaudeVencida`, ao contrário.
 */
export function fichaDeSaudeValidaAte(respondidoEm: string | null | undefined, validadeMeses: number): string | null {
  if (!respondidoEm || !(validadeMeses > 0)) return null
  const quando = new Date(respondidoEm)
  if (Number.isNaN(quando.getTime())) return null
  const ano = quando.getUTCFullYear(), mes = quando.getUTCMonth() + validadeMeses, dia = quando.getUTCDate()
  const ultimoDia = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate()
  return new Date(Date.UTC(ano, mes, Math.min(dia, ultimoDia),
    quando.getUTCHours(), quando.getUTCMinutes(), quando.getUTCSeconds(), quando.getUTCMilliseconds())).toISOString()
}

/**
 * A janela do agendamento sem ficha mandada para ele, com a cliente de ficha
 * VÁLIDA (A1 da 26ª, princípios 3 e 7): dizia "A ficha de saúde não foi
 * enviada para este agendamento." — como se não houvesse ficha.
 */
export function textoDaFichaValida(f: { respondidaEm: string; validaAte: string | null }, dia: (iso: string) => string): string {
  const ate = f.validaAte ? ` até ${dia(f.validaAte)}` : ''
  return `A cliente tem a ficha de saúde válida${ate} (respondida em ${dia(f.respondidaEm)}). Enviar a ficha pede que ela responda de novo.`
}
