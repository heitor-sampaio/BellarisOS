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
 * A57 da 12ª: o mesmo, no APP da cliente, com as palavras dela — "R$ 300,00
 * pagos · R$ 136,36 devolvidos" (a compra de crédito estornada em parte dizia só
 * "R$ 163,64 Pago").
 */
export function notaDoEstornoParcialParaACliente(t: LancamentoParaNota): string | null {
  const antes = t.valor_antes_do_estorno == null ? null : Number(t.valor_antes_do_estorno)
  const agora = Number(t.amount)
  if (antes == null || !Number.isFinite(antes) || !(antes > agora) || t.notes === 'Estornada') return null
  return `${formatBRL(antes)} pagos · ${formatBRL(Math.round((antes - agora) * 100) / 100)} devolvidos`
}

/** O pago, o estornado em parte e a parte que virou crédito interno de um pagamento vivo. */
function partesDoQueVoltou(t: LancamentoParaNota, emCredito: number) {
  if (t.notes === 'Estornada') return null
  const agora = Number(t.amount)
  const antesLido = t.valor_antes_do_estorno == null ? null : Number(t.valor_antes_do_estorno)
  const antes = antesLido != null && Number.isFinite(antesLido) && antesLido > agora ? antesLido : agora
  const estornado = Math.round((antes - agora) * 100) / 100
  // A parte em crédito é só do pagamento recebido (a devolução não mexe no resto).
  const credito = t.type === 'INCOME' && t.is_paid ? Math.round((Number(emCredito) || 0) * 100) / 100 : 0
  if (!(estornado > 0) && !(credito > 0)) return null
  return { antes, estornado, credito }
}

/**
 * EX-11 e PR-08 (D6 da 41ª): a devolução de parte da venda que virou CRÉDITO
 * INTERNO deixa o pagamento como estava (o dinheiro fica no caixa) e dá o
 * valor à cliente como crédito — a linha dizia só "R$ 180,00". Decisão do
 * Claude, 28/11, no estilo da EX-11: "Pago R$ 180,00 · R$ 90,00 em crédito
 * interno"; com o estorno parcial, as duas partes. Só o estorno parcial, o
 * texto da A36 (`notaDoEstornoParcial`).
 */
export function notaDoPagamentoQueVoltou(t: LancamentoParaNota, emCredito = 0): string | null {
  const p = partesDoQueVoltou(t, emCredito)
  if (!p) return null
  return [`Pago ${formatBRL(p.antes)}`,
    p.estornado > 0 ? `${formatBRL(p.estornado)} estornados` : null,
    p.credito > 0 ? `${formatBRL(p.credito)} em crédito interno` : null].filter(Boolean).join(' · ')
}

/** O mesmo no APP, com as palavras dela e o nome do crédito da CI-10 ("Crédito em <a rede>"). */
export function notaDoPagamentoQueVoltouParaACliente(t: LancamentoParaNota, emCredito = 0, nomeDoCredito = 'crédito'): string | null {
  const p = partesDoQueVoltou(t, emCredito)
  if (!p) return null
  return [`${formatBRL(p.antes)} pagos`,
    p.estornado > 0 ? `${formatBRL(p.estornado)} devolvidos` : null,
    p.credito > 0 ? `${formatBRL(p.credito)} voltaram como ${nomeDoCredito}` : null].filter(Boolean).join(' · ')
}

/**
 * A37: o uso do crédito interno aparecia como "Receita · Pago · + R$ 130,00",
 * fora da Receita total (certo — F7) e sem dizer por quê.
 */
export function notaDoUsoDeCredito(t: LancamentoParaNota): string | null {
  if (t.type !== 'INCOME' || t.payment_method !== 'INTERNAL_CREDIT' || t.notes === 'Estornada') return null
  return 'Uso do crédito interno: não é receita — o caixa foi quando o crédito foi comprado (ou ficou de um cancelamento).'
}
