import { describe, it, expect } from 'vitest'
import { textoDoSaldoDoCredito } from '@/lib/creditos/saldo-na-tela'

const br = (s: string) => s.replace(/\u00a0/g, ' ')

// A36 da 8ª simulação: pagar com "Crédito interno" não mostrava o saldo nem o que sobra.
describe('A36: o saldo do crédito na tela de cobrança', () => {
  it('cobre: o saldo e o que sobra', () => {
    const t = textoDoSaldoDoCredito(450, 90)
    expect(t.cobre).toBe(true)
    expect(br(t.texto)).toBe('Crédito na clínica: R$ 450,00 · depois deste pagamento: R$ 360,00')
  })
  it('não cobre: o que falta, e que o banco recusa', () => {
    const t = textoDoSaldoDoCredito(450, 500)
    expect(t.cobre).toBe(false)
    expect(br(t.texto)).toContain('faltam R$ 50,00')
  })
  it('sem saldo', () => {
    expect(textoDoSaldoDoCredito(0, 100).cobre).toBe(false)
  })
})
