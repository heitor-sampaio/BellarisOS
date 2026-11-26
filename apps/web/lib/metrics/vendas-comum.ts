/**
 * O vocabulário do relatório de vendas, sem nada de servidor: a tela usa os
 * rótulos, e `lib/metrics/vendas.ts` (server-only) faz a leitura.
 *
 * RL1 (a revisão do Heitor, 2026-11-13: "rl1 ok"): a aba Vendas lista as
 * COMANDAS do PDV — cada venda, do que for: atendimento avulso, pacote,
 * pré-pago, plano, produto e crédito na clínica —, com o número da comanda.
 */

import { dayKeyTZ } from '@/lib/datetime'

export const TIPOS_DE_VENDA = ['PROCEDIMENTO', 'PACOTE', 'PRE_PAGO', 'PLANO', 'PRODUTO', 'CREDITO'] as const
export type TipoDeVenda = typeof TIPOS_DE_VENDA[number]

export const ROTULO_DO_TIPO: Record<TipoDeVenda, string> = {
  PROCEDIMENTO: 'Atendimento avulso',
  PACOTE:       'Pacote',
  PRE_PAGO:     'Pré-pago',
  PLANO:        'Plano',
  PRODUTO:      'Produto',
  CREDITO:      'Crédito interno',
}

export const POR_PAGINA = 50

export interface Venda {
  id:           string
  tipo:         TipoDeVenda
  data:         string
  descricao:    string
  /** Sessões do pacote ou do plano; unidades do pré-pago; embalagens do produto; 1 no avulso. */
  quantidade:   number
  clienteId:    string | null
  cliente:      string | null
  /** Quem atendeu (avulso) ou quem vendeu (pacote, pré-pago, produto, plano); nulo = ninguém foi marcado (com-06). */
  profissional: string | null
  branchId:     string
  valor:        number
  /** O número da comanda do PDV; nulo na venda de antes do PDV. */
  comanda:      number | null
  /** A10 da 28ª: o plano ou o pacote foi cancelado (o valor da linha já é o que a rede ficou). */
  cancelada?:   boolean
}

/** A10 da 28ª (princípio 3): "Plano cancelado" / "Pacote cancelado" — a linha diz o que aconteceu. */
export function marcaDoCancelamento(v: Pick<Venda, 'tipo' | 'cancelada'>): string | null {
  if (!v.cancelada) return null
  if (v.tipo === 'PLANO') return 'Plano cancelado'
  if (v.tipo === 'PACOTE') return 'Pacote cancelado'
  return null
}

/**
 * Pendente 17 da 27ª (princípio 7): quem a coluna "Profissional" mostra nesta
 * linha — no atendimento avulso, quem atendeu; no pacote, no pré-pago, no
 * produto e no plano, quem vendeu (o crédito interno não tem).
 */
export function quemDaVenda(tipo: TipoDeVenda): string {
  return tipo === 'PROCEDIMENTO' ? 'Quem atendeu' : 'Quem vendeu'
}

export interface ResumoDeVendas {
  /**
   * O "Total vendido": todos os tipos, o crédito interno vendido também (o
   * Heitor, 25/11: "se o crédito foi vendido, é venda, tem que contar, não conta
   * é quando só usa"). O pago com crédito interno já sai de cada venda no banco.
   */
  geral:   { quantidade: number; total: number }
  porTipo: Record<TipoDeVenda, { quantidade: number; total: number }>
  /** Quantas linhas a lista tem sem filtro (o crédito também) — a paginação. */
  linhas:  number
}

/** "Nº 12" — a comanda da linha; "—" na venda de antes do PDV. */
export function comandaDaVenda(v: Pick<Venda, 'comanda'>): string {
  return v.comanda == null ? '—' : `Nº ${v.comanda}`
}

/** O cabeçalho do CSV de vendas (`;` — como o Excel brasileiro abre). */
export const CABECALHO_DO_CSV_DE_VENDAS = 'Data;Comanda;Tipo;Descrição;Cliente;Profissional;Unidade;Valor'

/** As colunas de uma venda no CSV, na ordem do cabeçalho (sem escapar). */
export function colunasDoCsvDeVendas(v: Venda, o: { fuso?: string; unidade: string }): string[] {
  return [
    dayKeyTZ(v.data, o.fuso).split('-').reverse().join('/'),
    v.comanda == null ? '' : String(v.comanda),
    ROTULO_DO_TIPO[v.tipo],
    marcaDoCancelamento(v) ? `${descricaoDaVenda(v)} (${marcaDoCancelamento(v)})` : descricaoDaVenda(v),
    v.cliente ?? '',
    v.profissional ?? '',
    o.unidade,
    v.valor.toFixed(2).replace('.', ','),
  ]
}

export const ehTipoDeVenda = (v: unknown): v is TipoDeVenda =>
  typeof v === 'string' && (TIPOS_DE_VENDA as readonly string[]).includes(v)

/** A descrição que já diz a quantidade de cada item ("1× Protetor + 1× Sérum"). */
const JA_TEM_QUANTIDADE = /^\d+× /

/**
 * A descrição como a lista e a exportação a mostram ("3× Botox" no pré-pago).
 * A venda de produto gravada desde a F11 já traz os itens com a quantidade
 * (`product_sales.descricao`): não ganha outro prefixo (D12 da 6ª simulação,
 * era "2× 1× Protetor + 1× Sérum"). A de antes, só com o nome, ganha.
 */
export function descricaoDaVenda(v: Pick<Venda, 'tipo' | 'descricao' | 'quantidade'>): string {
  if (v.tipo === 'PRODUTO' && JA_TEM_QUANTIDADE.test(v.descricao)) return v.descricao
  if (v.tipo === 'PRE_PAGO' || v.tipo === 'PRODUTO') return `${v.quantidade}× ${v.descricao}`
  if (v.tipo === 'PACOTE' || v.tipo === 'PLANO') {
    return v.quantidade > 0 ? `${v.descricao} · ${v.quantidade} ${v.quantidade === 1 ? 'sessão' : 'sessões'}` : v.descricao
  }
  return v.descricao
}

/**
 * O nome do CSV do relatório de vendas: o primeiro e o ÚLTIMO dia do período,
 * no fuso do negócio (J-53, 2026-10-30). Era `fullTo.toISOString()` — o fim
 * de outubro (31/10 23:59 em Brasília) já é 01/11 em UTC, e o arquivo de
 * outubro saía "…-a-2026-11-01".
 */
export function nomeDoCsvDeVendas(from: Date, fullTo: Date, fuso?: string): string {
  return `vendas-${dayKeyTZ(from, fuso)}-a-${dayKeyTZ(fullTo, fuso)}.csv`
}
