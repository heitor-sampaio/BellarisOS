/**
 * Um valor dividido em parcelas mensais (2026-09-30): CADA parcela vira um
 * lançamento no financeiro, com o seu vencimento e "parcela 2/3" na descrição
 * — pacote, pré-pago, checkout e recebimento do plano, despesa parcelada. Uma
 * divisão só, para todos.
 *
 * - Em centavos; a última leva o que sobra do arredondamento (3 × 66,67 daria
 *   200,01 para um saldo de 200 — o checkout do plano fazia isso).
 * - Um mês depois do outro, no mesmo dia; dia que o mês não tem vira o último
 *   dele (31/01 → 28/02 → 31/03), em vez de pular para março.
 *
 * Puro (sem banco): quem grava é a função do banco ou a action.
 */
export interface Parcela {
  numero:   number
  total:    number
  amount:   number
  /** ISO, com o horário do primeiro vencimento. */
  due_date: string
}

/** O mesmo dia `meses` depois, ou o último dia do mês se ele não tiver esse dia. */
export function somarMeses(iso: string, meses: number): string {
  const d = new Date(iso)
  const dia = d.getUTCDate()
  const alvo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + meses, 1,
    d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds()))
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate()
  alvo.setUTCDate(Math.min(dia, ultimo))
  return alvo.toISOString()
}

export function dividirEmParcelas(total: number, vezes: number, primeiroVencimento: string): Parcela[] {
  const n = Math.max(1, Math.trunc(vezes))
  const centavos = Math.round(total * 100)
  const cada = Math.floor(centavos / n)
  return Array.from({ length: n }, (_, i) => ({
    numero:   i + 1,
    total:    n,
    amount:   (i === n - 1 ? centavos - cada * (n - 1) : cada) / 100,
    due_date: somarMeses(primeiroVencimento, i),
  }))
}

/** "parcela 2/3" — o que vai depois do " — " na descrição do lançamento. */
export const rotuloDaParcela = (p: Pick<Parcela, 'numero' | 'total'>) => `parcela ${p.numero}/${p.total}`
