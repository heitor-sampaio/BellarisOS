import { forasDoHorario, intervalosDoDia, type Horario, type Intervalo } from '@/lib/agenda/horario'
import type { BloqueioQueOcupa } from '@/lib/agenda/horario-livre'

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

/**
 * O que NÃO é horário de quem atende no dia `dia` (AAAA-MM-DD): a pausa e o
 * antes/depois do expediente, como cortes do "Horário livre" da Minha agenda
 * (`livresEntre`). Os instantes são os do relógio da grade (o "de parede":
 * a data local do navegador). Sem período nenhum, o dia inteiro é corte.
 * D4 da 32ª (princípio 3; decisão do Claude, 26/11): a Minha agenda oferecia
 * "Horário livre" dentro da pausa — a grade da equipe já a mostrava como
 * "Intervalo". Puro.
 */
export function foraDoHorarioComoCortes(dia: string, intervalos: Intervalo[]): BloqueioQueOcupa[] {
  const [a, m, d] = dia.slice(0, 10).split('-').map(Number)
  const em = (min: number) => new Date(a!, (m ?? 1) - 1, d ?? 1, 0, min).toISOString()
  return forasDoHorario(intervalos, 0, 24 * 60).map(f => ({ inicio: em(f.de), fim: em(f.ate), motivo: 'fora do horário' }))
}

/**
 * O dia sem horário, em palavras, para a Semana e o Dia da agenda (A6 da 32ª;
 * AG-22; princípio 3): a unidade não abre → "Fechado"; abre e a pessoa não
 * atende nesse dia → "Não atende neste dia" (o vocabulário do editor de
 * horário e do aviso do agendar). Nulo: há horário. Sem horário cadastrado, a
 * unidade usa o padrão (`intervalosDoDia`). Decisão do Claude, 26/11. Puro.
 */
export function rotuloDoDiaSemHorario(unidade: Horario | null, profissional: Horario | null, dia: number): 'Fechado' | 'Não atende neste dia' | null {
  if (intervalosDoDia(unidade, null, dia).length === 0) return 'Fechado'
  if (profissional && intervalosDoDia(unidade, profissional, dia).length === 0) return 'Não atende neste dia'
  return null
}

/** "Intervalo 01:20–03:20". */
export function textoDaPausa(p: Intervalo): string {
  return `Intervalo ${p.de}–${p.ate}`
}
