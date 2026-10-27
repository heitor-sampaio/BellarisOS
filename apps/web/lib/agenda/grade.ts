/** "1 atendimento", "2 atendimentos" (A17 da simulação de 2026-10-27). */
export function atendimentosPorExtenso(n: number): 'atendimento' | 'atendimentos' {
  return n === 1 ? 'atendimento' : 'atendimentos'
}

/**
 * Onde a grade do dia rola (D8, 2026-10-27). Hoje: uma hora antes de agora.
 * Outro dia: o primeiro atendimento do dia ou a abertura da unidade, o que vier
 * antes — sem isso a grade herdava a rolagem do dia anterior e escondia a manhã.
 */
export function rolagemDaGrade(p: {
  ehHoje: boolean
  horaAgora: number
  startHour: number
  hourPx: number
  /** Minutos desde a meia-noite em que a unidade abre neste dia (nulo: fechada). */
  aberturaEmMin: number | null
  /** Minutos do primeiro atendimento do dia (nulo: sem atendimento). */
  primeiroEmMin: number | null
}): number {
  let horas: number
  if (p.ehHoje) horas = p.horaAgora - 1
  else {
    const alvos = [p.aberturaEmMin, p.primeiroEmMin].filter((m): m is number => m !== null)
    if (!alvos.length) return 0
    horas = Math.min(...alvos) / 60
  }
  return Math.max(0, Math.round((horas - p.startHour) * p.hourPx))
}
