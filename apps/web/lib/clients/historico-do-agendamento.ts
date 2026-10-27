/**
 * A confirmação e a chegada na linha do tempo da cliente (A23, 2026-10-27):
 * só o agendamento, o atendimento e o cancelamento apareciam. As datas já
 * moram no agendamento (`confirmed_at`, `arrived_at`).
 */
export interface EventoDoAgendamento {
  id: string; procedureName: string
  confirmed_at: string | null; arrived_at: string | null
}

export function eventosDeConfirmacaoEChegada(a: EventoDoAgendamento, link: string | null) {
  const base = { subtitle: null, amount: null, link }
  const eventos: { id: string; date: string; type: 'APPOINTMENT_CONFIRMED' | 'APPOINTMENT_ARRIVED'; title: string; subtitle: null; amount: null; link: string | null }[] = []
  if (a.confirmed_at) eventos.push({ id: `${a.id}-conf`, date: a.confirmed_at, type: 'APPOINTMENT_CONFIRMED', title: `Confirmado: ${a.procedureName}`, ...base })
  if (a.arrived_at) eventos.push({ id: `${a.id}-cheg`, date: a.arrived_at, type: 'APPOINTMENT_ARRIVED', title: `Chegou: ${a.procedureName}`, ...base })
  return eventos
}
