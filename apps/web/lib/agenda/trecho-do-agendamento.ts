import { minutosDesenhados, type AgendamentoNaGrade } from '@/lib/agenda/desenho'

/**
 * O pedaço de um agendamento que cai em cada dia da grade (princípio 3: o que
 * a tela mostra é o que vale). O procedimento não tem duração máxima e o
 * agendamento soma as durações; a conferência do choque já vale com qualquer
 * duração (`podemOcuparDesde`, 25/11). As agendas punham o agendamento só no
 * dia em que COMEÇA: o que atravessa a meia-noite, ou dura dias, sumia dos
 * dias seguintes — o dia parecia livre, e o choque recusava.
 *
 * Como o bloqueio de vários dias (`bloqueioNoDia`, lib/agenda/bloqueio): em
 * cada dia que ele ocupa, o cartão aparece do topo do dia e diz de quando
 * continua (o início real). O fim é o da OCUPAÇÃO (`minutosDesenhados`: o
 * concluído adiantado libera o resto). O cancelado e a falta não ocupam nada:
 * ficam só no dia deles, como sempre.
 *
 * Puro, no relógio de quem vê (a grade é "de parede": os campos locais são o
 * relógio da unidade), como `bloqueioNoDia`.
 */

const DIA_MIN = 24 * 60

export interface TrechoDoAgendamento {
  /** Minutos desde a meia-noite do dia em que o trecho começa (0: continua de antes). */
  de: number
  /** Minutos desde a meia-noite em que o trecho acaba (no máximo 24 h: o resto é do dia seguinte). */
  ate: number
  /** Começou num dia anterior: o cartão começa no topo e diz o início real. */
  continuaDeAntes: boolean
  /** Segue no dia seguinte (atravessa a meia-noite). */
  continuaDepois: boolean
}

const desmarcado = (status: string) => status === 'CANCELLED' || status === 'NO_SHOW'

/** O trecho do agendamento no dia (`dia`: qualquer instante dele). Nulo: não toca o dia. */
export function trechoDoAgendamentoNoDia(a: AgendamentoNaGrade, dia: Date): TrechoDoAgendamento | null {
  const ini = new Date(a.start).getTime()
  if (Number.isNaN(ini)) return null
  const inicioDoDia = new Date(dia); inicioDoDia.setHours(0, 0, 0, 0)
  const fimDoDia = new Date(inicioDoDia); fimDoDia.setDate(fimDoDia.getDate() + 1)
  const i0 = inicioDoDia.getTime(), i1 = fimDoDia.getTime()
  const fim = ini + minutosDesenhados(a) * 60_000
  // O dia em que começa: o desenho de sempre (o fim cortado na meia-noite, que segue amanhã).
  if (ini >= i0 && ini < i1) {
    const de = (ini - i0) / 60_000
    return { de, ate: Math.min(DIA_MIN, (fim - i0) / 60_000), continuaDeAntes: false, continuaDepois: fim > i1 }
  }
  if (ini >= i0 || desmarcado(a.status) || fim <= i0) return null
  return { de: 0, ate: Math.min(DIA_MIN, (fim - i0) / 60_000), continuaDeAntes: true, continuaDepois: fim > i1 }
}

/** Os agendamentos que aparecem no dia — os que começam nele e os que continuam de antes —, na ordem da lista. */
export function agendamentosNoDia<E extends AgendamentoNaGrade>(eventos: readonly E[], dia: Date): { ev: E; trecho: TrechoDoAgendamento }[] {
  const saida: { ev: E; trecho: TrechoDoAgendamento }[] = []
  for (const ev of eventos) {
    const t = trechoDoAgendamentoNoDia(ev, dia)
    if (t) saida.push({ ev, trecho: t })
  }
  return saida
}

/** "Continua de 09/12 às 08:00": o início real, no cartão do dia seguinte (relógio da grade). */
export function textoDoQueContinua(start: string): string {
  const d = new Date(start)
  const p = (n: number) => String(n).padStart(2, '0')
  return `Continua de ${p(d.getDate())}/${p(d.getMonth() + 1)} às ${p(d.getHours())}:${p(d.getMinutes())}`
}

/**
 * A janela da grade (horas cheias) com o que atravessa a meia-noite. O que
 * começa no dia já estende a janela por `estenderJanela`; aqui, só o resto:
 * - o que segue amanhã fecha a grade em 24 (como `estenderJanela` faz com quem
 *   vira a meia-noite em menos de um dia);
 * - o que continua de antes não abre a grade na meia-noite: o cartão começa no
 *   topo dela, como o bloqueio. Só se acaba ANTES da abertura a grade abre na
 *   última hora dele — senão o cartão não apareceria.
 */
export function janelaComOsTrechos(janela: { inicio: number; fim: number }, trechos: readonly TrechoDoAgendamento[]): { inicio: number; fim: number } {
  let { inicio, fim } = janela
  for (const t of trechos) {
    if (t.continuaDepois) fim = 24
    if (t.continuaDeAntes) {
      const horaDoFim = Math.ceil(t.ate / 60)
      fim = Math.max(fim, horaDoFim)
      if (t.ate <= inicio * 60) inicio = Math.max(0, horaDoFim - 1)
    }
  }
  return { inicio, fim: Math.min(24, Math.max(fim, inicio + 1)) }
}
