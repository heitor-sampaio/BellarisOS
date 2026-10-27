import { dayKeyTZ } from '@/lib/datetime'

/**
 * "Chegou" só vale no DIA do agendamento, em Brasília (A18 da simulação de
 * 2026-10-27: a recepção marcava a chegada de amanhã, e a de ontem). A conta
 * é por dia, não por hora: a cliente que chega cedo ou atrasada ainda é a do dia.
 */
export function ehODiaDoAgendamento(scheduledAt: string | Date, agora: Date = new Date()): boolean {
  return dayKeyTZ(scheduledAt) === dayKeyTZ(agora)
}
