import { parseDecimal } from '@estetica-os/utils'

/**
 * O custo por unidade de CONSUMO do insumo do procedimento (D6 da 11ª
 * simulação, 2026-11-10): a cera a R$ 0,038/g virava R$ 0,04 — o campo
 * formatava com 2 casas e o banco guardava 2 (`procedure_products.unit_cost`,
 * numeric(12,4) desde 20261110005401). Até 4 casas, pelo menos 2: "0,038",
 * "0,0395", "380,00".
 */
export const CASAS_DO_CUSTO_DO_INSUMO = 4

export function custoDoInsumoNoCampo(n: number): string {
  if (!Number.isFinite(n)) return ''
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: CASAS_DO_CUSTO_DO_INSUMO })
}

/** O que se digita no campo, com até 4 casas (NaN = não se lê sem adivinhar). */
export function lerCustoDoInsumo(texto: string): number {
  return parseDecimal(texto, CASAS_DO_CUSTO_DO_INSUMO)
}
