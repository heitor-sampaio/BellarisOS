/**
 * Vencimentos de lançamento. O dia ("2026-11-05") vira MEIO-DIA de Brasília:
 * à meia-noite UTC ele é a noite do dia anterior em Brasília, e o lançamento
 * aparecia vencido um dia antes (revisão de 2026-10-08).
 */

export function vencimentoDoDia(dia?: string | null): string | null {
  if (!dia) return null
  return /^\d{4}-\d{2}-\d{2}$/.test(dia) ? new Date(`${dia}T12:00:00-03:00`).toISOString() : new Date(dia).toISOString()
}

export type FrequenciaRecorrente = 'weekly' | 'biweekly' | 'monthly' | 'bimonthly' | 'quarterly' | 'yearly'

const MESES: Partial<Record<FrequenciaRecorrente, number>> = { monthly: 1, bimonthly: 2, quarterly: 3, yearly: 12 }
const DIAS: Partial<Record<FrequenciaRecorrente, number>> = { weekly: 7, biweekly: 14 }

/**
 * Os `n` vencimentos de uma despesa recorrente, a partir do primeiro. Conta
 * em UTC (o meio-dia de Brasília é 15:00Z, longe da virada do dia), e o dia
 * 31 num mês curto cai no último dia dele — não no começo do seguinte.
 */
export function vencimentosRecorrentes(primeiro: string, freq: FrequenciaRecorrente, n: number): string[] {
  const base = new Date(vencimentoDoDia(primeiro)!)
  return Array.from({ length: n }, (_, i) => {
    const dias = DIAS[freq]
    if (dias) return new Date(base.getTime() + dias * i * 86_400_000).toISOString()
    const meses = (MESES[freq] ?? 1) * i
    const alvo = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + meses, 1,
      base.getUTCHours(), base.getUTCMinutes()))
    const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate()
    alvo.setUTCDate(Math.min(base.getUTCDate(), ultimo))
    return alvo.toISOString()
  })
}
