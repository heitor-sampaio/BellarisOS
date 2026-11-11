import { formatDate, formatTime } from '@estetica-os/utils'

/**
 * O horário NOVO de um remarcar que já passou (A24 da 11ª simulação,
 * 2026-11-10: remarcar para um horário que já passou era aceito calado).
 * Princípio 2: avisar, não recusar — remarcar para trás serve para registrar
 * um atendimento que aconteceu em outro horário.
 */
export function avisoDoHorarioPassado(scheduledAt: string, agora: Date = new Date(), fuso?: string): string | null {
  const quando = new Date(scheduledAt)
  if (Number.isNaN(quando.getTime()) || quando.getTime() >= agora.getTime()) return null
  return `O horário novo (${formatDate(quando.toISOString(), fuso)} às ${formatTime(quando.toISOString(), fuso)}) já passou: o agendamento fica no passado. Remarcar assim é permitido — confira se é o horário certo.`
}
