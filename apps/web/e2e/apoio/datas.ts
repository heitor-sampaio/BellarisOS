import { dayKeyTZ, addDaysTZ } from '../../lib/datetime'

/**
 * O dia (AAAA-MM-DD, Brasília) daqui a `dias`, ou o seguinte em que a unidade
 * ABRE no horário padrão (segunda a sábado — `lib/agenda/horario.ts`).
 *
 * Teste que agenda por horário LIVRE (o app da cliente, o remarcar) não pode
 * cair num domingo: desde o horário de funcionamento (2026-10-21) não há
 * livre nenhum, e o teste falha conforme o dia em que roda. Foi o que derrubou
 * `portal-cliente` na completa de 2026-10-22 (hoje + 45 = domingo).
 */
export function diaEmQueAUnidadeAbre(dias: number, agora = new Date()): string {
  let d = addDaysTZ(agora, dias)
  // Meio-dia de Brasília do dia, para o dia da semana não escorregar pelo fuso.
  while (new Date(`${dayKeyTZ(d)}T12:00:00-03:00`).getUTCDay() === 0) d = addDaysTZ(d, 1)
  return dayKeyTZ(d)
}
