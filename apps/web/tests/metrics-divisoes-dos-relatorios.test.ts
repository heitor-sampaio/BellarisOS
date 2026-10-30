import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { taxaDeConclusao, taxaDeRetencao, giroDoEstoque, conversaoDasOportunidades } from '@/lib/metrics/resultado'

/**
 * As quatro divisões que ainda eram feitas NA TELA de Relatórios vão para
 * lib/metrics (decisão do Heitor, 2026-10-29; §13.1 — nenhuma tela divide): a
 * taxa de conclusão da agenda (no total e por unidade), a retenção, o giro do
 * estoque e a conversão por vendedor do Comercial (já em getPainelComercial,
 * com a conversão da oportunidade). Mudança de lugar: os números não mudam.
 */
describe('taxaDeConclusao (aba Agenda)', () => {
  it('concluídos ÷ agendamentos do período, em %', () => {
    expect(taxaDeConclusao({ concluidos: 3, total: 4 })).toBe(75)
  })
  it('sem agendamento não há taxa', () => {
    expect(taxaDeConclusao({ concluidos: 0, total: 0 })).toBeNull()
  })
})

describe('taxaDeRetencao (aba Clientes)', () => {
  it('as que voltaram ÷ as atendidas no período, em %', () => {
    expect(taxaDeRetencao({ clientsServed: 3, returningClients: 2 })).toBeCloseTo(66.667, 2)
  })
  it('sem atendida não há taxa', () => {
    expect(taxaDeRetencao({ clientsServed: 0, returningClients: 0 })).toBeNull()
  })
})

describe('giroDoEstoque (aba Estoque)', () => {
  it('o consumo do período ÷ o valor em estoque, em %', () => {
    expect(giroDoEstoque({ consumo: 50, valorEmEstoque: 200 })).toBe(25)
  })
  it('sem estoque não há giro', () => {
    expect(giroDoEstoque({ consumo: 10, valorEmEstoque: 0 })).toBeNull()
  })
})

describe('conversão por vendedor (aba Comercial)', () => {
  it('a mesma conta da oportunidade, sobre as dele', () => {
    expect(conversaoDasOportunidades({ total: 4, ganhos: 1, temGanho: true })).toBe(25)
  })
})

describe('a tela de Relatórios não divide', () => {
  const tela = fs.readFileSync(path.resolve(__dirname, '..', 'components/admin/reports-bi-view.tsx'), 'utf8')
  it('a taxa de conclusão (total e por unidade)', () => {
    expect(tela).not.toMatch(/completed\s*\/\s*total/)
    expect(tela).not.toMatch(/u\.concluidos\s*\/\s*u\.total/)
  })
  it('a retenção', () => {
    expect(tela).not.toMatch(/returningClients\s*\/\s*clientsServed/)
  })
  it('o giro do estoque', () => {
    expect(tela).not.toMatch(/consumoValue\s*\/\s*totalStockValue/)
  })
  it('a conversão por vendedor', () => {
    expect(tela).not.toMatch(/row\.convertidos\)?\s*\/\s*Number\(row\.leads/)
  })
})
