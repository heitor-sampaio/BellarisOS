import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * A barra do app da cliente leva ao Financeiro (A12 da 28ª; princípio 7: o
 * caso comum à vista). O `/cliente/financeiro` existia, e a cliente que veio
 * ver a dívida do crediário só a achou por Histórico → Pagamentos.
 */
const fonte = readFileSync(path.join(__dirname, '..', 'components', 'client-portal', 'client-nav.tsx'), 'utf8')

describe('a barra do app da cliente', () => {
  it('tem o Financeiro, entre o Histórico e o Perfil', () => {
    const caminhos = [...fonte.matchAll(/path:\s*'([a-z-]+)'/g)].map(m => m[1])
    expect(caminhos).toEqual(['home', 'agendamentos', 'historico', 'financeiro', 'perfil'])
    expect(fonte).toMatch(/path:\s*'financeiro',\s*Icon:\s*\w+,\s*label:\s*'Financeiro'/)
  })
})
