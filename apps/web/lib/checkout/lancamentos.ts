import { z } from 'zod'
import type { PagamentoDoPlano } from './pagamento'
import { dividirEmParcelas, rotuloDaParcela } from './parcelas'
import { vezesNoCartao } from './pagamento'
import { recusaDaEntradaAcimaDoTotal } from './entrada'
import { BANDEIRAS, bandeiraDoPagamento, temBandeira } from '@/lib/financeiro/bandeiras'

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
  /** Cartão de crédito em N vezes, PAGO na hora: a faixa da taxa da maquininha. */
  cartao_vezes?:   number
  /** A bandeira do cartão do que foi PAGO agora (r3-f13-01): o prazo e a taxa dela. */
  cartao_bandeira?: string
  /** A maquininha do que foi PAGO agora no cartão (C75); sem ela, o banco põe a primeira. */
  maquininha_id?: string
  /** O motivo do desconto da venda (fin-01): só no PRIMEIRO lançamento, para a lista do Financeiro. */
  desconto_motivo?: string
}

/** O motivo do desconto vai no primeiro lançamento da venda (fin-01) — um por venda, não um por parcela. */
export function comMotivoDoDesconto(lancamentos: Lancamento[], motivo: string | null): Lancamento[] {
  if (!motivo || !lancamentos.length) return lancamentos
  return lancamentos.map((l, i) => (i === 0 ? { ...l, desconto_motivo: motivo } : l))
}

const METODOS = ['PIX', 'CASH', 'DEBIT_CARD', 'CREDIT_CARD', 'INTERNAL_CREDIT'] as const
import { TETO_DO_CREDIARIO } from '@/lib/financeiro/parcelas-do-crediario'
const BANDEIRA = z.enum(BANDEIRAS.map(b => b.value) as [string, ...string[]]).optional()
/** C75: a maquininha do cartão (o banco confere que é da rede). */
const MAQUININHA = z.string().regex(/^[0-9a-f-]{36}$/i, 'Maquininha inválida.').optional()
const data = z.string().refine(s => !Number.isNaN(Date.parse(s)), 'Data inválida.')

/** O pagamento como chega do navegador: conferido aqui, antes de virar dinheiro. */
export const EntradaDoPagamento = z.discriminatedUnion('forma', [
  z.object({ forma: z.literal('AVISTA'), metodo: z.enum(METODOS), vezes: z.number().int().min(1).max(12).optional(), bandeira: BANDEIRA, maquininha: MAQUININHA }),
  z.object({
    // PDV8: o Crediário é a forma; o meio é o da ENTRADA — sem entrada, nenhum
    // (nada se recebe agora: nulo, não um texto vazio).
    forma: z.literal('PARCELADO'), metodo: z.enum(METODOS).nullish(),
    // C38: o limite é da rede (`recusaDasParcelasDaRede`); aqui, só o teto do registro.
    entrada: z.number().min(0), parcelas: z.number().int().min(1).max(TETO_DO_CREDIARIO), primeiroVencimento: data, bandeira: BANDEIRA, maquininha: MAQUININHA,
    /** D5: as vezes na maquininha da ENTRADA no crédito. */
    vezes: z.number().int().min(1).max(12).optional(),
  }),
  // PDV8: o "a receber" não tem meio — nada entra agora; a forma se escolhe
  // quando o dinheiro entra (a baixa). Sai o "Meio de pagamento (opcional)".
  z.object({ forma: z.literal('A_RECEBER'), metodo: z.null().optional(), vencimento: data.nullable() }),
]).refine(
  p => p.forma === 'A_RECEBER' || !p.vezes || p.vezes === 1 || p.metodo === 'CREDIT_CARD',
  'Parcelar na maquininha só no cartão de crédito.',
).refine(
  p => p.forma !== 'PARCELADO' || !!p.metodo || !(p.entrada > 0),
  'Escolha a forma da entrada.',
)

const centavos = (v: number) => Math.round(v * 100) / 100

/**
 * A entrada do "entrada + parcelas" acima do total é RECUSADA (ven-02): o
 * servidor confere antes de montar os lançamentos — o corte de
 * `lancamentosDoPagamento` fica só como rede de segurança.
 */
export function recusaDaEntradaDoPagamento(p: PagamentoDoPlano | null | undefined, total: number, doQue = 'da venda'): string | null {
  return p?.forma === 'PARCELADO' ? recusaDaEntradaAcimaDoTotal(p.entrada, total, doQue) : null
}

export function lancamentosDoPagamento(total: number, p: PagamentoDoPlano, rotulo: string): Lancamento[] {
  const valor = centavos(total)
  // r3-f13-01: a bandeira vai no que é PAGO agora no cartão (à vista, a entrada).
  const bandeira = bandeiraDoPagamento(p.metodo, p.forma === 'A_RECEBER' ? null : p.bandeira)
  const maquininha = p.forma !== 'A_RECEBER' && temBandeira(p.metodo) && p.maquininha ? p.maquininha : null
  const comBandeira = { ...(bandeira ? { cartao_bandeira: bandeira } : {}), ...(maquininha ? { maquininha_id: maquininha } : {}) }
  if (p.forma === 'AVISTA') {
    const vezes = vezesNoCartao(p)
    return [{ amount: valor, payment_method: p.metodo, is_paid: true, due_date: null, notes: null, ...(vezes > 1 ? { cartao_vezes: vezes } : {}), ...comBandeira }]
  }
  if (p.forma === 'A_RECEBER') {
    return [{ amount: valor, payment_method: null, is_paid: false, due_date: p.vencimento, notes: `${rotulo} — a receber` }]
  }
  const entrada = centavos(Math.max(0, Math.min(p.entrada, valor)))
  const saldo = centavos(valor - entrada)
  const saida: Lancamento[] = []
  if (entrada > 0) {
    // D5: a entrada no crédito também em N vezes na maquininha (pago agora).
    const vezes = vezesNoCartao(p)
    saida.push({
      amount: entrada, payment_method: p.metodo ?? null, is_paid: true, due_date: null, notes: `Entrada — ${rotulo}`, sufixo: 'entrada',
      ...(vezes > 1 ? { cartao_vezes: vezes } : {}), ...comBandeira,
    })
  }
  if (saldo > 0) {
    // Cada parcela, um lançamento com o seu vencimento — e não o saldo inteiro
    // num lançamento só, que o financeiro mostrava no mês da venda. D6: é o
    // crediário da CLÍNICA, sem meio — o meio se escolhe ao receber (não é
    // o cartão da entrada).
    const grupo = crypto.randomUUID()
    for (const parcela of dividirEmParcelas(saldo, Math.min(12, p.parcelas), p.primeiroVencimento)) {
      saida.push({
        amount: parcela.amount, payment_method: null, is_paid: false, due_date: parcela.due_date,
        notes: `${rotuloDaParcela(parcela)} — ${rotulo}`, sufixo: rotuloDaParcela(parcela),
        parcela_numero: parcela.numero, parcela_total: parcela.total, parcela_grupo: grupo,
      })
    }
  }
  return saida
}
