import { ocupacaoEmPct, capacidadeEmMinutos, type Horario, type BlocoOcupado } from '@/lib/agenda/horario'
import { startOfDayTZ, endOfDayTZ } from '@/lib/datetime'

/**
 * A ocupação de UM dia de uma agenda já carregada na tela (a "Minha agenda"
 * da profissional) — a MESMA conta da agenda da unidade e do dashboard
 * (§13.1, `ocupacaoEmPct`): os minutos agendados no dia de Brasília, sem
 * cancelados nem faltas (os concluídos contam), ÷ a capacidade do horário —
 * unidade ∩ profissional, menos o que ela tem agendado em outra unidade.
 *
 * A "Minha agenda" dividia por um dia FIXO de 8 h, na tela: a Camila, que
 * atende das 18:00 às 23:30, via 32% em vez de 47% (D11 da simulação de
 * 2026-10-29). Puro, sem servidor: roda no navegador.
 */
export function ocupacaoDoDia(
  eventos: AgendamentoQueOcupa[],
  horarios: { unidade: Horario | null; profissional: Horario | null; ocupadoFora?: BlocoOcupado[] },
  dia: Date,
  /** O fuso da unidade (F62); sem ele, o de Brasília. */
  fuso?: string,
): number | null {
  const de = startOfDayTZ(dia, fuso), ate = endOfDayTZ(dia, fuso)
  const minutos = minutosAgendadosNoPeriodo(eventos, de, ate)
  return ocupacaoEmPct(minutos, horarios.unidade, [horarios.profissional], de, ate, [horarios.ocupadoFora ?? []], fuso)
}

/** Um agendamento como as agendas o têm: o início, a duração, a situação e a conclusão. */
export interface AgendamentoQueOcupa { start: string; durationMin: number; status: string; completedAt?: string | null }

/**
 * Os minutos que UM agendamento ocupa dentro do período [de, ate] (`ate` é o
 * último instante, como o de `endOfDayTZ`). O procedimento não tem duração
 * máxima (25/11): o que atravessa a meia-noite, ou dura dias, ocupa cada dia
 * um pedaço — o MESMO trecho que as agendas desenham
 * (`trechoDoAgendamentoNoDia`). A ocupação somava a duração inteira no dia do
 * início: o de 30 h dava mais de 100% num dia e 0% no seguinte (princípio 3).
 * Só o RECORTE pelo dia é novo; a definição não muda (§13.1): conta a duração
 * MARCADA, o concluído inclusive (também o concluído adiantado), e o cancelado
 * e a falta não ocupam nada.
 */
export function minutosNoPeriodo(a: AgendamentoQueOcupa, de: Date, ate: Date): number {
  if (a.status === 'CANCELLED' || a.status === 'NO_SHOW') return 0
  const ini = new Date(a.start).getTime()
  if (Number.isNaN(ini)) return 0
  const fim = ini + (a.durationMin || 0) * 60_000
  const dentro = Math.min(fim, ate.getTime() + 1) - Math.max(ini, de.getTime())
  return dentro > 0 ? dentro / 60_000 : 0
}

/** Os minutos agendados no período (a parte de cima da ocupação): a soma dos trechos, sem cancelados nem faltas. */
export function minutosAgendadosNoPeriodo(eventos: readonly AgendamentoQueOcupa[], de: Date, ate: Date): number {
  return eventos.reduce((s, e) => s + minutosNoPeriodo(e, de, ate), 0)
}

/**
 * A base da ocupação, em palavras (A53 da 9ª simulação, 2026-11-07: "13%" sem
 * a conta, e a Carolina não conseguiu prová-la): "340 min agendados de 2.720
 * min abertos (o horário de 4 profissionais que atendem)". Os números já vêm
 * contados (a capacidade é a de `capacidadeEmMinutos`); aqui é só o texto.
 */
export function baseDaOcupacao(n: { agendados: number; abertos: number; profissionais: number; descontos?: DescontoDaOcupacao[] }): string {
  const min = (v: number) => `${Math.round(v).toLocaleString('pt-BR')} min`
  const quem = n.profissionais === 1 ? '1 profissional que atende' : `${n.profissionais} profissionais que atendem`
  // A9 da 13ª (princípio 3): o que saiu da capacidade, dito — "menos 140 min
  // de Patrícia atendendo em Água Verde". Sem isso, os minutos abertos não fechavam com
  // o horário que a tela mostra.
  const partes = (n.descontos ?? []).filter(d => d.minutos > 0)
    // A13 da 16ª: "de" (sem gênero) e "atendendo em" (a unidade fora do alcance vem como "outra unidade").
    .map(d => d.onde ? `${min(d.minutos)} de ${d.quem} atendendo em ${d.onde}` : `${min(d.minutos)} bloqueados de ${d.quem}`)
  const menos = partes.length
    ? `, menos ${partes.length === 1 ? partes[0] : `${partes.slice(0, -1).join(', ')} e ${partes.at(-1)}`}`
    : ''
  return `${min(n.agendados)} agendados de ${min(n.abertos)} abertos (o horário de ${quem}${menos})`
}

/** Um desconto da capacidade: quanto, de quem, e onde (nulo = bloqueio). */
export interface DescontoDaOcupacao { minutos: number; quem: string; onde: string | null }

/**
 * O que saiu da capacidade de cada profissional, por outra unidade e pelo
 * bloqueio (A9 da 13ª). A MESMA conta de `capacidadeEmMinutos`, acumulada um
 * grupo de cada vez: o bloqueio que cai sobre o da outra unidade não sai duas
 * vezes, e a soma dos descontos é exatamente o que a capacidade perdeu.
 */
export function descontosDaOcupacao(
  unidade: Horario | null,
  profissionais: { nome: string; horario: Horario | null; blocos: BlocoOcupado[] }[],
  de: Date, ate: Date,
  /** O fuso da unidade (F62). */
  fuso?: string,
): DescontoDaOcupacao[] {
  const saida: DescontoDaOcupacao[] = []
  for (const p of profissionais) {
    if (!p.blocos.length) continue
    // A outra unidade primeiro (na ordem em que aparecem), o bloqueio por último.
    const grupos = new Map<string, BlocoOcupado[]>()
    for (const b of p.blocos) grupos.set(b.onde ?? '', [...(grupos.get(b.onde ?? '') ?? []), b])
    const ordem = [...grupos.keys()].sort((a, b) => (a === '' ? 1 : 0) - (b === '' ? 1 : 0))
    let antes = capacidadeEmMinutos(unidade, [p.horario], de, ate, [[]], fuso)
    const acumulados: BlocoOcupado[] = []
    for (const onde of ordem) {
      acumulados.push(...grupos.get(onde)!)
      const depois = capacidadeEmMinutos(unidade, [p.horario], de, ate, [acumulados], fuso)
      if (antes - depois > 0) saida.push({ minutos: antes - depois, quem: p.nome, onde: onde || null })
      antes = depois
    }
  }
  return saida
}
