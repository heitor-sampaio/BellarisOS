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

/**
 * A janela da grade do dia (D5 da simulação de 2026-10-28): o horário de
 * funcionamento, ESTENDIDO pelos agendamentos do dia que caem fora dele — um
 * encaixe às 21 h ou um atendimento de madrugada não podem sumir nem se
 * empilhar na primeira linha. É a conta da grade da unidade, e a "Minha
 * agenda" e a agenda da rede usam esta mesma. Sem `tz`, vale a hora local do
 * navegador (é a que as grades desenham).
 */
export function estenderJanela(
  janela: { inicio: number; fim: number },
  eventos: { start: string | Date; durationMin: number }[],
  tz?: string,
): { inicio: number; fim: number } {
  const hm = (d: Date): { h: number; m: number } => {
    if (!tz) return { h: d.getHours(), m: d.getMinutes() }
    const partes = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d)
    return { h: Number(partes.find(p => p.type === 'hour')!.value), m: Number(partes.find(p => p.type === 'minute')!.value) }
  }
  let { inicio, fim } = janela
  for (const ev of eventos) {
    const a = new Date(ev.start), b = new Date(a.getTime() + ev.durationMin * 60000)
    const ini = hm(a), fi = hm(b)
    inicio = Math.min(inicio, ini.h)
    // Terminar no dia seguinte (virada da meia-noite) fecha a grade em 24.
    fim = Math.max(fim, fi.h < ini.h ? 24 : fi.h + (fi.m > 0 ? 1 : 0))
  }
  return { inicio, fim: Math.min(24, Math.max(fim, inicio + 1)) }
}
