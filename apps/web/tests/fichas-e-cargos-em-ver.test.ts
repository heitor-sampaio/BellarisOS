import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { MODULE_LEVELS, nivelAceito } from '@/lib/permissions'
import { LEVEL_COPY, configDaRedeNoResumo } from '@/lib/permissions-copy'
import { nivelQueAbreAAba } from '@/lib/configuracoes/abas'

/**
 * O Heitor, 25/11, sobre as Fichas e os Cargos na tela de Cargos: "8 - a" — a
 * opção "o nível passa a se chamar 'Ver': a pessoa abre a aba e lê, como já
 * acontece. A tela passa a dizer a verdade, e ninguém perde nada."
 *
 * Desde 18/11 mudar as fichas e os cargos é só da Admin da rede ("Configuração
 * da rede toda só pela conta admin"): o "Gerenciar" prometia o que não dava.
 */
const ler = (f: string) => readFileSync(path.join(__dirname, '..', f), 'utf8')

describe('as Fichas e os Cargos vão até o Ver', () => {
  it('a matriz oferece Sem acesso e Ver', () => {
    expect(MODULE_LEVELS.forms).toEqual(['NONE', 'VIEW'])
    expect(MODULE_LEVELS.roles).toEqual(['NONE', 'VIEW'])
  })

  it('o Gerenciar já gravado vale Ver (ninguém perde a aba)', () => {
    expect(nivelAceito('forms', 'MANAGE')).toBe('VIEW')
    expect(nivelAceito('roles', 'MANAGE')).toBe('VIEW')
  })

  it('o texto da matriz é o do Ver: abre a aba e lê', () => {
    expect(Object.keys(LEVEL_COPY.forms).sort()).toEqual(['NONE', 'VIEW'])
    expect(Object.keys(LEVEL_COPY.roles).sort()).toEqual(['NONE', 'VIEW'])
    expect(LEVEL_COPY.forms.VIEW).toMatch(/Abre a aba Fichas e lê/)
    expect(LEVEL_COPY.roles.VIEW).toMatch(/Abre a aba Cargos e lê/)
  })

  it('a aba de Fichas e a de Cargos abrem com o Ver; as outras, com o Gerenciar', () => {
    expect(nivelQueAbreAAba('forms')).toBe('VIEW')
    expect(nivelQueAbreAAba('roles')).toBe('VIEW')
    expect(nivelQueAbreAAba('settings')).toBe('MANAGE')
    expect(nivelQueAbreAAba('clients')).toBe('MANAGE')
  })

  it('a tela, a busca e a página de Configurações abrem a aba pelo nível dela', () => {
    const tela = ler('app/_shared/configuracoes.tsx')
    expect(tela).not.toMatch(/gerencia: m => can\(ctx, m, 'MANAGE'\)/)
    expect(tela).not.toMatch(/abaLiberada\(t, m => can\(ctx, m, 'MANAGE'\)\)/)
    expect(tela).toContain('nivelQueAbreAAba')
    expect(ler('lib/busca/paginas.ts')).not.toMatch(/permissions\[m\] === 'MANAGE'/)
    for (const p of ['app/admin/settings/page.tsx', 'app/[slug]/settings/page.tsx']) {
      expect(ler(p), p).not.toMatch(/assertAnyPermission\(ctx, MODULOS_DAS_ABAS[^)]*'MANAGE'\)/)
    }
  })

  it('o resumo do cargo diz que lê e que mudar é da Admin da rede (não "não abre nada")', () => {
    const os2 = configDaRedeNoResumo({ forms: 'VIEW', roles: 'VIEW' })!
    expect(os2).toContain('Fichas e Cargos em Ver')
    expect(os2).not.toContain('não abrem nada')
    expect(configDaRedeNoResumo({ forms: 'MANAGE' })).toContain('Fichas em Ver')
    expect(configDaRedeNoResumo({ roles: 'VIEW' })).toContain('Cargos em Ver')
    expect(configDaRedeNoResumo({ forms: 'NONE', roles: 'NONE' })).toBeNull()
  })
})
