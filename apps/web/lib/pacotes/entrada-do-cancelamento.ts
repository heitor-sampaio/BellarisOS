import { z } from 'zod'
import { FORMAS_DE_PAGAMENTO } from '@/lib/financeiro/lancamento'
import { BANDEIRAS } from '@/lib/financeiro/bandeiras'
import { LIMITE_DE_VEZES_NO_CARTAO } from '@/lib/acima-do-comum'

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
    // O Heitor, 25/11: acima de 12 vezes avisa; só o impossível (acima de 1.200, decisão do Claude) se recusa.
    vezes:  z.number().int().min(1).max(LIMITE_DE_VEZES_NO_CARTAO),
    /** r3-f13-01: a bandeira do cartão do pagamento novo, opcional. */
    bandeira: z.enum(BANDEIRAS.map(b => b.value) as [string, ...string[]]).nullable().optional(),
    /** C75 (VF-01 da varredura de 18/11): a maquininha do cartão do usado. */
    maquininha: z.string().uuid().nullable().optional(),
  }).nullable().optional(),
})
