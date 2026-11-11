import { describe, it, expect } from 'vitest'
import { saldoNaPrateleira } from '@/lib/estoque/saldo-em-texto'

// A50 da 11ª: "Atual: 11 frasco" para 10,84.
describe('A50: o saldo como está na prateleira', () => {
  it('fechados e o aberto', () => {
    expect(saldoNaPrateleira(10840, 1000, 'refil', 'g')).toBe('10 refis fechados + 1 aberto com 840 g')
    expect(saldoNaPrateleira(1840, 1000, 'refil', 'g')).toBe('1 refil fechado + 1 aberto com 840 g')
    expect(saldoNaPrateleira(840, 1000, 'refil', 'g')).toBe('1 refil aberto com 840 g')
  })
  it('sem aberto, só as embalagens', () => {
    expect(saldoNaPrateleira(11000, 1000, 'refil', 'g')).toBe('11 refis')
  })
})
