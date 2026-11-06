import { lerParcelasQueCaem, lerParcial, type PagamentoEmParte, type ParcelaQueCai } from '@/lib/pacotes/cancelamento'

/**
 * A devolução de PARTE de uma venda de produto (A34 da 8ª simulação,
 * 2026-11-06; decidido pelo princípio 3): por linha, com o estoque e o dinheiro
 * proporcionais. A conta é do banco (`produto_devolver_itens`, com `p_simular`
 * para a janela mostrá-la antes); aqui só o formato que a janela lê.
 */

/** Um item da venda, para a janela perguntar quantas voltam. */
export interface ItemParaDevolver {
  id:         string
  produto:    string
  quantidade: number
  /** Já devolvidas antes (outra devolução em parte). */
  devolvidas: number
}

export interface VendaParaDevolver {
  id:        string
  descricao: string
  itens:     ItemParaDevolver[]
}

export interface ItemDevolvido { item: string; produto: string; quantidade: number; de: number; valor: number }

export interface PreviaDaDevolucao {
  descricao:      string
  itens:          ItemDevolvido[]
  /** "1× Sérum": o que volta, por extenso. */
  devolvido:      string
  /** O que volta do vendido (a parte dos itens, com o desconto rateado). */
  valorDevolvido: number
  unidades:       number
  vendido:        number
  devolvidoAntes: number
  /** O que a venda passa a valer. */
  valorNovo:      number
  pago:           number
  aReceber:       number
  parcelas:       ParcelaQueCai[]
  cai:            number
  /** O pago além do que a venda vale: volta como estorno ou crédito. */
  devolver:       number
  fidelidade:     boolean
  parcial:        PagamentoEmParte | null
}

const num = (v: unknown) => Math.round(Number(v ?? 0) * 100) / 100

export function lerPreviaDaDevolucao(j: Record<string, unknown>): PreviaDaDevolucao {
  const itens = (Array.isArray(j.itens) ? j.itens : []) as Record<string, unknown>[]
  return {
    descricao:      String(j.descricao ?? ''),
    itens:          itens.map(i => ({
      item: String(i.item), produto: String(i.produto ?? ''), quantidade: Number(i.quantidade ?? 0),
      de: Number(i.de ?? 0), valor: num(i.valor),
    })),
    devolvido:      String(j.devolvido ?? ''),
    valorDevolvido: num(j.valor_devolvido),
    unidades:       Number(j.unidades ?? 0),
    vendido:        num(j.vendido),
    devolvidoAntes: num(j.devolvido_antes),
    valorNovo:      num(j.valor_novo),
    pago:           num(j.pago),
    aReceber:       num(j.a_receber),
    parcelas:       lerParcelasQueCaem(j.parcelas),
    cai:            num(j.cai),
    devolver:       num(j.devolver),
    fidelidade:     j.fidelidade === true,
    parcial:        lerParcial(j.parcial),
  }
}

/** A venda tem o que devolver em parte: mais de uma unidade ainda com a cliente. */
export function temParteParaDevolver(v: VendaParaDevolver | null): boolean {
  return !!v && v.itens.reduce((s, i) => s + i.quantidade - i.devolvidas, 0) > 1
}
