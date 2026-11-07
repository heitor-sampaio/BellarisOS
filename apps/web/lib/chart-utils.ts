// Recharts não redimensiona o YAxis automaticamente — a largura é fixa.
// Estas funções estimam a largura ideal a partir dos próprios rótulos,
// para não desperdiçar espaço (nem cortar o texto).

// Largura média de um caractere relativa ao fontSize (aprox. para Hanken/Arial).
const CHAR_RATIO = 0.6

/** Largura de um eixo de categorias (nomes/textos). */
export function categoryAxisWidth(
  labels: (string | null | undefined)[],
  { fontPx = 11, pad = 14, min = 36, max = 150 }: {
    fontPx?: number; pad?: number; min?: number; max?: number
  } = {},
): number {
  const longest = labels.reduce((m, s) => Math.max(m, (s ?? '').length), 0)
  return clamp(Math.round(longest * fontPx * CHAR_RATIO) + pad, min, max)
}

/** Largura de um eixo numérico, a partir dos rótulos formatados prováveis. */
export function numericAxisWidth(
  values: number[],
  fmt: (v: number) => string = String,
  { fontPx = 10, pad = 10, min = 22, max = 64 }: {
    fontPx?: number; pad?: number; min?: number; max?: number
  } = {},
): number {
  const maxAbs = values.reduce((m, v) => Math.max(m, Math.abs(v || 0)), 0)
  const samples = [fmt(maxAbs), fmt(0)]
  const longest = samples.reduce((m, s) => Math.max(m, s.length), 0)
  return clamp(Math.round(longest * fontPx * CHAR_RATIO) + pad, min, max)
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

/**
 * O rótulo do eixo em reais, curto ("500", "1,5k", "1,3M"), com a casa
 * decimal quando ela distingue (A52 da 9ª simulação: o "toFixed(0)" fazia o
 * 1.500 virar "2k" ao lado do 2.000 — "2k, 2k" no eixo). Um só para a
 * evolução, os relatórios e o fluxo de caixa.
 */
export function rotuloDoEixo(v: number, prefixo = ''): string {
  const curto = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1, useGrouping: false })
  if (Math.abs(v) >= 1_000_000) return `${prefixo}${curto(v / 1_000_000)}M`
  if (Math.abs(v) >= 1_000)     return `${prefixo}${curto(v / 1_000)}k`
  return `${prefixo}${v}`
}

/**
 * A curva do "Evolução do período" (A52 da 9ª): reta entre os pontos, com o
 * ponto de cada dia à vista. A suavizada parecia subir antes do primeiro dia
 * com valor (o zero de 04/11 ia "subindo" até o 05/11).
 */
export const CURVA_DA_EVOLUCAO = 'linear' as const
