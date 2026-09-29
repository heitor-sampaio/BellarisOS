import { describe, it, expect } from 'vitest'
import { sessoesDoPacote, composicaoDoPacote } from '@/lib/pacotes/rateio'

const soma = (xs: { preco: number }[]) => Math.round(xs.reduce((s, x) => s + x.preco, 0) * 100) / 100

describe('rateio do pacote entre as sessões', () => {
  it('pelo preço de tabela de cada procedimento', () => {
    const s = sessoesDoPacote([
      { procedureId: 'A', quantidade: 1, precoTabela: 300 },
      { procedureId: 'B', quantidade: 1, precoTabela: 100 },
    ], 800)
    expect(s).toEqual([{ procedure_id: 'A', preco: 600 }, { procedure_id: 'B', preco: 200 }])
  })
  it('uma sessão por unidade de cada item, na ordem', () => {
    const s = sessoesDoPacote([
      { procedureId: 'A', quantidade: 2, precoTabela: 100 },
      { procedureId: 'B', quantidade: 1, precoTabela: 200 },
    ], 360)
    expect(s.map(x => x.procedure_id)).toEqual(['A', 'A', 'B'])
    expect(s.map(x => x.preco)).toEqual([90, 90, 180])
  })
  it('a soma sempre fecha com o preço; a última leva o arredondamento', () => {
    const s = sessoesDoPacote([{ procedureId: 'A', quantidade: 3, precoTabela: 50 }], 100)
    expect(s.map(x => x.preco)).toEqual([33.33, 33.33, 33.34])
    expect(soma(s)).toBe(100)
  })
  it('sem preço de tabela, divide igual', () => {
    const s = sessoesDoPacote([
      { procedureId: 'A', quantidade: 1, precoTabela: 0 },
      { procedureId: 'B', quantidade: 1, precoTabela: 0 },
    ], 300)
    expect(s.map(x => x.preco)).toEqual([150, 150])
  })
  it('a composição para a tela', () => {
    expect(composicaoDoPacote([{ procedureName: 'Limpeza', quantidade: 5 }, { procedureName: 'Drenagem', quantidade: 3 }]))
      .toBe('5× Limpeza + 3× Drenagem')
  })
})
