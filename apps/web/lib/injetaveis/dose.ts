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
  /**
   * D10 da 31ª: o estoque conta o produto noutra medida (o frasco, a seringa) e
   * o mapa em UI ou ml — a dose do mapa (`doMapa`) está NESTA medida, e não se
   * converte (princípio 4). Só no produto fora da baixa: a tela avisa, sem botão.
   */
  medidaDoMapa?: string
}

const chave = (t: string) => t.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
/**
 * A unidade da dose: "U" e "UI" são a mesma medida da toxina (D16 da 9ª
 * simulação, 2026-11-07): o frasco do estoque é "de 100 U" (J-11) e o ponto do
 * mapa nasce em "UI" — sem isto, os 56 UI do mapa da Marina e os 40 U da baixa
 * nunca se comparavam, e o "Finalizar" não avisava.
 */
const chaveDaUnidade = (u: string) => { const k = chave(u); return k === 'ui' ? 'u' : k }

/**
 * As divergências entre o mapa e a baixa: o produto do mapa (pelo NOME do
 * produto do estoque — é o que o ponto guarda) na MESMA unidade do insumo,
 * com outra dose na baixa, ou fora dela. Unidade diferente não se compara
 * (o mapa em UI e o insumo em frasco não são a mesma conta) — "U" e "UI" são a
 * mesma (D16 da 9ª). Centésimos de diferença não contam.
 */
export function divergenciasDaBaixa(
  totais: TotalDoMapa[], marcados: InsumoDaBaixa[], doEstoque: ProdutoDaBaixa[],
): DivergenciaDaBaixa[] {
  const saida: DivergenciaDaBaixa[] = []
  const somados = new Map<string, TotalDoMapa>()
  for (const t of totais) {
    if (!(t.total > 0) || !t.product.trim()) continue
    const k = `${chave(t.product)}|${chaveDaUnidade(t.unit)}`
    const cur = somados.get(k) ?? { product: t.product.trim(), unit: t.unit, total: 0 }
    cur.total = Math.round((cur.total + t.total) * 1000) / 1000
    somados.set(k, cur)
  }
  for (const t of somados.values()) {
    const insumo = marcados.find(i => chave(i.name) === chave(t.product) && chaveDaUnidade(i.unit) === chaveDaUnidade(t.unit))
    if (insumo) {
      if (Math.abs(insumo.quantity - t.total) >= 0.01) {
        saida.push({ productId: insumo.productId, nome: insumo.name, unidade: insumo.unit, doMapa: t.total, naBaixa: insumo.quantity })
      }
      continue
    }
    const doCatalogo = doEstoque.find(p => chave(p.name) === chave(t.product) && chaveDaUnidade(p.unit) === chaveDaUnidade(t.unit))
    if (doCatalogo && !marcados.some(i => i.productId === doCatalogo.id)) {
      saida.push({ productId: doCatalogo.id, nome: doCatalogo.name, unidade: doCatalogo.unit, doMapa: t.total, naBaixa: null })
      continue
    }
    // D10 da 31ª (PT-18: o Finalizar AVISA): o produto do mapa no estoque em
    // OUTRA medida (30 UI no mapa, o frasco no estoque) e fora da baixa — antes
    // sumia calado. Não se converte nem se sugere a dose (princípio 4).
    const emOutraMedida = doEstoque.find(p => chave(p.name) === chave(t.product))
    if (!doCatalogo && emOutraMedida && !marcados.some(i => i.productId === emOutraMedida.id)
      && !saida.some(d => d.productId === emOutraMedida.id)) {
      saida.push({ productId: emOutraMedida.id, nome: emOutraMedida.name, unidade: emOutraMedida.unit, doMapa: t.total, naBaixa: null, medidaDoMapa: t.unit })
    }
  }
  return saida
}

/**
 * De onde vem o total do mapa: a APLICAÇÃO registrada neste atendimento (PT-13)
 * ou o PLANEJAMENTO escolhido na ficha, sem aplicação.
 */
export type OrigemDoTotal = 'APLICACAO' | 'PLANEJAMENTO'

/**
 * Os totais do mapa que se comparam com a baixa (A1 da 33ª e a Decisão A —
 * decisão do Claude, 26/11, princípio 5: "Sem execução, sem valor"). A
 * aplicação registrada aqui se compara sempre (PT-18). O planejamento não é
 * consumo: só se compara com o produto que ESTE atendimento tem no cartão de
 * insumos (marcado ou não) — o planejamento da Toxina numa sessão de Toxina
 * (A36 da 5ª). O produto que o atendimento não usa é planejamento para outro
 * dia (a Toxina desenhada na Avaliação da A01): nem aviso, nem "Incluir na baixa".
 */
export function totaisQueSeComparam(
  totais: readonly (TotalDoMapa & { origem?: OrigemDoTotal })[], doCartao: readonly { name: string }[],
): TotalDoMapa[] {
  const usados = new Set(doCartao.map(i => chave(i.name)))
  return totais
    .filter(t => t.origem !== 'PLANEJAMENTO' || usados.has(chave(t.product)))
    .map(({ product, unit, total }) => ({ product, unit, total }))
}

/** A frase da divergência, na tela. */
export function textoDaDivergencia(d: DivergenciaDaBaixa): string {
  if (d.medidaDoMapa) {
    return `O mapa soma ${formatarDose(d.doMapa)} ${d.medidaDoMapa} de ${d.nome}, que não está nos insumos da baixa. O estoque conta este produto em ${d.unidade}: inclua no cartão de insumos quanto foi usado.`
  }
  const mapa = `${formatarDose(d.doMapa)} ${d.unidade}`
  return d.naBaixa === null
    ? `O mapa soma ${mapa} de ${d.nome}, que não está nos insumos da baixa.`
    : `O mapa soma ${mapa} de ${d.nome}; a baixa está em ${formatarDose(d.naBaixa)} ${d.unidade}.`
}
