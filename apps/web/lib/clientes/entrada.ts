/**
 * Para onde a cliente vai depois do login (2026-10-19, decisão do Heitor).
 *
 * - uma clínica só → direto para ela (como sempre foi);
 * - mais de uma, e ainda não escolheu desde que a última foi ligada → o
 *   seletor (`/auth/clinicas`): é o "primeiro login com mais de uma clínica",
 *   e volta UMA vez quando uma clínica nova entra na conta dela;
 * - senão → a última clínica que ela usou.
 *
 * Ficha sem unidade (sem endereço de portal) não conta. Ficha antiga sem
 * `ligadaEm` conta como ligada desde sempre.
 */
/** O seletor de clínica. Fora do espaço dos slugs (`/[slug]`): nenhuma unidade o sombreia. */
export const ROTA_DO_SELETOR = '/auth/clinicas'

export interface FichaDeEntrada {
  clientId: string
  slug: string | null
  ligadaEm: string | null
  ultimaEntradaEm: string | null
}

export type Entrada<F extends FichaDeEntrada> = { tipo: 'portal'; ficha: F } | { tipo: 'seletor' }

const hora = (iso: string | null) => (iso ? Date.parse(iso) : -Infinity)

export function escolherEntrada<F extends FichaDeEntrada>(fichas: F[]): Entrada<F> | null {
  const comPortal = fichas.filter(f => f.slug)
  if (!comPortal.length) return null
  if (comPortal.length === 1) return { tipo: 'portal', ficha: comPortal[0]! }

  const ultima = comPortal.reduce((a, b) => (hora(b.ultimaEntradaEm) > hora(a.ultimaEntradaEm) ? b : a))
  const maisNova = Math.max(...comPortal.map(f => hora(f.ligadaEm)))
  if (!ultima.ultimaEntradaEm || maisNova > hora(ultima.ultimaEntradaEm)) return { tipo: 'seletor' }
  return { tipo: 'portal', ficha: ultima }
}
