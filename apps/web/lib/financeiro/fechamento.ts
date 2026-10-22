import { startOfDayTZ, endOfDayTZ, dayKeyTZ } from '@/lib/datetime'

/**
 * O dia do fechamento ("AAAA-MM-DD", no fuso da clínica) e a janela dele. Dia
 * no futuro não fecha (não há o que conferir); sem dia, hoje.
 */
export function diaDoFechamento(pedido: string | null | undefined, agora = new Date()): string {
  const hoje = dayKeyTZ(agora)
  if (!pedido || !/^\d{4}-\d{2}-\d{2}$/.test(pedido) || pedido > hoje) return hoje
  return pedido
}

export function janelaDoDia(dia: string, agora = new Date()): { from: Date; to: Date } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia) || dia > dayKeyTZ(agora)) return null
  const meioDia = new Date(`${dia}T12:00:00-03:00`)
  if (Number.isNaN(meioDia.getTime())) return null
  return { from: startOfDayTZ(meioDia), to: endOfDayTZ(meioDia) }
}
