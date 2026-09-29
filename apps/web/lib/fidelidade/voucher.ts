/**
 * Vouchers de fidelidade — as regras puras. O banco
 * (`confirmar_pagamento_do_atendimento`) confere o mesmo número, então a conta
 * é em centavos inteiros, como em `resgate.ts`.
 */

export const TIPOS_DE_RECOMPENSA = ['PROCEDIMENTO', 'DESCONTO_VALOR', 'DESCONTO_PERCENTUAL', 'PRODUTO'] as const
export type TipoDeRecompensa = typeof TIPOS_DE_RECOMPENSA[number]

export const ROTULO_DO_TIPO: Record<TipoDeRecompensa, string> = {
  PROCEDIMENTO:        'Procedimento grátis',
  DESCONTO_VALOR:      'Desconto em R$',
  DESCONTO_PERCENTUAL: 'Desconto em %',
  PRODUTO:             'Produto / brinde',
}

export interface VoucherParaCalculo {
  type:           string
  status:         string
  expires_at:     string
  procedure_id:   string | null
  discount_value: number | string | null
}

export type SituacaoDoVoucher = 'ATIVO' | 'USADO' | 'CANCELADO' | 'VENCIDO'

/** Vencido é derivado da data — o banco não tem job para isso. */
export function situacaoDoVoucher(v: { status: string; expires_at: string }, agora = new Date()): SituacaoDoVoucher {
  if (v.status === 'USADO' || v.status === 'CANCELADO') return v.status
  return new Date(v.expires_at).getTime() <= agora.getTime() ? 'VENCIDO' : 'ATIVO'
}

/** Quanto o voucher desconta deste atendimento — ou por que não serve. */
export function descontoDoVoucher(
  v: VoucherParaCalculo,
  atendimento: { procedureId: string | null; preco: number },
  agora = new Date(),
): { desconto: number; motivo?: string } {
  const situacao = situacaoDoVoucher(v, agora)
  if (situacao === 'VENCIDO') return { desconto: 0, motivo: 'Voucher vencido.' }
  if (situacao !== 'ATIVO')   return { desconto: 0, motivo: 'Este voucher já foi usado ou cancelado.' }

  const precoC = Math.round(atendimento.preco * 100)
  const valor  = Number(v.discount_value ?? 0)
  switch (v.type) {
    case 'PROCEDIMENTO':
      return v.procedure_id && v.procedure_id === atendimento.procedureId
        ? { desconto: precoC / 100 }
        : { desconto: 0, motivo: 'Este voucher é de outro procedimento.' }
    case 'DESCONTO_VALOR':
      return { desconto: Math.min(Math.round(valor * 100), precoC) / 100 }
    case 'DESCONTO_PERCENTUAL': {
      // round(preço × pct / 100, 2) do banco, em inteiros (pct tem 2 casas).
      const pctC = Math.round(valor * 100)
      return { desconto: Math.floor((precoC * pctC + 5000) / 10000) / 100 }
    }
    case 'PRODUTO':
      return { desconto: 0, motivo: 'Voucher de produto é entregue, não aplicado no pagamento.' }
    default:
      return { desconto: 0, motivo: 'Voucher inválido.' }
  }
}

/** O que o voucher dá, em uma linha ("Limpeza de pele grátis", "R$ 50 de desconto", "15% de desconto"). */
export function descricaoDoVoucher(v: { type: string; name: string; discount_value: number | string | null }): string {
  const valor = Number(v.discount_value ?? 0)
  switch (v.type) {
    case 'DESCONTO_VALOR':
      return `${valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} de desconto`
    case 'DESCONTO_PERCENTUAL':
      return `${valor.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% de desconto`
    default:
      return v.name
  }
}
