import { BUSINESS_TZ, startOfDayTZ } from '@/lib/datetime'

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
export const STATUS_DO_PROXIMO = ['SCHEDULED', 'CONFIRMED', 'ARRIVED', 'IN_PROGRESS'] as const

/**
 * O início de HOJE no relógio da unidade (F62; sem ele, Brasília), em ISO: de onde os "Próximos" começam (A51 da
 * 7ª simulação, 2026-11-05). O agendamento de hoje que passou da hora sem ser
 * concluído — a clínica ainda vai fechar — sumia da home ("Nenhum agendamento
 * próximo") até a conclusão.
 */
export function inicioDosProximos(agora: Date = new Date(), fuso: string = BUSINESS_TZ): string {
  // O hoje da UNIDADE (F62).
  return startOfDayTZ(agora, fuso).toISOString()
}

/**
 * Em aberto (agendado, confirmado, na clínica ou em atendimento) e com o
 * horário ainda por vir — ou de HOJE, mesmo passado da hora (A51): fica até a
 * clínica concluir. O de ontem em aberto vai ao histórico (D14).
 */
export function ehProximo(a: { status: string; scheduled_at: string }, agora: Date = new Date(), fuso?: string): boolean {
  return (STATUS_DO_PROXIMO as readonly string[]).includes(a.status)
    && new Date(a.scheduled_at).getTime() >= new Date(inicioDosProximos(agora, fuso)).getTime()
}

/** O horário já passou (o de hoje que segue em "Próximos" até a conclusão — A51). */
export function jaPassouDaHora(scheduledAt: string, agora: Date = new Date()): boolean {
  return new Date(scheduledAt).getTime() < agora.getTime()
}

export function separarAgendaDoPortal<T extends { status: string; scheduled_at: string }>(
  agendamentos: T[], agora: Date = new Date(),
  /** O fuso da unidade de cada agendamento (F62: o "hoje" é o dela). */
  fusoDe: (a: T) => string | undefined = () => undefined,
): { proximos: T[]; historico: T[] } {
  const proximos = agendamentos
    .filter(a => ehProximo(a, agora, fusoDe(a)))
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
  const historico = agendamentos.filter(a => !ehProximo(a, agora, fusoDe(a)))
  return { proximos, historico }
}

/**
 * "terça-feira, 03/11 às 10:00" — o dia e a hora da unidade (F62; o servidor roda
 * em UTC). A58 da 11ª: "até ter, 10/11 às 14:00" — o dia da semana por extenso.
 */
export function diaEHoraNoPortal(d: Date, fuso: string = BUSINESS_TZ): string {
  const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('pt-BR', { timeZone: fuso, ...o }).format(d)
  const semana = f({ weekday: 'long' })
  return `${semana}, ${f({ day: '2-digit', month: '2-digit' })} às ${f({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}`
}

/**
 * Até quando a cliente cancela ou remarca pelo app (J-61): o horário menos o
 * prazo da rede, em dia e hora — "ter, 03/11 às 10:00". Era só "até 24 horas
 * antes", e ela fazia a conta.
 */
export function limiteParaAlterar(scheduledAt: string, prazoHoras: number, fuso?: string): string {
  return diaEHoraNoPortal(new Date(new Date(scheduledAt).getTime() - prazoHoras * 3600_000), fuso)
}

/** Ainda dá para cancelar ou remarcar pelo app: falta pelo menos o prazo da rede. */
export function aindaDaParaAlterar(scheduledAt: string, prazoHoras: number, agora: number = Date.now()): boolean {
  return new Date(scheduledAt).getTime() - agora >= prazoHoras * 3600_000
}
