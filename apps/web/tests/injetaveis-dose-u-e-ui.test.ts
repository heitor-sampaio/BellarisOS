import { describe, it, expect } from 'vitest'
import { divergenciasDaBaixa, textoDaDivergencia } from '@/lib/injetaveis/dose'

describe('D16: o mapa em "UI" e o insumo em "U" se comparam no Finalizar', () => {
  // A toxina do estoque é contada em "U" (o frasco de 100 U — J-11); o ponto do
  // mapa nasce em "UI". A Marina tinha 56 UI no mapa e a baixa em 40 U, e o
  // "Finalizar" não dizia nada: `chave(unit)` diferente, nenhuma comparação.
  const estoque = [{ id: 'tox', name: 'Toxina', unit: 'U' }]
  it('UI no mapa × U na baixa: diverge, e o texto fala na unidade do insumo', () => {
    const d = divergenciasDaBaixa([{ product: 'Toxina', unit: 'UI', total: 56 }], [{ productId: 'tox', name: 'Toxina', unit: 'U', quantity: 40 }], estoque)
    expect(d).toEqual([{ productId: 'tox', nome: 'Toxina', unidade: 'U', doMapa: 56, naBaixa: 40 }])
    expect(textoDaDivergencia(d[0]!)).toBe('O mapa soma 56 U de Toxina; a baixa está em 40 U.')
  })
  it('pontos em U e em UI do mesmo produto somam juntos', () => {
    const d = divergenciasDaBaixa([
      { product: 'Toxina', unit: 'UI', total: 30 }, { product: 'Toxina', unit: 'U', total: 26 },
    ], [{ productId: 'tox', name: 'Toxina', unit: 'U', quantity: 56 }], estoque)
    expect(d).toEqual([])
  })
  it('fora da baixa, mas no estoque em U: oferece incluir', () => {
    const d = divergenciasDaBaixa([{ product: 'Toxina', unit: 'UI', total: 20 }], [], estoque)
    expect(d).toEqual([{ productId: 'tox', nome: 'Toxina', unidade: 'U', doMapa: 20, naBaixa: null }])
  })
  it('ml e UI seguem sem se comparar', () => {
    expect(divergenciasDaBaixa([{ product: 'Toxina', unit: 'ml', total: 1 }], [{ productId: 'tox', name: 'Toxina', unit: 'U', quantity: 40 }], estoque)).toEqual([])
  })
})
