/**
 * Como os pontos aparecem na tela. Puro — usado na ficha do cliente, no portal e
 * na exportação de LGPD.
 */

export type TipoDeLancamento =
  | 'GANHO' | 'ESTORNO_GANHO' | 'AJUSTE' | 'RESGATE' | 'ESTORNO_RESGATE'
  | 'VOUCHER' | 'VOUCHER_CANCELADO' | 'EXPIRACAO'

const ROTULOS: Record<TipoDeLancamento, string> = {
  GANHO:             'Ganho no pagamento',
  ESTORNO_GANHO:     'Estorno do pagamento',
  AJUSTE:            'Ajuste da equipe',
  RESGATE:           'Usado no pagamento',
  ESTORNO_RESGATE:   'Devolvido (estorno)',
  VOUCHER:           'Trocado por recompensa',
  VOUCHER_CANCELADO: 'Devolvido (voucher cancelado)',
  EXPIRACAO:         'Pontos vencidos',
}

export function rotuloDoLancamento(tipo: string): string {
  return ROTULOS[tipo as TipoDeLancamento] ?? 'Lançamento'
}

/** Quanto os pontos valem em R$, pelo valor do ponto da rede. Nunca negativo. */
export function pontosEmReais(pontos: number, valorDoPonto: number): number {
  if (!Number.isFinite(pontos) || !Number.isFinite(valorDoPonto) || pontos <= 0 || valorDoPonto <= 0) return 0
  return Math.round(pontos * valorDoPonto * 100) / 100
}

/** "1.240 pontos", "1 ponto", "−30 pontos". */
export function formatarPontos(pontos: number): string {
  const abs = Math.abs(pontos).toLocaleString('pt-BR')
  const sinal = pontos < 0 ? '−' : ''
  return `${sinal}${abs} ${Math.abs(pontos) === 1 ? 'ponto' : 'pontos'}`
}
