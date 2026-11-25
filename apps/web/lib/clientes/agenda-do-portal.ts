import { BUSINESS_TZ, startOfDayTZ } from '@/lib/datetime'
import { emAndamento } from '@/lib/agenda/em-andamento'

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
 *
 * Acima dos dois, o "Em andamento" (o Heitor, 25/11): o em aberto que já
 * começou e não acabou, de qualquer dia (`emAndamento`).
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

/**
 * Agendado ou confirmado, e o horário (início + duração) já acabou (A46 da
 * 24ª, princípio 3): segue em "Próximos" até a equipe registrar (A51 da 7ª),
 * mas o app diz que o horário passou em vez de "Agendado" e "Prazo do app
 * encerrado". Na clínica ou em atendimento, não: a equipe já está nele.
 */
export function horarioPassouSemAtender(
  a: { status: string; scheduled_at: string; duration_min?: number | null }, agora: Date = new Date(),
): boolean {
  if (a.status !== 'SCHEDULED' && a.status !== 'CONFIRMED') return false
  return new Date(a.scheduled_at).getTime() + (a.duration_min ?? 60) * 60_000 <= agora.getTime()
}

/** "Em andamento": a regra é uma só, do app e da equipe (`lib/agenda/em-andamento.ts`). */
export { emAndamento } from '@/lib/agenda/em-andamento'

/**
 * Os três grupos da agenda do portal, sem repetir nada: o "Em andamento"
 * (acima de tudo), os "Próximos" (D14 e A51, menos o que está em andamento) e
 * o Histórico (o resto). O que acabou sem ser fechado segue a regra de antes
 * (o Heitor, 25/11: "fica em "Próximos" com "o horário passou" até o fim do
 * dia, depois vai ao Histórico").
 */
export function separarAgendaDoPortal<T extends { status: string; scheduled_at: string; duration_min?: number | null }>(
  agendamentos: T[], agora: Date = new Date(),
  /** O fuso da unidade de cada agendamento (F62: o "hoje" é o dela). */
  fusoDe: (a: T) => string | undefined = () => undefined,
): { emAndamento: T[]; proximos: T[]; historico: T[] } {
  const porInicio = (x: T, y: T) => new Date(x.scheduled_at).getTime() - new Date(y.scheduled_at).getTime()
  const andamento: T[] = []
  const proximos: T[] = []
  const historico: T[] = []
  for (const a of agendamentos) {
    if (emAndamento(a, agora)) andamento.push(a)
    else if (ehProximo(a, agora, fusoDe(a))) proximos.push(a)
    else historico.push(a)
  }
  return { emAndamento: andamento.sort(porInicio), proximos: proximos.sort(porInicio), historico }
}

/**
 * "terça-feira, 03/11 às 10:00" — o dia e a hora da unidade (F62; o servidor roda
 * em UTC). A58 da 11ª: "até ter, 10/11 às 14:00" — o dia da semana por extenso.
 */
export function diaEHoraNoPortal(d: Date, fuso: string = BUSINESS_TZ, comAno = false): string {
  const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('pt-BR', { timeZone: fuso, ...o }).format(d)
  const semana = f({ weekday: 'long' })
  const dia = f({ day: '2-digit', month: '2-digit', ...(comAno ? { year: 'numeric' } : {}) })
  return `${semana}, ${dia} às ${f({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}`
}

/**
 * Até quando a cliente cancela ou remarca pelo app (J-61): o horário menos o
 * prazo da rede, em dia e hora — "ter, 03/11 às 10:00". Era só "até 24 horas
 * antes", e ela fazia a conta.
 *
 * O limite que cai em OUTRO ano que o do horário diz o ano ("08/12/2026"):
 * o prazo da rede pode passar de um ano (o Heitor, 25/11: "Se não for
 * impossível, ainda que improvável, pode ser feito."), e "08/12" de um horário
 * em março se leria como o dezembro seguinte (princípio 3; decisão do Claude,
 * 25/11). O ano se compara no fuso da unidade.
 */
export function limiteParaAlterar(scheduledAt: string, prazoHoras: number, fuso: string = BUSINESS_TZ): string {
  const horario = new Date(scheduledAt)
  const limite = new Date(horario.getTime() - prazoHoras * 3600_000)
  const ano = (d: Date) => new Intl.DateTimeFormat('pt-BR', { timeZone: fuso, year: 'numeric' }).format(d)
  return diaEHoraNoPortal(limite, fuso, ano(limite) !== ano(horario))
}

/** Ainda dá para cancelar ou remarcar pelo app: falta pelo menos o prazo da rede. */
export function aindaDaParaAlterar(scheduledAt: string, prazoHoras: number, agora: number = Date.now()): boolean {
  return new Date(scheduledAt).getTime() - agora >= prazoHoras * 3600_000
}

/**
 * O cartão diz "Prazo do app encerrado: fale com … para alterar" (A53 da 7ª):
 * agendado ou confirmado, o horário ainda não acabou (A46) e o prazo do app
 * já passou, de hoje em diante — e em TODO em andamento, também o que começou
 * ontem (decisão do Claude, 25/11, princípio 3: depois do início o prazo já
 * passou, e o mesmo cartão não diz coisas diferentes conforme o dia em que
 * começou).
 */
export function prazoDoAppEncerrado(
  a: { status: string; scheduled_at: string; duration_min?: number | null },
  prazoHoras: number, agora: Date = new Date(), fuso?: string,
): boolean {
  return ['SCHEDULED', 'CONFIRMED'].includes(a.status) && !horarioPassouSemAtender(a, agora)
    && !aindaDaParaAlterar(a.scheduled_at, prazoHoras, agora.getTime())
    && (new Date(a.scheduled_at).getTime() > new Date(inicioDosProximos(agora, fuso)).getTime() || emAndamento(a, agora))
}
