import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { abaDaFicha, chaveDaAbaPedida } from '@/lib/clientes/aba-da-ficha'
import { avisoDaAbaFechada, avisoDaAbaQueNaoExiste } from '@/lib/clients/aba-fechada'

/**
 * A ficha aberta com `?aba=` de uma aba que a pessoa não abre (A8 da 29ª; o
 * análogo de CU-08 e o `comAviso` do CLAUDE.md §6: o redirecionamento leva o
 * motivo). Quem só tem o Prontuário abria `?aba=prontuario` e caía na aba
 * Prontuário calada; `?aba=dados` dizia "Você está na Visão geral" — ela
 * estava no Prontuário. Agora: "prontuario" é a aba Prontuário (a chave é
 * "fichas"); a aba fechada diz onde a pessoa ficou; a que não existe diz isso.
 */
describe('a aba pedida pela URL', () => {
  it('"prontuario" (o nome da aba) é a aba Prontuário', () => {
    expect(chaveDaAbaPedida('prontuario')).toBe('fichas')
    expect(chaveDaAbaPedida('Prontuário')).toBe('fichas')
    expect(abaDaFicha('prontuario')).toBe('fichas')
    expect(chaveDaAbaPedida('dados')).toBe('dados')
    expect(chaveDaAbaPedida(null)).toBeNull()
  })
  it('a aba fechada diz onde a pessoa ficou (a Visão geral, ou o Prontuário de quem só o tem)', () => {
    expect(avisoDaAbaFechada({ key: 'dados', label: 'Dados' })).toBe('Suas permissões não abrem a aba Dados desta ficha. Você está na Visão geral.')
    expect(avisoDaAbaFechada({ key: 'dados', label: 'Dados' }, 'fichas'))
      .toBe('Suas permissões não abrem a aba Dados desta ficha. Você está na aba Prontuário.')
  })
  it('a aba que não existe diz que não existe', () => {
    expect(avisoDaAbaQueNaoExiste('xyz')).toBe('A aba “xyz” não existe nesta ficha. Você está na Visão geral.')
    expect(avisoDaAbaQueNaoExiste('xyz', 'fichas')).toBe('A aba “xyz” não existe nesta ficha. Você está na aba Prontuário.')
  })
  it('a ficha usa os três', () => {
    const t = readFileSync(join(__dirname, '..', 'components/branch/client-profile.tsx'), 'utf8')
    expect(t).toContain('chaveDaAbaPedida(')
    expect(t).toContain('avisoDaAbaQueNaoExiste(')
    expect(t).toMatch(/avisoDaAbaFechada\(abaFechada, tab\)/)
  })
})
