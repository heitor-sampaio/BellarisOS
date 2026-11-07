import { describe, expect, it } from 'vitest'
import { textoDaOrigemDoCredito } from '@/lib/creditos/origem'

// A41 da 9ª: o crédito concedido não diz que o dinheiro entrou quando ele nasceu.
describe('de onde veio o crédito (A41 da 9ª)', () => {
  it('só concedido: sem dinheiro', () => {
    expect(textoDaOrigemDoCredito([{ amount: 281, concedido: true }, { amount: -100 }])).toBe('o crédito foi concedido pela clínica, sem dinheiro — não é receita')
  })
  it('só comprado ou de cancelamento: o dinheiro entrou antes', () => {
    expect(textoDaOrigemDoCredito([{ amount: 300 }])).toContain('o dinheiro entrou quando o crédito foi comprado')
  })
  it('os dois: diz cada um', () => {
    expect(textoDaOrigemDoCredito([{ amount: 300 }, { amount: 50, concedido: true }])).toContain('o concedido pela clínica nunca teve dinheiro')
  })
  it('o crédito que volta de um estorno não muda a origem', () => {
    expect(textoDaOrigemDoCredito([{ amount: 50, concedido: true }, { amount: 100, transactionId: 'x' }])).toContain('sem dinheiro')
  })
})
