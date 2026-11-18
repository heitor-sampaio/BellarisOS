/**
 * Os próximos `n` dias a partir de `hoje` (AAAA-MM-DD, no relógio da unidade)
 * — os dias que o Remarcar do app confere para marcar os que têm horário
 * livre (22ª A42). Conta no calendário (meio-dia UTC), sem fuso.
 */
export function proximosDias(hoje: string, n: number): string[] {
  const base = new Date(`${hoje}T12:00:00Z`)
  if (Number.isNaN(base.getTime())) return []
  return Array.from({ length: Math.max(0, n) }, (_, i) => new Date(base.getTime() + i * 86_400_000).toISOString().slice(0, 10))
}

/** Quantos dias o Remarcar confere para frente. */
export const DIAS_DO_REMARCAR = 14
