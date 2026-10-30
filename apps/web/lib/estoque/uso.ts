/**
 * O USO do produto (D-6, decisão do Heitor, 2026-10-29) — puro, para o
 * cadastro, as listas de insumo e a venda de produto dizerem a mesma coisa.
 *
 * - INSUMO: aparece no atendimento (o consumo da sessão) e no procedimento;
 * - REVENDA: aparece na venda de produto ("Vender" da ficha) — exige preço de
 *   venda (a restrição `products_uso_check` também confere);
 * - AMBOS: os dois.
 *
 * O produto lido sem a coluna (cache antigo) vale como INSUMO, que era o que
 * todo produto era antes.
 */
export type UsoDoProduto = 'INSUMO' | 'REVENDA' | 'AMBOS'

export const USOS_DO_PRODUTO: { key: UsoDoProduto; label: string }[] = [
  { key: 'INSUMO',  label: 'Insumo' },
  { key: 'REVENDA', label: 'Revenda' },
  { key: 'AMBOS',   label: 'Os dois' },
]

export function lerUso(v: unknown): UsoDoProduto | null {
  return v === 'INSUMO' || v === 'REVENDA' || v === 'AMBOS' ? v : null
}

/** Entra na lista de insumos (procedimento, atendimento, plano)? */
export function ehInsumo(uso: string | null | undefined): boolean {
  return (lerUso(uso) ?? 'INSUMO') !== 'REVENDA'
}

/** Entra na venda de produto? */
export function ehRevenda(uso: string | null | undefined): boolean {
  const u = lerUso(uso)
  return u === 'REVENDA' || u === 'AMBOS'
}
