import { describe, it, expect } from 'vitest'
import { composicaoDaBase, textoDaBase } from '../lib/comissoes/base-efetiva'

// D3 da 10ª simulação: o extrato diz a base que a conta usou, e o caminho do preço até ela.
const nb = (s: string) => s.replace(/ /g, ' ')
describe('a base efetiva da comissão na tela', () => {
  it('sem a taxa: a base e o que saiu', () => {
    const l = { preco: 420, base: 413.7, baseDesconto: 0, baseTaxa: 6.3, baseInsumos: 0, baseFator: 1 }
    expect(nb(textoDaBase('base sem a taxa da maquininha', l))).toBe('base sem a taxa da maquininha: R$ 413,70 (R$ 420,00 − R$ 6,30 da taxa)')
  })
  it('o plano cancelado: a proporção do que ficou', () => {
    const l = { preco: 1700, base: 700, baseDesconto: 0, baseTaxa: 0, baseInsumos: 0, baseFator: 700 / 1700 }
    expect(nb(composicaoDaBase(l))).toBe('R$ 1.700,00, na proporção do que ficou (41,2%)')
  })
  it('base cheia: só o valor, sem caminho', () => {
    const l = { preco: 150, base: 150, baseDesconto: 0, baseTaxa: 0, baseInsumos: 0, baseFator: 1 }
    expect(nb(textoDaBase('base cheia', l))).toBe('base cheia: R$ 150,00')
  })
  it('desconto, taxa e insumos juntos', () => {
    const l = { preco: 260, base: 200, baseDesconto: 20, baseTaxa: 4.8, baseInsumos: 35.2, baseFator: 1 }
    expect(nb(composicaoDaBase(l))).toBe('R$ 260,00 − R$ 20,00 de desconto − R$ 4,80 da taxa − R$ 35,20 de insumos')
  })
})
