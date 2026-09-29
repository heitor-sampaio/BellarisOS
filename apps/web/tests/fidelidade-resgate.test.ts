import { describe, it, expect } from 'vitest'
import { calcularDescontoComPontos, maximoDePontos } from '@/lib/fidelidade/resgate'

const regras = { valorDoPonto: 0.01, minimo: 0, tetoPct: 100 }

describe('calcularDescontoComPontos', () => {
  it('sem pedido, sem desconto', () => {
    expect(calcularDescontoComPontos({ saldo: 500, preco: 200, pedido: 0, regras }))
      .toEqual({ pontos: 0, desconto: 0, restante: 200 })
  })

  it('pontos × valor, e o restante fecha ao centavo', () => {
    expect(calcularDescontoComPontos({ saldo: 5000, preco: 250.5, pedido: 333, regras }))
      .toEqual({ pontos: 333, desconto: 3.33, restante: 247.17 })
  })

  it('valor com 4 casas arredonda como o banco (meio para cima)', () => {
    // 3 × 0,0125 = 0,0375 → 0,04
    const r = calcularDescontoComPontos({ saldo: 10, preco: 100, pedido: 3, regras: { ...regras, valorDoPonto: 0.0125 } })
    expect(r.desconto).toBe(0.04)
  })

  it('recusa abaixo do mínimo, acima do saldo e acima do teto', () => {
    expect(calcularDescontoComPontos({ saldo: 500, preco: 200, pedido: 50, regras: { ...regras, minimo: 100 } }).motivo)
      .toMatch(/mínimo/)
    expect(calcularDescontoComPontos({ saldo: 40, preco: 200, pedido: 50, regras }).motivo).toMatch(/insuficiente/)
    expect(calcularDescontoComPontos({ saldo: 99_999, preco: 200, pedido: 10_001, regras: { ...regras, tetoPct: 50 } }).motivo)
      .toMatch(/50%/)
  })

  it('saldo negativo nunca vira desconto', () => {
    expect(calcularDescontoComPontos({ saldo: -30, preco: 200, pedido: 10, regras }).motivo).toMatch(/insuficiente/)
  })

  it('desconto não passa do preço', () => {
    const r = calcularDescontoComPontos({ saldo: 99_999, preco: 50, pedido: 99_999, regras: { ...regras, valorDoPonto: 1, tetoPct: 100 } })
    expect(r).toMatchObject({ desconto: 50, restante: 0 })
  })
})

describe('maximoDePontos', () => {
  it('o menor entre o saldo e o teto', () => {
    expect(maximoDePontos(500, 200, regras)).toBe(500)                          // saldo limita
    expect(maximoDePontos(99_999, 200, { ...regras, tetoPct: 50 })).toBe(10_000) // teto: R$ 100
  })

  it('o máximo sempre passa no cálculo (e no banco)', () => {
    for (const [saldo, preco, valor, teto] of [[99_999, 250.5, 0.03, 33.33], [7_777, 99.99, 0.0125, 70], [12_345, 1_000, 0.07, 15]] as const) {
      const r2 = { valorDoPonto: valor, minimo: 0, tetoPct: teto }
      const max = maximoDePontos(saldo, preco, r2)
      expect(calcularDescontoComPontos({ saldo, preco, pedido: max, regras: r2 }).motivo, `${saldo}/${preco}`).toBeUndefined()
      expect(calcularDescontoComPontos({ saldo, preco, pedido: max + 1, regras: r2 }).motivo).toBeDefined()
    }
  })

  it('zero quando não chega ao mínimo', () => {
    expect(maximoDePontos(80, 200, { ...regras, minimo: 100 })).toBe(0)
  })
})
