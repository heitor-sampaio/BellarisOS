import { dayKeyTZ, addDaysTZ, startOfDayTZ } from '../../lib/datetime'

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

/**
 * "N minutos atrás" (ISO), mas sem sair de HOJE em Brasília: logo depois da
 * meia-noite, para no começo do dia (F26, 2026-11-05).
 *
 * A 3ª completa rodou às 00:04 de Brasília, e os specs que gravavam o
 * agendamento "agora menos 8 minutos" o puseram às 23:56 de ONTEM: a agenda
 * de hoje não o mostrava, a chegada recusava ("só no dia do agendamento") e o
 * relatório "de hoje" contava metade. Teste que precisa de um horário que JÁ
 * passou e que seja de HOJE usa este.
 */
export function haMinutosHoje(minutos: number, agora = new Date()): string {
  const antes = agora.getTime() - minutos * 60_000
  return new Date(Math.max(antes, startOfDayTZ(agora).getTime())).toISOString()
}
