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
