import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * A26 da 32ª simulação (2026-11-26; FC-14/PV-05, princípio 3): a Valdete, com
 * o Financeiro em Ver, tem o "Fechamento do dia" no menu, só para ver — a tela
 * não confere nem fecha o dia. O "O que essa pessoa vai ver" listava
 * "Fechamento do dia" sem dizer isso (a linha do PDV, "faz o Fechamento do
 * dia", é só de quem tem o PDV). O resumo diz o que a tela dá.
 */
describe('A26: o resumo diz que o Fechamento do dia sem o PDV é só para ver', () => {
  it('com o Financeiro em Ver e sem o PDV: só para ver, e quem fecha', async () => {
    const { fechamentoNoResumo } = await import('@/lib/permissions-copy')
    expect(fechamentoNoResumo({ financial: 'VIEW', cashier: 'NONE' }))
      .toBe('O Fechamento do dia, só para ver: conferir e fechar o dia é de quem tem o PDV.')
    expect(fechamentoNoResumo({ financial: 'MANAGE' })).toMatch(/só para ver/)
  })

  it('com o PDV, a linha do PDV já diz (nada a mais); sem nenhum dos dois, nada', async () => {
    const { fechamentoNoResumo } = await import('@/lib/permissions-copy')
    expect(fechamentoNoResumo({ financial: 'VIEW', cashier: 'MANAGE' })).toBeNull()
    expect(fechamentoNoResumo({ financial: 'NONE', cashier: 'NONE' })).toBeNull()
  })

  it('a prévia do cargo mostra a linha', () => {
    const fonte = readFileSync(path.join(__dirname, '..', 'components/admin/roles-editor.tsx'), 'utf8')
    expect(fonte).toMatch(/data-resumo-fechamento/)
    expect(fonte).toMatch(/fechamentoNoResumo\(levels\)/)
  })
})

// A tela do Fechamento diz o mesmo que o resumo do cargo, com a mesma frase (uma fonte só).
describe('A26: a tela do Fechamento, sem poder fechar, diz que é só para ver', () => {
  it('a frase da tela vem da mesma fonte do resumo', async () => {
    const { FECHAMENTO_SO_PARA_VER } = await import('@/lib/permissions-copy')
    expect(FECHAMENTO_SO_PARA_VER).toBe('Só para ver: conferir e fechar o dia é de quem tem o PDV.')
  })

  it('a tela mostra a frase quando não pode fechar, sem copiar a string', () => {
    const fonte = readFileSync(path.join(__dirname, '..', 'components/shared/fechamento-do-dia-tela.tsx'), 'utf8')
    expect(fonte).toMatch(/!podeFechar && \([\s\S]{0,200}data-fechamento-so-para-ver[\s\S]{0,300}\{FECHAMENTO_SO_PARA_VER\}/)
    expect(fonte).not.toContain('é de quem tem o PDV')
  })
})
