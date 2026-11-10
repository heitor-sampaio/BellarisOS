import 'server-only'
import { formatBRL } from '@estetica-os/utils'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'

/**
 * O pagamento de R$ 0 — pago todo com o voucher ou com os pontos (A23 da 10ª
 * simulação, 2026-11-10): a lista dizia "Receita · Pago · + R$ 0,00", com
 * "Estornar", e ninguém sabia o que era. A linha passa a dizer "Pago com o
 * voucher “Limpeza grátis”: R$ 180,00" (ou "Pago com pontos: R$ 180,00"), e o
 * estorno se chama "Desfazer o pagamento": nenhum dinheiro volta — o voucher
 * volta a valer e os pontos voltam ao saldo (fidelidade.md: "estorno do
 * pagamento o reativa"). Só leitura, para a tela.
 */
export interface LancamentoSemDinheiro {
  id:                string
  type:              string
  is_paid:           boolean
  amount:            number | string
  loyalty_discount?: number | string | null
  notes?:            string | null
}

/** O texto da linha (por id), só dos pagamentos de R$ 0 com desconto de fidelidade. */
export async function pagosSemDinheiro<T extends LancamentoSemDinheiro>(linhas: T[]): Promise<Record<string, string>> {
  const alvo = linhas.filter(l => l.type === 'INCOME' && l.is_paid && Number(l.amount) === 0 && Number(l.loyalty_discount ?? 0) > 0)
  const saida: Record<string, string> = {}
  if (!alvo.length) return saida
  const vouchers = ((await ler(createAdminClient().from('loyalty_vouchers').select('name, used_transaction_id')
    .in('used_transaction_id', alvo.map(l => l.id)), 'ler os vouchers dos pagamentos')) ?? []) as { name: string; used_transaction_id: string }[]
  const voucherDe = new Map(vouchers.map(v => [v.used_transaction_id, v.name]))
  for (const l of alvo) saida[l.id] = textoDoPagoSemDinheiro(Number(l.loyalty_discount), voucherDe.get(l.id) ?? null)
  return saida
}

export function textoDoPagoSemDinheiro(desconto: number, voucher: string | null): string {
  return voucher ? `Pago com o voucher “${voucher}”: ${formatBRL(desconto)}` : `Pago com pontos: ${formatBRL(desconto)}`
}
