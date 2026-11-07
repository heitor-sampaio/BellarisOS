import { z } from 'zod'
import { FORMAS_DE_PAGAMENTO } from '@/lib/financeiro/lancamento'
import { BANDEIRAS } from '@/lib/financeiro/bandeiras'

/**
 * O que a janela do cancelamento manda — a do pacote e a do plano (decisão 2
 * do Heitor, 2026-11-07: "sim usa a mesma coisa do pacote"). Fora de
 * `actions/` (todo export de lá é endpoint).
 */
export const EntradaDoCancelamento = z.object({
  motivo:       z.string().trim().min(1, 'Diga o motivo do cancelamento.').max(500),
  destino:      z.enum(['ESTORNO', 'CREDITO']).nullable(),
  agendamentos: z.enum(['CANCELAR', 'SOLTAR']).nullable(),
  /** O "a devolver" que a janela mostrou: mudou no meio, o banco recusa. */
  esperado:     z.number().min(0),
  /**
   * Como estornar o pagamento que volta em parte (r2-ven-05): parcial, ou o
   * inteiro com o usado lançado de novo na forma `novo`. No cartão, o banco
   * só aceita o inteiro (r2-fin-03). Ausente: parcial fora do cartão.
   */
  estorno:      z.enum(['PARCIAL', 'INTEIRO']).nullable().optional(),
  novo:         z.object({
    metodo: z.enum(FORMAS_DE_PAGAMENTO),
    vezes:  z.number().int().min(1).max(12),
    /** r3-f13-01: a bandeira do cartão do pagamento novo, opcional. */
    bandeira: z.enum(BANDEIRAS.map(b => b.value) as [string, ...string[]]).nullable().optional(),
  }).nullable().optional(),
})
