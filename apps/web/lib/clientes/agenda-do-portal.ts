/**
 * Os "Próximos" e o "Histórico" da agenda do portal da cliente (D14 da
 * simulação de 2026-10-29).
 *
 * "Próximo" é UMA regra, a mesma da home ("Próximo agendamento"): em aberto
 * (agendado, confirmado ou já na clínica) e com o horário ainda por vir. A
 * Agenda filtrava só o status, e a avaliação de 28/10 23:50 "Na clínica"
 * aparecia em "Próximos" depois da meia-noite, com a home dizendo "Nenhum
 * agendamento próximo".
 *
 * O resto vai ao histórico, inclusive o que passou sem ser fechado (o "Na
 * clínica" de ontem, o "Em atendimento"): nada some da lista.
 */
export const STATUS_DO_PROXIMO = ['SCHEDULED', 'CONFIRMED', 'ARRIVED'] as const

export function ehProximo(a: { status: string; scheduled_at: string }, agora: Date = new Date()): boolean {
  return (STATUS_DO_PROXIMO as readonly string[]).includes(a.status)
    && new Date(a.scheduled_at).getTime() >= agora.getTime()
}

export function separarAgendaDoPortal<T extends { status: string; scheduled_at: string }>(
  agendamentos: T[], agora: Date = new Date(),
): { proximos: T[]; historico: T[] } {
  const proximos = agendamentos
    .filter(a => ehProximo(a, agora))
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
  const historico = agendamentos.filter(a => !ehProximo(a, agora))
  return { proximos, historico }
}
