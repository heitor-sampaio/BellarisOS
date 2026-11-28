import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * O resumo do cargo diz a baixa que vem do PDV (CG-16: "o resumo do cargo diz o
 * que cada módulo abre e de onde vem o que não tem linha própria"; FN-06: dar
 * baixa no Financeiro — o "Receber" e o "Pagar" — é de quem tem o PDV ou o
 * Financeiro em Gerenciar; princípio 3). Com o Financeiro em Ver e o PDV em
 * Gerenciar, a pessoa abre o Financeiro e paga a conta, e o "O que essa pessoa
 * vai ver" não dizia (A6 da 43ª).
 */
describe('o resumo diz que o PDV dá a baixa no Financeiro em Ver', () => {
  it('o PDV em Gerenciar e o Financeiro em Ver: a linha da baixa', async () => {
    const { baixaNoResumo } = await import('@/lib/permissions-copy')
    expect(baixaNoResumo({ cashier: 'MANAGE', financial: 'VIEW' }))
      .toBe('No Financeiro, dá baixa (o “Receber” e o “Pagar” da lista): vem do PDV.')
  })

  it('nos outros casos, nada: o Financeiro em Gerenciar já dá a baixa, e sem o Financeiro a lista não abre', async () => {
    const { baixaNoResumo } = await import('@/lib/permissions-copy')
    expect(baixaNoResumo({ cashier: 'MANAGE', financial: 'MANAGE' })).toBeNull()
    expect(baixaNoResumo({ cashier: 'MANAGE', financial: 'NONE' })).toBeNull()
    expect(baixaNoResumo({ cashier: 'NONE', financial: 'VIEW' })).toBeNull()
  })

  it('a prévia do cargo mostra a linha', () => {
    const fonte = readFileSync(path.join(__dirname, '..', 'components/admin/roles-editor.tsx'), 'utf8')
    expect(fonte).toMatch(/data-resumo-baixa/)
    expect(fonte).toMatch(/baixaNoResumo\(levels\)/)
  })
})
