/**
 * Como o saldo de um produto numa unidade se MOSTRA e em que situação está —
 * puro, para a tela de estoque (rede e unidade) e o dashboard dizerem a mesma
 * coisa (J-43, simulação de 2026-10-28/29).
 *
 * O saldo em embalagens (`branch_product_stock.current_stock`) arredonda para
 * longe do zero: a embalagem aberta conta inteira (`lib/estoque/baixa.ts`). Era
 * esse número que a tela mostrava — 95 ml de um frasco de 100 ml apareciam
 * como "1 frasco", e 268 UI como "3 frasco" —, e o "abaixo do mín." comparava
 * essas embalagens arredondadas com o mínimo: 3 frascos (dos quais um aberto)
 * contra o mínimo de 3 diziam "abaixo do mín." sem estar abaixo.
 *
 * Agora: o produto com unidade de consumo se mostra no RENDIMENTO (268 UI, a
 * equivalência em embalagens ao lado: 2,68 frasco), e a situação compara o
 * rendimento com o mínimo em consumo (3 frascos = 300 UI). Igual ao mínimo é
 * "No mínimo", não "abaixo"; os dois continuam sendo estoque BAIXO (o alerta
 * de sempre).
 */

export interface MedidasDoProduto {
  unit:              string
  consumption_unit:  string | null
  units_per_package: number | string | null
}

export interface SaldoDaUnidade {
  /** `current_stock` (embalagens, arredondadas). */
  embalagens: number
  /** `current_rendimento` (em consumo), quando o produto tem unidade de consumo. */
  rendimento: number | null
  /** `min_stock` (em embalagens). */
  minimo:     number
}

export type SituacaoDoEstoque = 'SEM_ESTOQUE' | 'ABAIXO' | 'NO_MINIMO' | 'OK'

export const ROTULO_DA_SITUACAO: Record<SituacaoDoEstoque, string> = {
  SEM_ESTOQUE: 'Sem estoque',
  ABAIXO:      'Abaixo do mínimo',
  NO_MINIMO:   'No mínimo',
  OK:          'OK',
}

/** Quanto uma embalagem rende, quando o produto conta em consumo; senão nulo. */
export function rendePorEmbalagem(p: MedidasDoProduto): number | null {
  const upp = Number(p.units_per_package ?? 0)
  return upp > 0 && (p.consumption_unit ?? '').trim() ? upp : null
}

/** A quantidade numa unidade, como a tela a mostra. */
export interface Quantidade { quantidade: number; unidade: string }

/** O saldo na unidade de consumo (o rendimento), ou em embalagens quando o produto não tem consumo. */
export function saldoParaMostrar(s: SaldoDaUnidade, p: MedidasDoProduto): Quantidade {
  const upp = rendePorEmbalagem(p)
  if (!upp) return { quantidade: s.embalagens, unidade: p.unit }
  return { quantidade: s.rendimento ?? s.embalagens * upp, unidade: p.consumption_unit!.trim() }
}

/** O mínimo na mesma unidade do saldo. */
export function minimoParaMostrar(s: SaldoDaUnidade, p: MedidasDoProduto): Quantidade {
  const upp = rendePorEmbalagem(p)
  if (!upp) return { quantidade: s.minimo, unidade: p.unit }
  return { quantidade: s.minimo * upp, unidade: p.consumption_unit!.trim() }
}

/** A equivalência EXATA em embalagens (268 UI = 2,68 frasco) — nulo sem unidade de consumo. */
export function emEmbalagens(quantidadeEmConsumo: number, p: MedidasDoProduto): Quantidade | null {
  const upp = rendePorEmbalagem(p)
  if (!upp) return null
  return { quantidade: Math.round(quantidadeEmConsumo / upp * 100) / 100, unidade: p.unit }
}

const quase = (n: number) => Math.round(n * 10_000) / 10_000

export function situacaoDoEstoque(s: SaldoDaUnidade, p: MedidasDoProduto): SituacaoDoEstoque {
  const saldo  = quase(saldoParaMostrar(s, p).quantidade)
  const minimo = quase(minimoParaMostrar(s, p).quantidade)
  if (saldo <= 0) return 'SEM_ESTOQUE'
  if (minimo <= 0) return 'OK'
  if (saldo < minimo) return 'ABAIXO'
  if (saldo === minimo) return 'NO_MINIMO'
  return 'OK'
}

/** No mínimo ou abaixo dele: o alerta de estoque baixo (sem estar zerado). */
export function estoqueBaixo(sit: SituacaoDoEstoque): boolean {
  return sit === 'ABAIXO' || sit === 'NO_MINIMO'
}

/**
 * O produto está SEM ESTOQUE no recorte quando nenhuma unidade dele tem saldo
 * POSITIVO (D10 da 6ª simulação, 2026-11-04). Conta o saldo NEGATIVO — a baixa
 * que faltou, que fica negativa "para a falta aparecer" — e o produto ativo
 * sem NENHUMA linha de saldo no recorte (nunca entrou nada ali). Era `=== 0`
 * sobre as linhas que existiam: o Gel em −1 e a luva sem entrada não contavam,
 * e o dashboard dizia "Estoque Saudável".
 */
export function semEstoqueNoRecorte(saldos: SaldoDaUnidade[], p: MedidasDoProduto): boolean {
  return !saldos.some(s => situacaoDoEstoque(s, p) !== 'SEM_ESTOQUE')
}

/** Quantos produtos estão sem estoque e quantos com estoque baixo (no mínimo ou abaixo), no recorte. */
export function contarSituacoes(produtos: { saldos: SaldoDaUnidade[]; medidas: MedidasDoProduto }[]): { semEstoque: number; baixo: number } {
  let semEstoque = 0
  let baixo = 0
  for (const p of produtos) {
    if (semEstoqueNoRecorte(p.saldos, p.medidas)) semEstoque++
    else if (p.saldos.some(s => estoqueBaixo(situacaoDoEstoque(s, p.medidas)))) baixo++
  }
  return { semEstoque, baixo }
}

/** "268", "2,68", "1.500" — até duas casas, sem zeros à toa. */
export function formatarQuantidade(n: number): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
}

export function formatarQuantidadeComUnidade(q: Quantidade): string {
  return `${formatarQuantidade(q.quantidade)} ${q.unidade}`
}
