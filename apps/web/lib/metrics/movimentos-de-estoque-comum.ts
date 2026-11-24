import type { TipoDoMovimento } from '@/lib/estoque/tipo-do-movimento'

/**
 * O que a tela e o servidor dividem da lista das movimentações de Relatórios →
 * Estoque (item 6 do escopo de 18/11): o tamanho da página e a forma da linha.
 * Sem 'server-only' — a tela (cliente) importa daqui.
 */
export const MOVIMENTOS_POR_PAGINA = 50

export interface MovimentoDoRelatorio {
  id:         string
  data:       string
  /** O fuso da unidade do movimento: a data e a hora se dizem no relógio dela. */
  fuso:       string
  branchId:   string
  unidade:    string
  produtoId:  string
  produto:    string
  tipo:       TipoDoMovimento
  rotulo:     string
  /** Na unidade do movimento (a de consumo quando o produto tem), com o sinal. */
  quantidade: number
  medida:     string
  embalagem:  string
  embalagens: number
  lotes:      { numero: string | null; validade: string | null }[]
  quem:       string | null
  custo:      number
  /** O movimento foi desfeito depois (a entrada, o ajuste, a perda). */
  desfeita:   boolean
}

export interface MovimentosDoRelatorio {
  linhas: MovimentoDoRelatorio[]
  /** Quantos movimentos o período tem (todas as páginas). */
  total:  number
}

