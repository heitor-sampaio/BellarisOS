/**
 * Quantas unidades (ou sessões) já pagas ainda estão PARA AGENDAR e quantas já
 * estão AGENDADAS (A27 da 6ª simulação, 2026-11-04): "3 para agendar" no
 * pré-pago não baixava ao agendar, só ao concluir — a recepção marcava a
 * primeira e a ficha seguia dizendo 3. A unidade disponível com agendamento
 * ligado é agendada; sem, para agendar. Usada e cancelada não entram.
 *
 * Puro: a ficha (equipe) e a home do app dizem o mesmo texto.
 */
export interface ContagemDoPago { paraAgendar: number; agendadas: number }

export function contagemDoPago(unidades: { status: string; agendada: boolean }[]): ContagemDoPago {
  let paraAgendar = 0, agendadas = 0
  for (const u of unidades) {
    if (u.status !== 'DISPONIVEL' && u.status !== 'AVAILABLE') continue
    if (u.agendada) agendadas++
    else paraAgendar++
  }
  return { paraAgendar, agendadas }
}

const agendadasTexto = (n: number) => `${n} agendada${n > 1 ? 's' : ''}`

/** "2 para agendar · 1 agendada", "nada para agendar · 1 agendada", "nada para agendar". */
export function textoDoParaAgendar(c: ContagemDoPago): string {
  const base = c.paraAgendar > 0 ? `${c.paraAgendar} para agendar` : 'nada para agendar'
  return c.agendadas > 0 ? `${base} · ${agendadasTexto(c.agendadas)}` : base
}

/** O cartão do pacote/plano: "2 sessões restantes · 1 agendada". */
export function textoDasRestantes(restantes: number, agendadas: number): string {
  const base = `${restantes} ${restantes === 1 ? 'sessão restante' : 'sessões restantes'}`
  return agendadas > 0 ? `${base} · ${agendadasTexto(agendadas)}` : base
}
