import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { vazioDaListaDoFinanceiro } from '@/lib/financeiro/vazio-da-lista'

/**
 * A lista vazia do Financeiro (A receber, A pagar, Movimentações) sugeria
 * "lance uma nova transação" a quem não pode lançar (CLAUDE.md §14: o que a
 * pessoa não pode usar, a tela não oferece). Só quem tem o "Novo lançamento"
 * (o Financeiro em Gerenciar) ouve a sugestão — com o nome do botão.
 */

const WEB = join(__dirname, '..')

describe('a lista vazia só sugere lançar a quem lança', () => {
  it('quem lança: os filtros ou o "Novo lançamento"', () => {
    expect(vazioDaListaDoFinanceiro(true)).toBe('Ajuste os filtros ou use o “Novo lançamento”.')
  })
  it('quem só vê: só os filtros', () => {
    expect(vazioDaListaDoFinanceiro(false)).toBe('Ajuste os filtros.')
  })
  it('a tabela recebe quem lança do Financeiro, e nada diz "nova transação"', () => {
    const tabela = readFileSync(join(WEB, 'components/branch/financial-table.tsx'), 'utf8')
    expect(tabela).toContain('vazioDaListaDoFinanceiro(podeLancar)')
    expect(tabela).not.toContain('nova transação')
    const hub = readFileSync(join(WEB, 'components/branch/financial-hub.tsx'), 'utf8')
    expect(hub).toMatch(/<FinancialTable[\s\S]{0,400}podeLancar=\{canWrite\}/)
  })
})
