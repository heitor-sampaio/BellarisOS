import { quantidadeComMedida } from '@/lib/estoque/medidas'
import { validadeNaTela } from '@/lib/estoque/validade'

/**
 * O que cada lote cobriu de um movimento — puro (D5 da 33ª simulação; ES-18,
 * ES-25, princípio 3).
 *
 * O consumo de 4 ml que o lote AM1 cobriu só em 2 ml aparecia como "−4 ml ·
 * Lote AM1" no Histórico e nas Movimentações: a tela listava o lote ligado,
 * não o que ele cobriu. A ligação ao lote (`stock_movement_batches.quantity`)
 * está em EMBALAGENS, e o movimento na unidade dele (a de consumo, quando o
 * produto tem): o que cada lote cobriu é a ligação × o rendimento, e o resto é
 * o que nenhum lote cobriu ("2 ml sem lote").
 *
 * Na entrada, a ligação é o que entrou no lote; o que falta para o movimento
 * inteiro cobriu a falta que ficou sem lote antes (o gatilho
 * `trg_lote_cobre_a_falta`): o AM2 de 10 ml que entra com o saldo em −2 ml
 * fica com 8 ml.
 */
export interface LigacaoAoLote {
  numero:     string | null
  validade:   string | null
  /** `stock_movement_batches.quantity`: em embalagens. */
  embalagens: number
}

export interface PartesDoMovimento {
  /** Cada lote e o que ele cobriu, na unidade do movimento. */
  lotes:        { numero: string | null; validade: string | null; quantidade: number }[]
  /** A SAÍDA que nenhum lote cobriu, na unidade do movimento. */
  semLote:      number
  /** A ENTRADA com lote que foi cobrir a falta de antes (não entrou no lote). */
  cobriuAFalta: number
}

const quatro = (n: number) => Math.round(n * 10_000) / 10_000

export function partesDoMovimento(m: { quantidade: number; fator: number; ligacoes: LigacaoAoLote[] }): PartesDoMovimento {
  const fator = m.fator > 0 ? m.fator : 1
  const lotes = m.ligacoes.map(l => ({ numero: l.numero, validade: l.validade, quantidade: quatro(Number(l.embalagens) * fator) }))
  const coberto = lotes.reduce((s, l) => s + l.quantidade, 0)
  // A ligação guarda 4 casas em embalagens: o arredondamento de cada uma não é "sem lote".
  const tolerancia = 0.0001 * fator * Math.max(1, lotes.length)
  const resto = quatro(Math.abs(m.quantidade) - coberto)
  const sobra = resto > tolerancia ? resto : 0
  const saida = m.quantidade < 0
  return {
    lotes,
    semLote:      saida ? sobra : 0,
    cobriuAFalta: !saida && lotes.length ? sobra : 0,
  }
}

/** Se as partes dizem mais que o lote: mais de um lote, a parte sem lote ou a falta coberta. */
export function partesDizemQuantidade(p: PartesDoMovimento): boolean {
  return p.lotes.length > 1 || p.semLote > 0 || p.cobriuAFalta > 0
}

/**
 * "Lote AM1: 2 ml · 2 ml sem lote". O lote que cobre o movimento inteiro diz só
 * o lote (como sempre disse); o movimento sem lote nenhum, nada (o produto que
 * não usa lote não ganha um "sem lote" em cada linha).
 */
export function textoDasPartes(p: PartesDoMovimento, medida: string): string {
  const qtd = (n: number) => quantidadeComMedida(n, medida, 2)
  const rotulo = (l: PartesDoMovimento['lotes'][number]) => {
    const dia = validadeNaTela(l.validade)
    return [l.numero ? `Lote ${l.numero}` : 'Lote sem número', dia ? `val. ${dia}` : null].filter(Boolean).join(' ')
  }
  if (!p.lotes.length) return ''
  const comQuantidade = partesDizemQuantidade(p)
  const partes = p.lotes.map(l => comQuantidade ? `${rotulo(l)}: ${qtd(l.quantidade)}` : rotulo(l))
  if (p.semLote > 0) partes.push(`${qtd(p.semLote)} sem lote`)
  if (p.cobriuAFalta > 0) partes.push(`${qtd(p.cobriuAFalta)} ${p.cobriuAFalta >= 2 ? 'cobriram' : 'cobriu'} a falta de antes (sem lote)`)
  return partes.join(' · ')
}
