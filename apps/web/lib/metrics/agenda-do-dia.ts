/**
 * Os agendamentos de hoje que AINDA vêm (A12 da 16ª simulação; princípio 3).
 * "Agendamentos 0" no "Clientes no mês" é a regra ("contados até agora",
 * `indicadores.md`) — e quem tinha 2 horários mais tarde lia que não tinha
 * nenhum. A etapa diz também "2 ainda hoje", sem mudar a conta dela.
 *
 * Pura: conta a lista do dia que a página já leu (a agenda de hoje, no
 * recorte da pessoa), fora os cancelados e as faltas.
 */
export function aindaHojeNaAgenda(
  agendamentos: readonly { scheduled_at: string; status: string }[], agora: Date,
): number {
  const t = agora.getTime()
  return agendamentos.filter(a => !['CANCELLED', 'NO_SHOW'].includes(a.status) && new Date(a.scheduled_at).getTime() > t).length
}
