import { descontoEmReais, type Desconto } from '@/lib/vendas/desconto'

/**
 * O desconto do PLANO (22ª A20): o valor fechado com a cliente ("as três por
 * 420") se combina no editor, em R$ ou em %, em vez de mexer no preço de cada
 * sessão. Fica guardado no plano (`treatment_plans.desconto_combinado_*`) e
 * vai pronto ao checkout do plano no PDV, que o aplica pelo
 * `plano_aplicar_desconto` (o de sempre) — e ali ainda se ajusta. A cliente vê
 * o total com ele ao aceitar (princípio 3).
 *
 * Puro: a tela, o app e o servidor fazem a mesma conta (`descontoEmReais`).
 */

export type DescontoCombinado = Pick<Desconto, 'tipo' | 'valor'>

/** A linha do banco → o combinado (nulo sem desconto). */
export function combinadoDoPlano(row: {
  desconto_combinado_tipo?: string | null
  desconto_combinado_valor?: number | string | null
} | null | undefined): DescontoCombinado | null {
  const tipo = row?.desconto_combinado_tipo
  const valor = Number(row?.desconto_combinado_valor ?? 0)
  if ((tipo !== 'VALOR' && tipo !== 'PERCENTUAL') || !(valor > 0)) return null
  return { tipo, valor }
}

/** O desconto em reais e o total que fica, sobre o subtotal das sessões. */
export function totalComOCombinado(subtotal: number, combinado: DescontoCombinado | null | undefined): { reais: number; total: number } {
  const reais = descontoEmReais(subtotal, combinado ?? null)
  return { reais, total: Math.round((subtotal - reais) * 100) / 100 }
}

/**
 * D2 da 25ª (princípio 3): o valor do plano nas LISTAS (os planos da cliente,
 * Planejamentos). Antes do aceite o preço gravado é o de tabela, e a tela mostra
 * o total com o combinado (atendimento.md, "O desconto combinado"); do aceite
 * em diante o gravado já é o vendido (`plano_aceitar` aplica o combinado) —
 * vale ele. A lista dizia 480 onde o contrato e o recebido diziam 420.
 *
 * D9 da 42ª (princípio 3): o plano CANCELADO ANTES DO ACEITE nunca teve o
 * combinado aplicado aos preços — vale o proposto, com ele ("3 Limpeza − R$ 30 =
 * R$ 450", e a lista dizia R$ 480). É o `cancelamento.antes_do_aceite` que
 * `plano_cancelar_proposto` grava, e o REJECTED antigo (a recusa, antes do
 * aceite). O cancelado depois do aceite segue o gravado (o vendido).
 */
export function totalDoPlanoNaLista(
  status: string, soma: number, combinado: DescontoCombinado | null | undefined,
  /** O retrato do cancelamento (`treatment_plans.cancelamento`), no cancelado. */
  cancelamento?: unknown,
): number {
  const redonda = Math.round(soma * 100) / 100
  if (!antesDoAceite(status, cancelamento)) return redonda
  return totalComOCombinado(redonda, combinado).total
}

/** Os preços do plano ainda são os de tabela (o combinado não foi aplicado)? */
function antesDoAceite(status: string, cancelamento: unknown): boolean {
  if (status === 'DRAFT' || status === 'PROPOSED' || status === 'REJECTED') return true
  if (status !== 'CANCELLED') return false
  const c = cancelamento && typeof cancelamento === 'object' ? cancelamento as Record<string, unknown> : null
  return c?.antes_do_aceite === true
}

/** O combinado → o estado do campo do desconto (`CampoDoDesconto`). */
export function estadoDoCombinado(combinado: DescontoCombinado | null | undefined): { tipo: Desconto['tipo']; texto: string } {
  if (!combinado || !(combinado.valor > 0)) return { tipo: 'VALOR', texto: '' }
  return combinado.tipo === 'PERCENTUAL'
    ? { tipo: 'PERCENTUAL', texto: String(combinado.valor).replace('.', ',') }
    : { tipo: 'VALOR', texto: combinado.valor.toFixed(2).replace('.', ',') }
}
