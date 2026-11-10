/**
 * Até quando um agendamento ocupa o horário, e se ele bate num intervalo —
 * puro, a régua da recusa (`conflitosDoHorario`), dos livres do app
 * (`computeAvailableSlots`) e da grade (`ocupanteDoHorario`).
 */

/**
 * Até quando um agendamento ocupa o horário (A31 da 5ª simulação): o
 * CONCLUÍDO adiantado libera o resto — ocupa só até a conclusão (a Bianca
 * concluiu às 10:53 o das 12:00, e o das 12:00 seguia ocupado, com a sala).
 * Concluído antes de começar não ocupa nada (o fim fica antes do início).
 */
export function fimDaOcupacao(a: { scheduled_at: string; duration_min: number | null; status?: string | null; completed_at?: string | null }): number {
  const fim = new Date(a.scheduled_at).getTime() + (a.duration_min || 60) * 60000
  if (a.status === 'COMPLETED' && a.completed_at) return Math.min(fim, new Date(a.completed_at).getTime())
  return fim
}

/**
 * O intervalo [ini, fim) bate com a ocupação [oIni, oFim)? A ocupação VAZIA
 * ou INVERTIDA (o concluído antes de começar: marcado às 10:30, concluído às
 * 10:14) não ocupa nada e não bate em nada (D3 da 11ª simulação: a recusa
 * dizia "já tem atendimento das 10:30 às 10:14" para as 10:07 — a grade já o
 * mostrava livre desde a A16 da 10ª).
 */
export function bateNaOcupacao(ini: number, fim: number, oIni: number, oFim: number): boolean {
  if (!(oFim > oIni)) return false
  return ini < oFim && fim > oIni
}
