import { describe, it, expect } from 'vitest'
import {
  situacaoDoEstoque, saldoParaMostrar, minimoParaMostrar, emEmbalagens, estoqueBaixo, formatarQuantidadeComUnidade,
} from '@/lib/estoque/situacao'

/**
 * J-43 (simulação de 2026-10-28/29): o estoque se mostra na unidade de consumo,
 * e "igual ao mínimo" é "No mínimo", não "abaixo do mín.".
 */
const toxina = { unit: 'frasco', consumption_unit: 'UI', units_per_package: 100 }
const acido  = { unit: 'frasco', consumption_unit: 'ml', units_per_package: '100.0000' }
const serum  = { unit: 'un', consumption_unit: null, units_per_package: null }

describe('o saldo na tela', () => {
  it('268 UI de toxina aparecem como 268 UI (2,68 frasco), não "3 frasco"', () => {
    const s = { embalagens: 3, rendimento: 268, minimo: 0 }
    expect(formatarQuantidadeComUnidade(saldoParaMostrar(s, toxina))).toBe('268 UI')
    expect(formatarQuantidadeComUnidade(emEmbalagens(268, toxina)!)).toBe('2,68 frasco')
  })
  it('95 ml de ácido aparecem como 95 ml (0,95 frasco), não "1 frasco"', () => {
    const s = { embalagens: 1, rendimento: 95, minimo: 1 }
    expect(formatarQuantidadeComUnidade(saldoParaMostrar(s, acido))).toBe('95 ml')
    expect(formatarQuantidadeComUnidade(emEmbalagens(95, acido)!)).toBe('0,95 frasco')
    expect(formatarQuantidadeComUnidade(minimoParaMostrar(s, acido))).toBe('100 ml')
  })
  it('sem rendimento gravado, as embalagens cheias; sem unidade de consumo, as embalagens', () => {
    expect(saldoParaMostrar({ embalagens: 2, rendimento: null, minimo: 0 }, toxina)).toEqual({ quantidade: 200, unidade: 'UI' })
    expect(saldoParaMostrar({ embalagens: 4, rendimento: null, minimo: 0 }, serum)).toEqual({ quantidade: 4, unidade: 'un' })
    expect(emEmbalagens(4, serum)).toBeNull()
  })
})

describe('a situação', () => {
  it('igual ao mínimo é "No mínimo" (e ainda é estoque baixo)', () => {
    expect(situacaoDoEstoque({ embalagens: 2, rendimento: null, minimo: 2 }, serum)).toBe('NO_MINIMO')
    expect(situacaoDoEstoque({ embalagens: 3, rendimento: 300, minimo: 3 }, toxina)).toBe('NO_MINIMO')
    expect(estoqueBaixo('NO_MINIMO')).toBe(true)
  })
  it('compara o rendimento: 268 UI contra o mínimo de 3 frascos (300 UI) é abaixo; 95 ml contra 1 frasco também', () => {
    expect(situacaoDoEstoque({ embalagens: 3, rendimento: 268, minimo: 3 }, toxina)).toBe('ABAIXO')
    expect(situacaoDoEstoque({ embalagens: 1, rendimento: 95, minimo: 1 }, acido)).toBe('ABAIXO')
    expect(estoqueBaixo('ABAIXO')).toBe(true)
  })
  it('acima do mínimo, ou sem mínimo, é OK; zerado (ou negativo) é sem estoque', () => {
    expect(situacaoDoEstoque({ embalagens: 3, rendimento: 301, minimo: 3 }, toxina)).toBe('OK')
    expect(situacaoDoEstoque({ embalagens: 5, rendimento: null, minimo: 0 }, serum)).toBe('OK')
    expect(situacaoDoEstoque({ embalagens: 0, rendimento: 0, minimo: 2 }, toxina)).toBe('SEM_ESTOQUE')
    expect(situacaoDoEstoque({ embalagens: -1, rendimento: -20, minimo: 0 }, toxina)).toBe('SEM_ESTOQUE')
    expect(estoqueBaixo('OK')).toBe(false)
    expect(estoqueBaixo('SEM_ESTOQUE')).toBe(false)
  })
})
