import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AppModule } from '@estetica-os/types'

/**
 * "O que essa pessoa vai ver" diz as vistas pessoais, como condição (A19 da 27ª
 * simulação; CLAUDE.md §11, as vistas pessoais; princípio 3).
 */
const fonte = (arquivo: string) => readFileSync(join(__dirname, '..', arquivo), 'utf8')
describe('A19: o resumo do cargo diz as vistas pessoais, como condição [3]', () => {
  it('sem a Agenda e sem o Financeiro: a Minha agenda e as Minhas comissões, se ela atende', async () => {
    const { vistasPessoaisNoResumo } = await import('@/lib/permissions-copy')
    const t = vistasPessoaisNoResumo({ agenda: 'NONE', financial: 'NONE' }, [])!
    expect(t).toMatch(/Minha agenda/)
    expect(t).toMatch(/Minhas comissões/)
    expect(t).toMatch(/atende/)
    expect(t).toMatch(/comissão/)
  })

  it('com a Agenda e sem o Financeiro: só as Minhas comissões', async () => {
    const { vistasPessoaisNoResumo } = await import('@/lib/permissions-copy')
    const t = vistasPessoaisNoResumo({ agenda: 'VIEW', financial: 'NONE' }, [])!
    expect(t).toMatch(/Minhas comissões/)
    expect(t).not.toMatch(/Minha agenda/)
  })

  it('com os dois módulos, nada a dizer; fora do plano, a vista não vale', async () => {
    const { vistasPessoaisNoResumo } = await import('@/lib/permissions-copy')
    expect(vistasPessoaisNoResumo({ agenda: 'VIEW', financial: 'VIEW' }, [])).toBeNull()
    const semAgendaNoPlano = vistasPessoaisNoResumo({ agenda: 'NONE', financial: 'NONE' }, ['agenda'] as AppModule[])!
    expect(semAgendaNoPlano).not.toMatch(/Minha agenda/)
    expect(vistasPessoaisNoResumo({ agenda: 'NONE', financial: 'NONE' }, ['agenda', 'financial'] as AppModule[])).toBeNull()
  })

  it('a prévia do cargo mostra a linha', () => {
    const tela = fonte('components/admin/roles-editor.tsx')
    expect(tela).toMatch(/vistasPessoaisNoResumo\(levels, foraDoPlano\)/)
    expect(tela).toMatch(/data-resumo-vistas-pessoais/)
  })
})
