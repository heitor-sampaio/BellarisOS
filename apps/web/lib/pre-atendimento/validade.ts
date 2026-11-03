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
