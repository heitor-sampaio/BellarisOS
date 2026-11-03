import { describe, it, expect } from 'vitest'
import { resumoDasParcelas, resumoDasVezes } from '@/lib/checkout/resumo-do-pagamento'

const nb = (s: string | null) => s?.replace(/ /g, ' ') ?? null

describe('resumoDasParcelas (A46)', () => {
  it('entrada + parcelas iguais', () => expect(nb(resumoDasParcelas(3300, 300, 3))).toBe('Entrada R$ 300,00 + 3× R$ 1.000,00'))
  it('sem entrada', () => expect(nb(resumoDasParcelas(3300, 0, 3))).toBe('3× R$ 1.100,00'))
  it('a sobra na última', () => expect(nb(resumoDasParcelas(1000, 0, 3))).toBe('2× R$ 333,33 + 1× R$ 333,34'))
  it('entrada que cobre tudo, nada a dividir', () => expect(resumoDasParcelas(300, 300, 3)).toBeNull())
})

describe('resumoDasVezes (A47)', () => {
  it('3x', () => expect(nb(resumoDasVezes(1100, 3))).toBe('2× R$ 366,66 + 1× R$ 366,68'))
  it('à vista não diz nada', () => expect(resumoDasVezes(1100, 1)).toBeNull())
  it('4x de 400', () => expect(nb(resumoDasVezes(1600, 4))).toBe('4× R$ 400,00'))
})
