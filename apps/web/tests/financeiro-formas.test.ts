import { describe, it, expect } from 'vitest'
import { rotuloDaForma, rotuloDaFormaDoFechamento, taxaQueVale } from '@/lib/financeiro/formas'

/**
 * O nome da forma de pagamento é UM (A33 e A35 da simulação de 2026-10-27):
 * cada tela tinha a sua tabela, e nenhuma dizia o "3x" do crédito.
 */
describe('rotuloDaForma', () => {
  it('o crédito em N vezes diz as vezes', () => {
    expect(rotuloDaForma('CREDIT_CARD', 3)).toBe('Crédito 3x')
    expect(rotuloDaForma('CREDIT_CARD', 3, { longo: true })).toBe('Cartão de crédito 3x')
    expect(rotuloDaForma('CREDIT_CARD', null)).toBe('Crédito')
    expect(rotuloDaForma('CREDIT_CARD', 1)).toBe('Crédito')
  })
  it('os outros meios', () => {
    expect(rotuloDaForma('PIX')).toBe('Pix')
    expect(rotuloDaForma('CASH')).toBe('Dinheiro')
    expect(rotuloDaForma('DEBIT_CARD', null, { longo: true })).toBe('Cartão de débito')
    expect(rotuloDaForma('INTERNAL_CREDIT')).toBe('Crédito interno')
    expect(rotuloDaForma(null)).toBe('Sem forma de pagamento')
  })
})

describe('rotuloDaFormaDoFechamento', () => {
  it('lê a chave do banco (forma e vezes)', () => {
    expect(rotuloDaFormaDoFechamento('CREDIT_CARD:3')).toBe('Cartão de crédito 3x')
    expect(rotuloDaFormaDoFechamento('CASH')).toBe('Dinheiro')
  })
  it('"(pontos)" só para o que os pontos pagaram; o resto sem forma é "Sem forma de pagamento"', () => {
    expect(rotuloDaFormaDoFechamento('PONTOS')).toBe('Sem forma (pontos)')
    expect(rotuloDaFormaDoFechamento('SEM_FORMA')).toBe('Sem forma de pagamento')
  })
})

describe('taxaQueVale', () => {
  const taxas = [{ parcelas: 1, taxa_pct: 3.49 }, { parcelas: 2, taxa_pct: 4.5 }]
  it('a das vezes exatas, quando cadastrada', () => {
    expect(taxaQueVale(taxas, 2)).toEqual({ cadastrada: true, parcelas: 2, taxa: 4.5 })
  })
  it('sem ela, a maior cadastrada até as vezes (a regra de private.comissao_taxa_pct)', () => {
    expect(taxaQueVale(taxas, 3)).toEqual({ cadastrada: false, parcelas: 2, taxa: 4.5 })
  })
  it('sem nenhuma até as vezes, nenhuma', () => {
    expect(taxaQueVale([], 3)).toEqual({ cadastrada: false, parcelas: null, taxa: 0 })
  })
})
