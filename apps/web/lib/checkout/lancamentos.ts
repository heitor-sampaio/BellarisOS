import { z } from 'zod'
import type { PagamentoDoPlano } from './pagamento'
import { dividirEmParcelas, rotuloDaParcela } from './parcelas'

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
  /** Vai depois do " — " na descrição: "entrada", "parcela 2/3". */
  sufixo?:        string
  /**
   * Parcelado: CADA parcela é um lançamento (2026-09-30), com o seu vencimento;
   * o grupo liga as parcelas do mesmo parcelamento.
   */
  parcela_numero?: number
  parcela_total?:  number
  parcela_grupo?:  string
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
  z.object({ forma: z.literal('A_RECEBER'), metodo: z.enum(METODOS).nullable(), vencimento: data.nullable() }),
])

const centavos = (v: number) => Math.round(v * 100) / 100

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
    saida.push({ amount: entrada, payment_method: p.metodo, is_paid: true, due_date: null, notes: `Entrada — ${rotulo}`, sufixo: 'entrada' })
  }
  if (saldo > 0) {
    // Cada parcela, um lançamento com o seu vencimento — e não o saldo inteiro
    // num lançamento só, que o financeiro mostrava no mês da venda.
    const grupo = crypto.randomUUID()
    for (const parcela of dividirEmParcelas(saldo, Math.min(12, p.parcelas), p.primeiroVencimento)) {
      saida.push({
        amount: parcela.amount, payment_method: p.metodo, is_paid: false, due_date: parcela.due_date,
        notes: `${rotuloDaParcela(parcela)} — ${rotulo}`, sufixo: rotuloDaParcela(parcela),
        parcela_numero: parcela.numero, parcela_total: parcela.total, parcela_grupo: grupo,
      })
    }
  }
  return saida
}
