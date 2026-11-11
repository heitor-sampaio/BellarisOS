import { describe, it, expect } from 'vitest'
import { notaDoEstornoParcial, notaDoEstornoParcialParaACliente, notaDoUsoDeCredito } from '@/lib/financeiro/notas-do-lancamento'

// A36 e A37 da 11ª simulação (2026-11-10): a linha do lançamento diz o que
// foi pago e o que voltou, e que o uso do crédito não é receita.
describe('A36: o pagamento estornado em parte', () => {
  it('diz o pago e o estornado', () => {
    expect(notaDoEstornoParcial({ type: 'INCOME', amount: 110, is_paid: true, valor_antes_do_estorno: 1100 }))
      .toMatch(/^Pago R\$\s1\.100,00 · R\$\s990,00 estornados$/)
  })
  it('sem estorno parcial, nada', () => {
    expect(notaDoEstornoParcial({ type: 'INCOME', amount: 110, is_paid: true, valor_antes_do_estorno: null })).toBeNull()
    expect(notaDoEstornoParcial({ type: 'INCOME', amount: 110, is_paid: true, valor_antes_do_estorno: 1100, notes: 'Estornada' })).toBeNull()
  })
})

describe('A37: o uso do crédito interno', () => {
  it('diz que não é receita', () => {
    expect(notaDoUsoDeCredito({ type: 'INCOME', amount: 130, is_paid: true, payment_method: 'INTERNAL_CREDIT' })).toContain('não é receita')
    expect(notaDoUsoDeCredito({ type: 'INCOME', amount: 130, is_paid: true, payment_method: 'PIX' })).toBeNull()
  })
})

// A57 da 12ª simulação: no app, a compra de crédito da Bruna estornada em parte
// aparecia "Crédito na clínica R$ 163,64 Pago", sem o que ela pagou e o que voltou.
describe('A57: no app, o pago e o devolvido', () => {
  it('diz o pago e o devolvido, com as palavras da cliente', () => {
    expect(notaDoEstornoParcialParaACliente({ type: 'INCOME', amount: 163.64, is_paid: true, valor_antes_do_estorno: 300 }))
      .toMatch(/^R\$\s300,00 pagos · R\$\s136,36 devolvidos$/)
  })
  it('sem estorno parcial, nada', () => {
    expect(notaDoEstornoParcialParaACliente({ type: 'INCOME', amount: 300, is_paid: true, valor_antes_do_estorno: null })).toBeNull()
  })
})
