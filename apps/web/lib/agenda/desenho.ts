import { fimDaOcupacao } from '@/lib/appointments/ocupacao'

/**
 * O DESENHO de um agendamento nas grades (A17 da 14ª simulação, F75) — a
 * régua é a da recusa (`fimDaOcupacao`, A31 da 5ª): o concluído adiantado
 * libera o resto do horário, e a grade o desenha até a CONCLUSÃO. Era a
 * duração marcada: a Cliente 02 das 19:00, concluída às 18:10, seguia
 * desenhada até as 20:00, e a Bianca das 18:45 (que coube, pela regra) ficava
 * coberta — no celular, o toque caía no outro cartão.
 *
 * Puro: serve à grade da unidade, à da rede e à "Minha agenda".
 */

export interface AgendamentoNaGrade {
  /** ISO do início (o de parede da grade, ou o instante — os dois andam juntos). */
  start: string
  durationMin: number
  status: string
  /** ISO da conclusão (na MESMA régua do `start`). */
  completedAt?: string | null
}

/**
 * Os minutos que a grade desenha: até quando o agendamento OCUPA. O concluído
 * antes de começar não ocupa nada (0) — a grade o desenha só com a altura
 * mínima do cartão, no horário marcado.
 */
export function minutosDesenhados(a: AgendamentoNaGrade): number {
  const ini = new Date(a.start).getTime()
  const fim = fimDaOcupacao({ scheduled_at: a.start, duration_min: a.durationMin, status: a.status, completed_at: a.completedAt ?? null })
  return Math.max(0, Math.round((fim - ini) / 60_000))
}

/** O agendamento LIBEROU o horário que tinha (concluído antes do fim marcado)? */
export function liberouOHorario(a: AgendamentoNaGrade): boolean {
  return minutosDesenhados(a) < (a.durationMin || 60)
}

/**
 * Quem divide a largura com quem, numa coluna da grade: os cartões que se
 * cruzam NA TELA (com a altura mínima de cada um) ficam lado a lado, em
 * vez de um por cima do outro. Devolve, por id, a coluna e o total de colunas
 * do grupo que se cruza. `topo` e `altura` em px (a conta da própria grade).
 */
export function ladoALado<T extends { id: string }>(
  itens: T[], topo: (x: T) => number, altura: (x: T) => number,
): Map<string, { col: number; total: number }> {
  const ordem = [...itens].sort((a, b) => topo(a) - topo(b) || a.id.localeCompare(b.id))
  const saida = new Map<string, { col: number; total: number }>()
  let grupo: T[] = []
  let fimDoGrupo = -Infinity
  let colunas: number[] = [] // o fim (px) do último cartão de cada coluna
  const fechar = () => {
    const total = Math.max(1, colunas.length)
    for (const x of grupo) saida.set(x.id, { col: saida.get(x.id)!.col, total })
    grupo = []; colunas = []; fimDoGrupo = -Infinity
  }
  for (const x of ordem) {
    const ini = topo(x), fim = ini + altura(x)
    if (grupo.length && ini >= fimDoGrupo) fechar()
    let col = colunas.findIndex(f => f <= ini)
    if (col < 0) { col = colunas.length; colunas.push(fim) } else colunas[col] = fim
    saida.set(x.id, { col, total: 1 })
    grupo.push(x)
    fimDoGrupo = Math.max(fimDoGrupo, fim)
  }
  if (grupo.length) fechar()
  return saida
}
