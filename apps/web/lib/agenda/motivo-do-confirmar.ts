/**
 * O motivo ao lado do "Confirmar" desligado nas janelas de agendar e de
 * remarcar (a regra do botão desligado com o motivo; PV-16):
 * - o choque com outro atendimento (R06, o Heitor, 26/11, na página de
 *   perguntas: "Desliga o botão, e os três testes conferem o botão desligado");
 * - o horário bloqueado, da pessoa que atende ou da sala (R07, o Heitor, 26/11,
 *   no chat: "r07 se ta bloqueado não dá pra marcar");
 * - no remarcar, o horário novo que já passou (o Heitor, 25/11);
 * - no agendar, a sala JÁ escolhida que ficou ocupada quando o horário mudou
 *   (R13, o Heitor, 26/11: "Só mostra os horarios, salas e pessoas que estão
 *   livres" — a lista não a oferece mais, e a escolhida fica com o aviso;
 *   decisão do Claude, 26/11).
 * O detalhe fica no aviso junto do campo; aqui, só o porquê. O encaixe fora do
 * horário não desliga nada: é permitido. Nulo: o botão segue ligado.
 */
export function motivoDoConfirmarDesligado(o: { choque?: boolean; bloqueio?: boolean; passou?: boolean; salaOcupada?: boolean }): string | null {
  if (o.passou) return 'Escolha outro horário: este já passou.'
  if (o.choque) return 'Escolha outro horário: este bate com outro atendimento.'
  if (o.bloqueio) return 'Escolha outro horário: este está bloqueado.'
  if (o.salaOcupada) return 'Escolha outra sala ou outro horário: esta sala está ocupada.'
  return null
}
