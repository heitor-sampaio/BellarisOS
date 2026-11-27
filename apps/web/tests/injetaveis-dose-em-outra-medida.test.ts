import { describe, it, expect } from 'vitest'
import { divergenciasDaBaixa, textoDaDivergencia } from '@/lib/injetaveis/dose'

/**
 * D10 da 31ª simulação (PT-18: o "Finalizar" compara a dose do mapa com a baixa
 * e AVISA). No Ateliê Clívia a toxina e o ácido estão no estoque em "frasco" e
 * "seringa", sem a medida de uso (U, ml); o mapa marcou 30 UI e 1 ml, os
 * procedimentos não têm insumo, e o "Finalizar" ficou calado: a unidade
 * diferente não se comparava, e o produto do mapa fora da baixa sumia junto.
 *
 * A dose em outra medida segue sem conversão (princípio 4: não chutar número),
 * mas o produto do mapa que NÃO está na baixa avisa, dizendo em que medida o
 * estoque o conta — e sem botão que incluiria "30 frascos".
 *
 * Desde a regra da medida do produto (o Heitor, 27/11: "O consumo é sempre na
 * unidade cadastrada no produto, seja no mapa, seja no atendimento, seja no
 * consumo do estoque."), o ponto novo nasce na medida do produto ("frasco"): o
 * mapa em UI de um produto em frasco é só o ponto gravado antes, que fica como
 * foi gravado (decisão do Claude, princípios 3 e 4).
 */
const estoque = [
  { id: 'tox', name: 'Toxina botulínica 100U', unit: 'frasco' },
  { id: 'ah', name: 'Ácido hialurônico 1 ml', unit: 'seringa' },
]

describe('o mapa × a baixa quando o estoque conta o produto em outra medida', () => {
  it('o ponto gravado antes, fora da baixa: avisa, com a medida do estoque e sem a dose a incluir', () => {
    const d = divergenciasDaBaixa([
      { product: 'Toxina botulínica 100U', unit: 'UI', total: 30 },
      { product: 'Ácido hialurônico 1 ml', unit: 'ml', total: 1 },
    ], [], estoque)
    expect(d).toEqual([
      { productId: 'tox', nome: 'Toxina botulínica 100U', unidade: 'frasco', doMapa: 30, naBaixa: null, medidaDoMapa: 'UI' },
      { productId: 'ah', nome: 'Ácido hialurônico 1 ml', unidade: 'seringa', doMapa: 1, naBaixa: null, medidaDoMapa: 'ml' },
    ])
    expect(textoDaDivergencia(d[0]!)).toBe(
      'O mapa soma 30 UI de Toxina botulínica 100U, que não está nos insumos da baixa. O estoque conta este produto em frasco: inclua no cartão de insumos quanto foi usado.')
  })

  // Antes: "já na baixa em outra medida: não se compara (como antes)".
  it('o ponto gravado antes, já na baixa em outra medida: não se compara nem se converte', () => {
    expect(divergenciasDaBaixa([{ product: 'Toxina botulínica 100U', unit: 'UI', total: 30 }],
      [{ productId: 'tox', name: 'Toxina botulínica 100U', unit: 'frasco', quantity: 1 }], estoque)).toEqual([])
  })
})
