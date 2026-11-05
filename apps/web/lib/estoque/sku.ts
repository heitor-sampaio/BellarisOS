import type { UsoDoProduto } from './uso'

/**
 * O prefixo do SKU do produto (A6 da 7ª simulação, 2026-11-05): as três
 * primeiras letras da categoria; sem categoria, o USO decide — o insumo segue
 * "OUT" (outros, a sequência de sempre) e o que se VENDE (revenda e "os dois")
 * ganha "REV", fora da sequência dos insumos. O produto de revenda da Dália
 * recebia "OUT-004", logo depois dos insumos OUT-001…003.
 */
export function prefixoDoSku(categoria: string | null | undefined, uso: UsoDoProduto | null = null): string {
  const daCategoria = (categoria ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 3)
  if (daCategoria) return daCategoria
  return uso === 'REVENDA' || uso === 'AMBOS' ? 'REV' : 'OUT'
}
