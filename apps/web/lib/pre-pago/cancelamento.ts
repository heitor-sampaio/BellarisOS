import { lerParcelasQueCaem, lerParcial, type PagamentoEmParte, type ParcelaQueCai } from '@/lib/pacotes/cancelamento'

/**
 * A conta do CANCELAMENTO DE UMA UNIDADE do pré-pago (D1 da 6ª simulação, o
 * fluxo do pacote): quem faz a conta é o banco
 * (`procedimento_cancelar_unidade_devolvendo`, com `p_simular` para a janela
 * mostrá-la antes; sem ele, a mesma função grava). Aqui só o formato que a
 * janela lê.
 */
export interface PreviaDoCancelamentoDaUnidade {
  procedimento: string
  /** O número da unidade ("unidade 2"). */
  unidade:      number
  quantidade:   number
  precoUnidade: number
  /** O vendido (com o desconto) e o que a venda passa a valer sem esta unidade. */
  vendido:      number
  valorNovo:    number
  pago:         number
  aReceber:     number
  parcelas:     ParcelaQueCai[]
  /** O a receber que cai antes de devolver qualquer coisa. */
  cai:          number
  /** A devolução que a versão de antes já tinha registrado (despesa a pagar). */
  devolvidoAntes: number
  /** O pago além do que a venda vale: volta como estorno ou crédito. */
  devolver:     number
  fidelidade:   boolean
  parcial:      PagamentoEmParte | null
}

const num = (v: unknown) => Math.round(Number(v ?? 0) * 100) / 100

export function lerPreviaDaUnidade(j: Record<string, unknown>): PreviaDoCancelamentoDaUnidade {
  return {
    procedimento:   String(j.procedimento ?? 'Procedimento'),
    unidade:        Number(j.unidade ?? 0),
    quantidade:     Number(j.quantidade ?? 0),
    precoUnidade:   num(j.preco_unidade),
    vendido:        num(j.vendido),
    valorNovo:      num(j.valor_novo),
    pago:           num(j.pago),
    aReceber:       num(j.a_receber),
    parcelas:       lerParcelasQueCaem(j.parcelas),
    cai:            num(j.cai),
    devolvidoAntes: num(j.devolvido_antes),
    devolver:       num(j.devolver),
    fidelidade:     j.fidelidade === true,
    parcial:        lerParcial(j.parcial),
  }
}
