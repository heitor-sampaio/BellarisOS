/**
 * Onde o produto está disponível (E2 do plano de adaptação, o Heitor, 13/11:
 * "checkbox de onde o produto está disponivel (Insumo e Venda direta)") — puro,
 * para o cadastro, as listas de insumo e a venda de produto dizerem a mesma coisa.
 *
 * A tela tem DOIS checkboxes; o banco guarda o mesmo `products.uso` de antes
 * (D-6), que é o contrato que o PDV e as listas de insumo leem:
 * - INSUMO: só Insumo — aparece no atendimento (o consumo da sessão) e no procedimento;
 * - REVENDA: só Venda direta — aparece na venda de produto (o PDV) e exige preço
 *   de venda (a restrição `products_uso_check` também confere);
 * - AMBOS: os dois marcados.
 *
 * O produto lido sem a coluna (cache antigo) vale como INSUMO, que era o que
 * todo produto era antes.
 */
export type UsoDoProduto = 'INSUMO' | 'REVENDA' | 'AMBOS'

export function lerUso(v: unknown): UsoDoProduto | null {
  return v === 'INSUMO' || v === 'REVENDA' || v === 'AMBOS' ? v : null
}

/** Entra na lista de insumos (procedimento, atendimento, plano)? */
export function ehInsumo(uso: string | null | undefined): boolean {
  return (lerUso(uso) ?? 'INSUMO') !== 'REVENDA'
}

/** Entra na venda de produto (Venda direta)? */
export function ehRevenda(uso: string | null | undefined): boolean {
  const u = lerUso(uso)
  return u === 'REVENDA' || u === 'AMBOS'
}

/** Os dois checkboxes viram o uso; nenhum marcado é nulo (a tela e o servidor pedem um). */
export function usoDosCheckboxes(insumo: boolean, vendaDireta: boolean): UsoDoProduto | null {
  if (insumo && vendaDireta) return 'AMBOS'
  if (insumo) return 'INSUMO'
  if (vendaDireta) return 'REVENDA'
  return null
}

/** O que a linha do produto diz: "Insumo", "Venda direta" ou "Insumo e venda direta". */
export function rotuloDoUso(uso: string | null | undefined): string {
  const u = lerUso(uso) ?? 'INSUMO'
  return u === 'REVENDA' ? 'Venda direta' : u === 'AMBOS' ? 'Insumo e venda direta' : 'Insumo'
}

export const RECUSA_SEM_USO = 'Marque onde o produto está disponível: Insumo, Venda direta ou os dois.'
