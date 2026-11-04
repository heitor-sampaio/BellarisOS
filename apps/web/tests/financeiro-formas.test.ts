import { describe, it, expect } from 'vitest'
import { rotuloDaForma, rotuloDaFormaDoFechamento, taxaQueVale, formaDoLancamento } from '@/lib/financeiro/formas'

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
  // F16-2 (o Heitor, 2026-11-03, opção A): sem a taxa EXATA daquelas vezes, a
  // taxa é 0% — nunca a de outras vezes ("pode levar a erros de cálculos").
  it('sem ela, nenhuma: 0% — nunca a de outras vezes (a regra de private.comissao_taxa_pct)', () => {
    expect(taxaQueVale(taxas, 3)).toEqual({ cadastrada: false, parcelas: null, taxa: 0 })
  })
  it('sem nenhuma até as vezes, nenhuma', () => {
    expect(taxaQueVale([], 3)).toEqual({ cadastrada: false, parcelas: null, taxa: 0 })
  })
})

// D6 da 6ª simulação: o crediário da clínica não é cartão. A parcela que a
// cliente paga à CLÍNICA nasce sem meio, e a ficha e o app dizem "com a clínica"
// (o app mostrava "Crédito" nas parcelas da Paula).
describe('a forma de um lançamento na ficha e no app (D6)', () => {
  it('o pago, pelo nome; a parcela do crediário sem meio, "com a clínica"; o resto sem forma, nada', () => {
    expect(formaDoLancamento({ metodo: 'CREDIT_CARD', vezes: 3, pago: true })).toBe('Crédito 3x')
    expect(formaDoLancamento({ metodo: null, pago: false, parcela: 1 })).toBe('Com a clínica')
    expect(formaDoLancamento({ metodo: null, pago: false, parcela: null })).toBeNull()
    expect(formaDoLancamento({ metodo: null, pago: true, parcela: 2 })).toBeNull()
  })
})

// A39 da 6ª simulação: o recibo, a confirmação e o app diziam "Crédito 5x" sem
// a bandeira, que a recepção escolheu ("Crédito Visa 5x").
describe('a bandeira no nome da forma (A39)', () => {
  it('o cartão com bandeira diz a bandeira; sem ela, como antes; fora do cartão, nada', () => {
    expect(rotuloDaForma('CREDIT_CARD', 5, { bandeira: 'VISA' })).toBe('Crédito Visa 5x')
    expect(rotuloDaForma('CREDIT_CARD', 1, { bandeira: 'ELO' })).toBe('Crédito Elo')
    expect(rotuloDaForma('DEBIT_CARD', null, { bandeira: 'MASTERCARD', longo: true })).toBe('Cartão de débito Mastercard')
    expect(rotuloDaForma('CREDIT_CARD', 3, { bandeira: null })).toBe('Crédito 3x')
    expect(rotuloDaForma('PIX', null, { bandeira: 'VISA' })).toBe('Pix')
    expect(formaDoLancamento({ metodo: 'CREDIT_CARD', vezes: 5, bandeira: 'VISA', pago: true })).toBe('Crédito Visa 5x')
  })
})

describe('o nome da bandeira na forma é o da lista das bandeiras', () => {
  it('as seis', async () => {
    const { BANDEIRAS } = await import('@/lib/financeiro/bandeiras')
    for (const b of BANDEIRAS) expect(rotuloDaForma('DEBIT_CARD', null, { bandeira: b.value })).toBe(`Débito ${b.label}`)
  })
})
