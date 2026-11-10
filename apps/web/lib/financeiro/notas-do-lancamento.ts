import { formatBRL } from '@estetica-os/utils'

/**
 * O que a linha de um lançamento diz embaixo do valor (11ª simulação,
 * 2026-11-10; princípio 3: o que a tela mostra é o que vale na conta). Puro:
 * roda no servidor e no navegador. Os números chegam do banco — aqui só se
 * escreve.
 */

export interface LancamentoParaNota {
  type: string
  amount: number | string
  is_paid: boolean
  notes?: string | null
  payment_method?: string | null
  /** A36: o valor do pagamento antes de um estorno parcial (gravado pelo banco). */
  valor_antes_do_estorno?: number | string | null
}

/**
 * A36: depois do estorno PARCIAL, o pagamento passa a valer o usado (r2-ven-05,
 * a regra fica) e a linha dizia só "110,00" — quem lia não via que a cliente
 * pagou R$ 1.100. "Pago R$ 1.100,00 · R$ 990,00 estornados".
 */
export function notaDoEstornoParcial(t: LancamentoParaNota): string | null {
  const antes = t.valor_antes_do_estorno == null ? null : Number(t.valor_antes_do_estorno)
  const agora = Number(t.amount)
  if (antes == null || !Number.isFinite(antes) || !(antes > agora) || t.notes === 'Estornada') return null
  const voltou = Math.round((antes - agora) * 100) / 100
  return `Pago ${formatBRL(antes)} · ${formatBRL(voltou)} estornados`
}

/**
 * A37: o uso do crédito interno aparecia como "Receita · Pago · + R$ 130,00",
 * fora da Receita total (certo — F7) e sem dizer por quê.
 */
export function notaDoUsoDeCredito(t: LancamentoParaNota): string | null {
  if (t.type !== 'INCOME' || t.payment_method !== 'INTERNAL_CREDIT' || t.notes === 'Estornada') return null
  return 'Uso do crédito na clínica: não é receita — o caixa foi quando o crédito foi comprado (ou ficou de um cancelamento).'
}
