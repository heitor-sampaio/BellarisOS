/**
 * Dinheiro das assinaturas em CENTAVOS inteiros (como o resto do sistema).
 * A tela escreve em reais ("199,90"); a conversão mora aqui, uma só.
 */
export function centavosDe(texto: string | number | null | undefined): number | null {
  if (typeof texto === 'number') return Number.isFinite(texto) ? Math.round(texto * 100) : null
  const limpo = (texto ?? '').trim().replace(/[R$\s.]/g, '').replace(',', '.')
  if (!limpo) return null
  const n = Number(limpo)
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null
}

export function reaisDe(centavos: number | null | undefined): string {
  if (centavos == null) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(centavos / 100)
}

/** Para o campo de edição ("199,90"). */
export function campoDeReais(centavos: number | null | undefined): string {
  if (centavos == null) return ''
  return (centavos / 100).toFixed(2).replace('.', ',')
}
