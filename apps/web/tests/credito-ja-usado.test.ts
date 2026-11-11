import { describe, it, expect } from 'vitest'
import { textoDoJaUsado } from '@/lib/creditos/bonus'

// A31 da 12ª simulação: o estorno do crédito da Bruna (R$ 300 pagos + R$ 30 de
// bônus, R$ 180 usados, o bônus na proporção) dizia "Já usado R$ 163,64" — a
// diferença para os R$ 180 era a fatia do bônus, e a tela não dizia.
describe('A31: o "Já usado" do estorno do crédito diz a fatia do bônus', () => {
  const sem = (s: string) => s.replace(/ /g, ' ')
  it('na proporção: os R$ 180 usados, R$ 16,36 deles do bônus', () => {
    expect(sem(textoDoJaUsado({ usado: 163.64, bonus: 30, bonusSai: 13.64 }))).toBe('R$ 180,00 usados, R$ 16,36 deles do bônus')
  })
  it('o bônus saindo inteiro: tudo o que foi usado foi do pago', () => {
    expect(sem(textoDoJaUsado({ usado: 180, bonus: 30, bonusSai: 30 }))).toBe('R$ 180,00')
  })
  it('sem bônus: só o usado', () => {
    expect(sem(textoDoJaUsado({ usado: 119, bonus: 0, bonusSai: 0 }))).toBe('R$ 119,00')
  })
})
