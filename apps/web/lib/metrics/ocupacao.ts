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
  eventos: { start: string; durationMin: number; status: string }[],
  horarios: { unidade: Horario | null; profissional: Horario | null; ocupadoFora?: BlocoOcupado[] },
  dia: Date,
  /** O fuso da unidade (F62); sem ele, o de Brasília. */
  fuso?: string,
): number | null {
  const de = startOfDayTZ(dia, fuso), ate = endOfDayTZ(dia, fuso)
  const minutos = eventos
    .filter(e => !['CANCELLED', 'NO_SHOW'].includes(e.status))
    .filter(e => { const t = new Date(e.start).getTime(); return t >= de.getTime() && t <= ate.getTime() })
    .reduce((s, e) => s + e.durationMin, 0)
  return ocupacaoEmPct(minutos, horarios.unidade, [horarios.profissional], de, ate, [horarios.ocupadoFora ?? []], fuso)
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
  // da Patrícia na Água Verde". Sem isso, os minutos abertos não fechavam com
  // o horário que a tela mostra.
  const partes = (n.descontos ?? []).filter(d => d.minutos > 0)
    .map(d => d.onde ? `${min(d.minutos)} da ${d.quem} na ${d.onde}` : `${min(d.minutos)} bloqueados da ${d.quem}`)
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
