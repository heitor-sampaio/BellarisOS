import { describe, it, expect } from 'vitest'
import { taxasDaTabelaColada } from '@/lib/financeiro/bandeiras'

/**
 * A3 da 7ª simulação (2026-11-05): o "Preencher pela taxa por parcela"
 * multiplica (a regra do Heitor, r4-f15-01), e a tabela real da operadora não é
 * assim (2,99 → 6,50 em 6x). Colar a tabela preenche cada vez com a taxa DELA.
 */
describe('a tabela da operadora colada', () => {
  it('lê "Nx taxa" de uma planilha (tabulação, % e vírgula)', () => {
    expect(taxasDaTabelaColada('1x\t2,99%\n2x\t4,09%\n6x\t6,50%').taxas).toEqual([
      { parcelas: 1, taxa: 2.99 }, { parcelas: 2, taxa: 4.09 }, { parcelas: 6, taxa: 6.5 },
    ])
  })

  it('aceita "Crédito 3x: 4,79", "3 vezes 4.79" e a ordem que vier', () => {
    expect(taxasDaTabelaColada('Crédito 3x: 4,79\n2 vezes 4.09').taxas).toEqual([
      { parcelas: 2, taxa: 4.09 }, { parcelas: 3, taxa: 4.79 },
    ])
  })

  it('sem o "Nx", os números são as vezes em ordem: 1x, 2x, 3x…', () => {
    expect(taxasDaTabelaColada('2,99\n4,09\n4,79').taxas.map(t => t.parcelas)).toEqual([1, 2, 3])
    expect(taxasDaTabelaColada('2,99; 4,09; 4,79').taxas.map(t => t.taxa)).toEqual([2.99, 4.09, 4.79])
  })

  it('o débito e o Pix ficam fora (têm campo próprio) — e a leitura diz', () => {
    const r = taxasDaTabelaColada('Débito 1,99\nPix 0,99\n1x 2,99')
    expect(r.taxas).toEqual([{ parcelas: 1, taxa: 2.99 }])
    expect(r.ignoradas).toEqual(['Débito 1,99', 'Pix 0,99'])
  })

  it('recusa o que não entende, a vez acima de 12x e a repetida — sem chutar', () => {
    expect(taxasDaTabelaColada('1x abc').erros[0]).toContain('1x abc')
    expect(taxasDaTabelaColada('13x 9,99').erros[0]).toContain('13x')
    expect(taxasDaTabelaColada('2x 4,09\n2x 4,19').erros[0]).toContain('2x aparece duas vezes')
    expect(taxasDaTabelaColada('1x -2').erros[0]).toContain('negativa')
  })
})

describe('A4 da 9ª: a faixa da tabela digitada na taxa por parcela', async () => {
  const { faixaDaOperadora } = await import('@/lib/financeiro/bandeiras')
  it('reconhece "de X a Y", com ou sem %, e só as pontas', () => {
    expect(faixaDaOperadora('de 3,1 a 11,9')).toEqual({ de: 3.1, ate: 11.9 })
    expect(faixaDaOperadora('2,9% até 9,5%')).toEqual({ de: 2.9, ate: 9.5 })
    expect(faixaDaOperadora('3.1 - 11.9')).toEqual({ de: 3.1, ate: 11.9 })
  })
  it('a taxa por parcela de sempre não é faixa', () => {
    expect(faixaDaOperadora('1,15')).toBeNull()
    expect(faixaDaOperadora('de a')).toBeNull()
  })
})
