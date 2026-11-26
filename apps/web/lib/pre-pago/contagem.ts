import { formatBRL } from '@estetica-os/utils'

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

/**
 * O valor do pré-pago no card "Procedimentos pagos" da ficha (D8 da 31ª; PP-03:
 * "a venda passa a valer o vendido menos as unidades canceladas"; princípio
 * 3). A ficha seguia "R$ 340,00" depois de cancelar uma das duas sessões e
 * estornar R$ 170 — Vendas e o caixa diziam R$ 170. O preço de cada sessão é o
 * retrato da venda (`procedure_sale_units.preco`).
 */
export function valorDoPrePagoNaFicha(v: { price: number; desconto: number; unidades: { preco: number; status: string }[] }): string {
  const canceladas = v.unidades.filter(u => u.status === 'CANCELADA')
  if (!canceladas.length) return `${formatBRL(v.price)}${v.desconto > 0 ? ` (desconto de ${formatBRL(v.desconto)})` : ''}`
  const cancelado = canceladas.reduce((s, u) => s + Math.round(u.preco * 100), 0)
  const vale = Math.max(0, Math.round(v.price * 100) - cancelado) / 100
  const n = canceladas.length
  return `${formatBRL(vale)} (vendido por ${formatBRL(v.price)}; ${n} ${n === 1 ? 'sessão cancelada' : 'sessões canceladas'}, ${formatBRL(cancelado / 100)})`
}

/**
 * A11 da 31ª (princípio 7): só a sessão livre e não agendada se cancela (PP-03),
 * e "falta ou cancelamento do agendamento DEVOLVE a unidade"
 * (vendas-financeiro.md) — a ficha diz o caminho na sessão agendada.
 */
export const SESSAO_AGENDADA_SE_CANCELA_NA_AGENDA =
  'A sessão agendada não se cancela aqui: cancele antes o agendamento, na agenda. A sessão volta a ficar livre e o “Cancelar” aparece aqui.'
