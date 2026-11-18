/**
 * O voucher na comanda do atendimento, DEPOIS do desconto comercial — a ordem
 * dos descontos em todo lugar (o Heitor, 2026-11-18: "Desconto, voucher,
 * pontos"): o desconto comercial sobre o total da comanda, o voucher sobre o
 * que sobrou, e os pontos sobre o que sobra dos dois. A tela
 * (`receber-atendimento.tsx`), a action (`confirmPayment`) e o banco
 * (`confirmar_pagamento_do_atendimento`) fazem a MESMA conta, em centavos.
 *
 * Puro, sem `server-only`: a tela também o usa.
 */
import { descontoDoVoucher, type VoucherParaCalculo } from '@/lib/fidelidade/voucher'

const c = (reais: number) => Math.round(reais * 100)

/**
 * A parte dos produtos num desconto da comanda — o `private.parte_dos_itens`
 * do banco: na proporção do valor, sem passar do que os produtos valem, e o
 * que o atendimento não cobre vai aos produtos.
 */
export function parteDosItens(valor: number, atendimento: number, itens: number): number {
  const v = c(valor), at = c(atendimento), it = c(itens)
  if (v <= 0 || it <= 0) return 0
  if (at <= 0) return Math.min(v, it) / 100
  // round(v × it / (at + it), 2) do Postgres: meio para longe do zero (tudo ≥ 0).
  const proporcional = Math.floor((2 * v * it + (at + it)) / (2 * (at + it)))
  return Math.min(it, Math.max(v - at, proporcional)) / 100
}

/**
 * Quanto o voucher desconta da comanda, já com o desconto comercial dado:
 * o de desconto (R$ ou %) vale sobre o total menos o desconto; o de
 * procedimento paga o que sobra do ATENDIMENTO (o que falta dele menos a parte
 * dele no desconto comercial).
 */
export function voucherDepoisDoDesconto(
  v: VoucherParaCalculo,
  comanda: { procedureId: string | null; preco: number; itens: number; descontoVenda: number },
  agora = new Date(),
): { desconto: number; motivo?: string } {
  const dvenda = Math.max(0, comanda.descontoVenda)
  const doAtendimento = Math.round((dvenda - parteDosItens(dvenda, comanda.preco, comanda.itens)) * 100) / 100
  const precoDepois = Math.max(0, Math.round((comanda.preco - doAtendimento) * 100) / 100)
  const totalDepois = Math.max(0, Math.round((comanda.preco + comanda.itens - dvenda) * 100) / 100)
  return descontoDoVoucher(v, { procedureId: comanda.procedureId, preco: precoDepois, total: totalDepois }, agora)
}
