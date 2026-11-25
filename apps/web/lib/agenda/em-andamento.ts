import { fimDaOcupacao } from '@/lib/appointments/ocupacao'

/**
 * "Em andamento" — UMA regra, do app da cliente e da equipe (o Heitor, 25/11:
 * "Um "Em andamento" não seria melhor?"; a regra que ele aprovou: "Em aberto,
 * com o início já passado e o fim ainda por vir, de qualquer dia (o de 30 horas
 * que começou ontem entra). Sai dali quando a equipe conclui ou quando o
 * horário acaba."; e, sobre a equipe: "Acho que seria mais útil para
 * rede/clínica [...] mas pode manter lá" — no painel da unidade, no da rede, na
 * Agenda e na Minha agenda).
 *
 * Em aberto (agendado, confirmado, na clínica ou em atendimento) e
 * início <= agora < fim, com o fim da OCUPAÇÃO (`fimDaOcupacao`: a duração nula
 * vale 60). O dia não conta: o atendimento pode durar mais de um.
 */
export const STATUS_EM_ABERTO = ['SCHEDULED', 'CONFIRMED', 'ARRIVED', 'IN_PROGRESS'] as const

export function emAndamento(
  a: { status: string; scheduled_at: string; duration_min?: number | null }, agora: Date = new Date(),
): boolean {
  if (!(STATUS_EM_ABERTO as readonly string[]).includes(a.status)) return false
  const t = agora.getTime()
  return new Date(a.scheduled_at).getTime() <= t
    && t < fimDaOcupacao({ scheduled_at: a.scheduled_at, duration_min: a.duration_min ?? null })
}
