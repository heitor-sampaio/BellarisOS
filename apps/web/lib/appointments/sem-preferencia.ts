/**
 * "Sem preferência" de profissional no agendamento do app (D-16, decisão do
 * Heitor, 2026-10-30): a tela junta os horários livres de todas as
 * profissionais que atendem na unidade e, ao confirmar, o sistema escolhe
 * quem está livre naquele horário, com menos atendimentos no dia.
 *
 * Contas puras — os livres de cada uma vêm de `computeAvailableSlots` (o
 * horário da unidade ∩ o dela, sem o ocupado), lidos no servidor.
 */

export interface CandidataDoHorario {
  id: string
  nome: string
  /** Os inícios livres dela no dia ("HH:MM"). */
  livres: string[]
  /** Quantos atendimentos (não cancelados nem faltas) ela já tem no dia, em qualquer unidade. */
  atendimentosNoDia: number
}

/** Os horários de todas, sem repetir, em ordem. */
export function juntarHorarios(listas: string[][]): string[] {
  return [...new Set(listas.flat())].sort()
}

/**
 * Quem atende naquele horário: entre as livres, a de menos atendimentos no
 * dia; no empate, a primeira pelo nome (e pelo id) — a escolha não depende da
 * ordem em que a lista chegou. Ninguém livre: nula.
 */
export function escolherQuemAtende(candidatas: CandidataDoHorario[], hora: string): string | null {
  const livres = candidatas.filter(c => c.livres.includes(hora))
  if (!livres.length) return null
  livres.sort((a, b) =>
    a.atendimentosNoDia - b.atendimentosNoDia
    || a.nome.localeCompare(b.nome, 'pt-BR')
    || a.id.localeCompare(b.id))
  return livres[0]!.id
}
