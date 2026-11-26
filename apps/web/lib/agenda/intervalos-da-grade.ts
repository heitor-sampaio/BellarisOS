import type { Intervalo } from '@/lib/agenda/horario'

const minutos = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return (h ?? 0) * 60 + (m ?? 0) }

/**
 * As pausas do dia de quem atende: o vão entre dois períodos de trabalho
 * (AG-01: o horário é "por dia da semana, com pausa"). O antes da abertura e o
 * depois do fechamento não são pausa — são fora do horário. A grade as mostra
 * pelo nome a quem vê a agenda dela (A8 da 31ª; princípio 3; decisão do
 * Claude, 26/11). Puro.
 */
export function pausasDoDia(intervalos: Intervalo[]): Intervalo[] {
  const ordem = [...intervalos].sort((a, b) => minutos(a.de) - minutos(b.de))
  const saida: Intervalo[] = []
  let fim: number | null = null
  let fimTexto = ''
  for (const i of ordem) {
    if (fim !== null && minutos(i.de) > fim) saida.push({ de: fimTexto, ate: i.de })
    if (fim === null || minutos(i.ate) > fim) { fim = minutos(i.ate); fimTexto = i.ate }
  }
  return saida
}

/** "Intervalo 01:20–03:20". */
export function textoDaPausa(p: Intervalo): string {
  return `Intervalo ${p.de}–${p.ate}`
}
