import { describe, it, expect } from 'vitest'
import { divergenciasDaBaixa, formatarDose, textoDaDivergencia } from '@/lib/injetaveis/dose'

describe('formatarDose (A36)', () => {
  it('vírgula, sem casas no inteiro', () => {
    expect(formatarDose(0.5)).toBe('0,5')
    expect(formatarDose(4)).toBe('4')
    expect(formatarDose(1.25)).toBe('1,25')
    expect(formatarDose(Number.NaN)).toBe('0')
  })
})

describe('divergenciasDaBaixa (A36)', () => {
  const estoque = [{ id: 'tox', name: 'Toxina', unit: 'UI' }, { id: 'ah', name: 'Ácido hialurônico', unit: 'ml' }]
  it('a dose do mapa diferente da baixa', () => {
    const d = divergenciasDaBaixa([{ product: 'Toxina', unit: 'UI', total: 8 }], [{ productId: 'tox', name: 'Toxina', unit: 'UI', quantity: 30 }], estoque)
    expect(d).toEqual([{ productId: 'tox', nome: 'Toxina', unidade: 'UI', doMapa: 8, naBaixa: 30 }])
    expect(textoDaDivergencia(d[0]!)).toBe('O mapa soma 8 UI de Toxina; a baixa está em 30 UI.')
  })
  it('igual não diverge; unidade diferente não se compara', () => {
    expect(divergenciasDaBaixa([{ product: 'toxina', unit: 'ui', total: 30 }], [{ productId: 'tox', name: 'Toxina', unit: 'UI', quantity: 30 }], estoque)).toEqual([])
    expect(divergenciasDaBaixa([{ product: 'Toxina', unit: 'ml', total: 1 }], [{ productId: 'tox', name: 'Toxina', unit: 'UI', quantity: 30 }], estoque)).toEqual([])
  })
  it('o produto do mapa fora da baixa, mas no estoque', () => {
    const d = divergenciasDaBaixa([{ product: 'Ácido hialurônico', unit: 'ml', total: 0.5 }], [], estoque)
    expect(d).toEqual([{ productId: 'ah', nome: 'Ácido hialurônico', unidade: 'ml', doMapa: 0.5, naBaixa: null }])
    expect(textoDaDivergencia(d[0]!)).toBe('O mapa soma 0,5 ml de Ácido hialurônico, que não está nos insumos da baixa.')
  })
  it('soma o mesmo produto de vistas diferentes; ignora texto solto', () => {
    const d = divergenciasDaBaixa([
      { product: 'Toxina', unit: 'UI', total: 4 }, { product: 'Toxina ', unit: 'UI', total: 4 }, { product: 'Outra coisa', unit: 'ml', total: 1 },
    ], [{ productId: 'tox', name: 'Toxina', unit: 'UI', quantity: 30 }], estoque)
    expect(d.map(x => x.doMapa)).toEqual([8])
  })
})
