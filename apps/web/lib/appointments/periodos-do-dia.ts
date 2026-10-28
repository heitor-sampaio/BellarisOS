/**
 * Os horários livres agrupados em Manhã, Tarde e Noite (A42 da simulação de
 * 2026-10-27): a lista vinha com 32 horários seguidos. Puro: serve à tela.
 * Manhã até 11:59, Tarde até 17:59, Noite daí em diante; grupo vazio some.
 */
export type PeriodoDoDia = 'Manhã' | 'Tarde' | 'Noite'

export function gruposDeHorario(horarios: string[]): { periodo: PeriodoDoDia; horarios: string[] }[] {
  const grupos: Record<PeriodoDoDia, string[]> = { Manhã: [], Tarde: [], Noite: [] }
  for (const h of horarios) {
    const hora = Number(h.slice(0, 2))
    grupos[hora < 12 ? 'Manhã' : hora < 18 ? 'Tarde' : 'Noite'].push(h)
  }
  return (['Manhã', 'Tarde', 'Noite'] as const)
    .filter(p => grupos[p].length > 0)
    .map(p => ({ periodo: p, horarios: grupos[p] }))
}
