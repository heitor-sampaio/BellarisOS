/**
 * FD2a na "Nova venda" do PDV — a conta pura, que a tela mostra e o servidor
 * refaz (`lib/fidelidade/na-venda.ts`) e o banco confere
 * (`private.fidelidade_na_venda`): o voucher de desconto sobre o valor
 * vendido (já com o desconto comercial), e os pontos sobre o que sobra.
 */
import { calcularDescontoComPontos, maximoDePontos } from '@/lib/fidelidade/resgate'
import { descontoDoVoucher, type VoucherParaCalculo } from '@/lib/fidelidade/voucher'

export interface FidelidadeDaVenda {
  saldo:        number
  valorDoPonto: number
  minimo:       number
  tetoPct:      number
  /** Os vouchers de DESCONTO ativos da cliente (o de procedimento e o de produto não valem na venda). */
  vouchers:     (VoucherParaCalculo & { id: string; name: string })[]
}

export interface EscolhaDaFidelidade {
  pontos:    number
  voucherId: string | null
}

export const SEM_FIDELIDADE: EscolhaDaFidelidade = { pontos: 0, voucherId: null }

export interface ContaDaFidelidade {
  descontoVoucher: number
  pontos:          number
  desconto:        number
  /** O que a cliente paga em dinheiro. */
  restante:        number
  /** Até quantos pontos cabem nesta venda. */
  maximo:          number
  motivo?:         string
}

export function contaDaFidelidade(vendido: number, f: FidelidadeDaVenda | null, e: EscolhaDaFidelidade): ContaDaFidelidade {
  const total = Math.round(vendido * 100) / 100
  if (!f) return { descontoVoucher: 0, pontos: 0, desconto: 0, restante: total, maximo: 0 }
  const v = e.voucherId ? f.vouchers.find(x => x.id === e.voucherId) ?? null : null
  const dv = v ? descontoDoVoucher(v, { procedureId: null, preco: total }) : { desconto: 0 }
  const base = Math.round((total - (dv.motivo ? 0 : dv.desconto)) * 100) / 100
  const regras = { valorDoPonto: f.valorDoPonto, minimo: f.minimo, tetoPct: f.tetoPct }
  const r = calcularDescontoComPontos({ saldo: f.saldo, preco: base, pedido: e.pontos, regras })
  return {
    descontoVoucher: dv.motivo ? 0 : dv.desconto,
    pontos: r.motivo ? 0 : r.pontos,
    desconto: r.motivo ? 0 : r.desconto,
    restante: r.motivo ? base : r.restante,
    maximo: maximoDePontos(f.saldo, base, regras),
    motivo: dv.motivo ?? r.motivo,
  }
}
