/**
 * A dose dos injetáveis na tela e a ligação do mapa com a BAIXA do estoque
 * (A36 da 5ª simulação). Módulo neutro: a tela e o servidor usam.
 *
 * O mapa gravava 0,5 ml e o estoque baixava 1 ml (a dose padrão do insumo no
 * procedimento), sem aviso; e mostrava "0.5 ml" onde o painel dizia "0,5 ml".
 */

/** "0,5", "4", "1,25" — sem casas quando é inteiro, com vírgula quando não é. */
export function formatarDose(n: number): string {
  const v = Number(n)
  if (!Number.isFinite(v)) return '0'
  return Number.isInteger(v) ? String(v) : v.toLocaleString('pt-BR', { maximumFractionDigits: 3 })
}

/** O total de um produto no mapa, numa unidade. */
export interface TotalDoMapa { product: string; unit: string; total: number }

/** Um insumo da tela do atendimento (o que vai para a baixa). */
export interface InsumoDaBaixa { productId: string; name: string; unit: string; quantity: number }

/** Um produto do estoque que o atendimento pode baixar. */
export interface ProdutoDaBaixa { id: string; name: string; unit: string }

/** O que o mapa diz e a baixa não. */
export interface DivergenciaDaBaixa {
  productId: string
  nome:      string
  unidade:   string
  doMapa:    number
  /** A dose na baixa; `null` quando o produto do mapa não está entre os insumos marcados. */
  naBaixa:   number | null
}

const chave = (t: string) => t.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/**
 * As divergências entre o mapa e a baixa: o produto do mapa (pelo NOME do
 * produto do estoque — é o que o ponto guarda) na MESMA unidade do insumo,
 * com outra dose na baixa, ou fora dela. Unidade diferente não se compara
 * (o mapa em UI e o insumo em frasco não são a mesma conta). Centésimos de
 * diferença não contam.
 */
export function divergenciasDaBaixa(
  totais: TotalDoMapa[], marcados: InsumoDaBaixa[], doEstoque: ProdutoDaBaixa[],
): DivergenciaDaBaixa[] {
  const saida: DivergenciaDaBaixa[] = []
  const somados = new Map<string, TotalDoMapa>()
  for (const t of totais) {
    if (!(t.total > 0) || !t.product.trim()) continue
    const k = `${chave(t.product)}|${chave(t.unit)}`
    const cur = somados.get(k) ?? { product: t.product.trim(), unit: t.unit, total: 0 }
    cur.total = Math.round((cur.total + t.total) * 1000) / 1000
    somados.set(k, cur)
  }
  for (const t of somados.values()) {
    const insumo = marcados.find(i => chave(i.name) === chave(t.product) && chave(i.unit) === chave(t.unit))
    if (insumo) {
      if (Math.abs(insumo.quantity - t.total) >= 0.01) {
        saida.push({ productId: insumo.productId, nome: insumo.name, unidade: insumo.unit, doMapa: t.total, naBaixa: insumo.quantity })
      }
      continue
    }
    const doCatalogo = doEstoque.find(p => chave(p.name) === chave(t.product) && chave(p.unit) === chave(t.unit))
    if (doCatalogo && !marcados.some(i => i.productId === doCatalogo.id)) {
      saida.push({ productId: doCatalogo.id, nome: doCatalogo.name, unidade: doCatalogo.unit, doMapa: t.total, naBaixa: null })
    }
  }
  return saida
}

/** A frase da divergência, na tela. */
export function textoDaDivergencia(d: DivergenciaDaBaixa): string {
  const mapa = `${formatarDose(d.doMapa)} ${d.unidade}`
  return d.naBaixa === null
    ? `O mapa soma ${mapa} de ${d.nome}, que não está nos insumos da baixa.`
    : `O mapa soma ${mapa} de ${d.nome}; a baixa está em ${formatarDose(d.naBaixa)} ${d.unidade}.`
}
