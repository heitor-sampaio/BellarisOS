import { z } from 'zod'
import type { PagamentoDoPlano } from './pagamento'

/**
 * Os lançamentos de uma venda paga de uma vez ou em partes — hoje, a venda de
 * pacote (`pacote_vender` grava). Puro: o app calcula, a função no banco grava
 * e confere que a soma fecha com o preço.
 *
 * O que foi RECEBIDO agora e o que ficou A RECEBER são lançamentos separados:
 * o caixa conta pelo `paid_at`, e um lançamento só não pode estar nos dois
 * lugares (o mesmo motivo do checkout do plano).
 */
export interface Lancamento {
  amount:         number
  payment_method: string | null
  is_paid:        boolean
  due_date:       string | null
  notes:          string | null
  parcelas?:      { number: number; total: number; amount: number; due_date: string }[]
}

const METODOS = ['PIX', 'CASH', 'DEBIT_CARD', 'CREDIT_CARD', 'INTERNAL_CREDIT'] as const
const data = z.string().refine(s => !Number.isNaN(Date.parse(s)), 'Data inválida.')

/** O pagamento como chega do navegador: conferido aqui, antes de virar dinheiro. */
export const EntradaDoPagamento = z.discriminatedUnion('forma', [
  z.object({ forma: z.literal('AVISTA'), metodo: z.enum(METODOS) }),
  z.object({
    forma: z.literal('PARCELADO'), metodo: z.enum(METODOS),
    entrada: z.number().min(0), parcelas: z.number().int().min(1).max(12), primeiroVencimento: data,
  }),
  z.object({ forma: z.literal('A_RECEBER'), metodo: z.enum(METODOS).nullable(), vencimento: data }),
])

const centavos = (v: number) => Math.round(v * 100) / 100

/** Soma um número de meses no calendário, mantendo o dia (e o horário). */
function maisMeses(iso: string, meses: number): string {
  const d = new Date(iso)
  d.setUTCMonth(d.getUTCMonth() + meses)
  return d.toISOString()
}

export function lancamentosDoPagamento(total: number, p: PagamentoDoPlano, rotulo: string): Lancamento[] {
  const valor = centavos(total)
  if (p.forma === 'AVISTA') {
    return [{ amount: valor, payment_method: p.metodo, is_paid: true, due_date: null, notes: null }]
  }
  if (p.forma === 'A_RECEBER') {
    return [{ amount: valor, payment_method: p.metodo, is_paid: false, due_date: p.vencimento, notes: `${rotulo} — a receber` }]
  }
  const entrada = centavos(Math.max(0, Math.min(p.entrada, valor)))
  const saldo = centavos(valor - entrada)
  const saida: Lancamento[] = []
  if (entrada > 0) {
    saida.push({ amount: entrada, payment_method: p.metodo, is_paid: true, due_date: null, notes: `Entrada — ${rotulo}` })
  }
  if (saldo > 0) {
    const n = Math.max(1, Math.min(12, p.parcelas))
    const cada = centavos(saldo / n)
    saida.push({
      amount: saldo, payment_method: p.metodo, is_paid: false, due_date: p.primeiroVencimento,
      notes: `Saldo — ${rotulo} em ${n}x`,
      // A última parcela leva o que sobra do arredondamento: a soma tem de fechar.
      parcelas: Array.from({ length: n }, (_, i) => ({
        number: i + 1, total: n,
        amount: i === n - 1 ? centavos(saldo - cada * (n - 1)) : cada,
        due_date: maisMeses(p.primeiroVencimento, i),
      })),
    })
  }
  return saida
}
