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

/** O combinado → o estado do campo do desconto (`CampoDoDesconto`). */
export function estadoDoCombinado(combinado: DescontoCombinado | null | undefined): { tipo: Desconto['tipo']; texto: string } {
  if (!combinado || !(combinado.valor > 0)) return { tipo: 'VALOR', texto: '' }
  return combinado.tipo === 'PERCENTUAL'
    ? { tipo: 'PERCENTUAL', texto: String(combinado.valor).replace('.', ',') }
    : { tipo: 'VALOR', texto: combinado.valor.toFixed(2).replace('.', ',') }
}
