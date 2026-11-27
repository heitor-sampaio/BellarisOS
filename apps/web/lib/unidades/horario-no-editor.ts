import { HORARIO_PADRAO, intervalosDoDia, periodoAoAbrirODia, resumoDoHorario, type Horario, type Intervalo } from '@/lib/agenda/horario'

/**
 * O horário do editor em texto, à vista antes de salvar (A25 da 19ª
 * simulação, 2026-11-16; princípio 3). "Repetir o horário de segunda em todos
 * os dias (domingo incluído)" abriu o domingo, e quem repetiu saiu achando que
 * ele estava fechado. O resumo é o mesmo de quem agenda (`resumoDoHorario`),
 * com os dias fechados ditos: "Fica assim: Seg a sáb, 09:00–18:00. Domingo fechado".
 */
const NOMES: [string, string][] = [
  ['1', 'segunda'], ['2', 'terça'], ['3', 'quarta'], ['4', 'quinta'], ['5', 'sexta'], ['6', 'sábado'], ['0', 'domingo'],
]
const junto = (l: string[]) => (l.length < 2 ? l.join('') : `${l.slice(0, -1).join(', ')} e ${l[l.length - 1]}`)

/**
 * O que vale do horário próprio (AG-10, AG-64; princípio 3): dentro do horário
 * da unidade. Com a unidade (quem é de uma unidade só, ou da rede de uma
 * unidade), o resumo do editor mostra o cruzamento — 07:00 com a unidade
 * abrindo às 08:00 diz 08:00 (decisão do Claude, 27/11, 39ª simulação). Sem
 * ela (várias unidades: vale o de cada uma), o que a pessoa marcou.
 */
export function diasQueValem(dias: Record<string, Intervalo[]>, dentroDe: Horario | null): Record<string, Intervalo[]> {
  if (!dentroDe) return dias
  return Object.fromEntries(Object.keys(dias).map(k => [k, intervalosDoDia(dentroDe, { dias }, Number(k))]))
}

export function resumoDoEditorDeHorario(dias: Record<string, Intervalo[] | undefined>): string {
  const abertos = resumoDoHorario({ dias }, null)
  if (!abertos.length) return 'Fica assim: fechado todos os dias'
  const fechados = NOMES.filter(([k]) => !(dias[k] ?? []).length).map(([, n]) => n)
  const fecha = fechados.length
    ? `. ${(junto(fechados).charAt(0).toUpperCase())}${junto(fechados).slice(1)} ${fechados.length === 1 ? 'fechado' : 'fechados'}` : ''
  return `Fica assim: ${abertos.join('; ')}${fecha}`
}

/**
 * Desligar o "Aberta 24 horas, todos os dias" sem o horário de antes do atalho
 * (o horário já veio em 24 h — o da unidade aberta 24 horas). A24 da 34ª
 * simulação (princípio 7): voltava ao da base, 24 h de novo, e nada mudava.
 * Vale para todos os dias: o dia em 24 h na base sai das 24 h
 * (`periodoAoAbrirODia`, sem o dia inteiro); o dia com horário volta a ele; o
 * fechado na base fica fechado.
 */
export function aoDesligarAs24Horas(base: Horario | null | undefined): Record<string, Intervalo[]> {
  const h = base ?? HORARIO_PADRAO
  return Object.fromEntries(NOMES.map(([d]) => [d, (h.dias[d] ?? []).length ? periodoAoAbrirODia(h, d, { semDiaInteiro: true }) : []]))
}
