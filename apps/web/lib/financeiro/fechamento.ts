import { startOfDayTZ, endOfDayTZ, dayKeyTZ, partsInTZ, instanteNoFuso } from '@/lib/datetime'
import { intervalosDoDia, diaDaSemana, type Horario } from '@/lib/agenda/horario'

/**
 * O dia do fechamento ("AAAA-MM-DD", no fuso da UNIDADE — F62; sem ele, o de
 * Brasília) e a janela dele. Dia no futuro não fecha (não há o que conferir);
 * sem dia, hoje.
 */
export function diaDoFechamento(pedido: string | null | undefined, agora = new Date(), fuso?: string): string {
  const hoje = dayKeyTZ(agora, fuso)
  if (!pedido || !/^\d{4}-\d{2}-\d{2}$/.test(pedido) || pedido > hoje) return hoje
  return pedido
}

export function janelaDoDia(dia: string, agora = new Date(), fuso?: string): { from: Date; to: Date } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia) || dia > dayKeyTZ(agora, fuso)) return null
  const meioDia = instanteNoFuso(dia, '12:00', fuso)
  if (Number.isNaN(meioDia.getTime())) return null
  return { from: startOfDayTZ(meioDia, fuso), to: endOfDayTZ(meioDia, fuso) }
}

/**
 * O dia ainda está ABERTO? (A50 da 5ª simulação: a recepção fechou às 11:48
 * o dia de uma unidade que atende até as 22h, e nada avisou.) Hoje, antes do
 * último fechamento da unidade naquele dia da semana, devolve até quando ela
 * atende ("22:00"); outro dia, ou depois do horário, nulo. Só avisa: fechar
 * antes continua valendo (o que entrar depois pede fechar de novo).
 */
export function diaAindaAberto(dia: string, horario: Horario | null, agora = new Date(), fuso?: string): string | null {
  if (dia !== dayKeyTZ(agora, fuso)) return null
  const intervalos = intervalosDoDia(horario, null, diaDaSemana(dia))
  if (!intervalos.length) return null
  const ultimo = intervalos.reduce((a, b) => (b.ate > a.ate ? b : a))
  const p = partsInTZ(agora, fuso)
  const agoraMin = p.hour * 60 + p.minute
  const [h, m] = ultimo.ate.split(':').map(Number)
  return agoraMin < h! * 60 + m! ? ultimo.ate : null
}
