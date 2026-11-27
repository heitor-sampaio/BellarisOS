import type { InjectablePoint } from '@/lib/anamnesis'

/**
 * A medida da dose do ponto do mapa é a do PRODUTO do estoque (o Heitor,
 * 27/11: "O consumo é sempre na unidade cadastrada no produto, seja no mapa,
 * seja no atendimento, seja no consumo do estoque."). A medida é a de consumo
 * (`unidadeDoInsumo`: o ml do frasco de 100 ml; sem ela, a do produto) — a
 * mesma da baixa do atendimento e do movimento do estoque. O mapa não escolhe
 * nem digita outra: escolher o produto é escolher a medida.
 *
 * O ponto gravado antes noutra medida não se reescreve (decisão do Claude,
 * princípios 3 e 4: trocar só o rótulo mudaria o que a dose diz, e converter
 * seria chutar número) — fica como foi gravado até alguém trocar o produto.
 * Módulo neutro: a tela e o servidor usam.
 */

/** Um produto que o ponto oferece: o nome do insumo e a medida de consumo dele. */
export interface ProdutoDoMapa { name: string; unit: string }

const chave = (t: string) => t.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/** Os produtos do estoque com este nome (dois insumos podem ter o mesmo nome). */
function produtosComONome(produtos: readonly ProdutoDoMapa[], nome: string): ProdutoDoMapa[] {
  const k = chave(nome)
  return k ? produtos.filter(p => chave(p.name) === k) : []
}

/** O produto escolhido para o ponto, com a medida dele. Sem produto, sem medida. */
export function comOProduto(nome: string, produtos: readonly ProdutoDoMapa[]): { product: string; unit: string } {
  const p = produtosComONome(produtos, nome)[0]
  return p ? { product: p.name, unit: p.unit } : { product: '', unit: '' }
}

/**
 * O ponto novo: o primeiro nasce sem produto; os seguintes repetem o
 * produto e a dose do último, na medida do produto. O último gravado noutra
 * medida não empresta a dose (o número era de outra medida); o de produto fora
 * do estoque não empresta nada.
 */
export function pontoNovo(
  ultimo: Pick<InjectablePoint, 'product' | 'dose' | 'unit'> | undefined, produtos: readonly ProdutoDoMapa[],
): { product: string; dose: number; unit: string } {
  if (!ultimo) return { product: '', dose: 0, unit: '' }
  const { product, unit } = comOProduto(ultimo.product ?? '', produtos)
  if (!product) return { product: '', dose: 0, unit: '' }
  return { product, unit, dose: chave(ultimo.unit ?? '') === chave(unit) ? Number(ultimo.dose) || 0 : 0 }
}

/**
 * A recusa do servidor (salvar o planejamento, registrar a aplicação): o ponto
 * NOVO, ou com o produto ou a medida trocados, tem de ser de um produto do
 * estoque e na medida dele — o impossível se recusa. O ponto gravado antes,
 * com o produto e a medida de quando foi gravado, passa (a dose pode mudar).
 * O ponto sem produto ainda não tem medida: passa (o planejamento o marca antes).
 */
export function recusaDaMedidaDosPontos(
  pontos: readonly InjectablePoint[],
  salvos: readonly InjectablePoint[],
  produtos: readonly ProdutoDoMapa[],
): string | null {
  const antes = new Map(salvos.map(p => [p.id, p]))
  for (const p of pontos) {
    const nome = (p.product ?? '').trim()
    if (!nome) continue
    const salvo = antes.get(p.id)
    if (salvo && chave(salvo.product ?? '') === chave(nome) && chave(salvo.unit ?? '') === chave(p.unit ?? '')) continue
    const doEstoque = produtosComONome(produtos, nome)
    if (!doEstoque.length) return `${nome} não está entre os produtos do estoque.`
    if (!doEstoque.some(e => chave(e.unit) === chave(p.unit ?? ''))) {
      return `A dose de ${doEstoque[0]!.name} é em ${doEstoque[0]!.unit}, a medida do produto no estoque.`
    }
  }
  return null
}
