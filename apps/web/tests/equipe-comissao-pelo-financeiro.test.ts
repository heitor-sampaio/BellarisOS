import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ResolvedPermissions } from '@estetica-os/types'
import { NO_PERMISSIONS } from '@/lib/permissions'
import { ADMIN_MENU, BRANCH_MENU, menuEntriesFor } from '@/lib/menu'
import { abreAEquipe } from '@/lib/equipe/quem-abre-a-equipe'

/**
 * D5 da 40ª simulação (CM-04 do catálogo de Comissões; o Heitor, 2026-11-13,
 * sobre a comissão na Equipe: "esquece, deixa como está"): a comissão de cada
 * pessoa se define na Equipe, pelo chip da linha, e muda quem tem o Financeiro
 * em Gerenciar — não a Equipe. O Clidenor (Financeiro em Gerenciar, sem a
 * Equipe) não chegava ao chip: as duas páginas da Equipe exigiam a Equipe em
 * Ver, e o menu só mostrava a Equipe a quem a tem.
 *
 * A Equipe abre também a quem tem o Financeiro em Gerenciar com as comissões
 * no plano — sem o lápis, o cadastro e o desativar (que pedem a Equipe em
 * Gerenciar): só o chip da comissão (decisão do Claude, 27/11, princípio 7).
 */

const com = (over: Partial<ResolvedPermissions>): ResolvedPermissions => ({ ...NO_PERMISSIONS, ...over })
const fonte = (rel: string) => readFileSync(join(__dirname, '..', rel), 'utf8')
const COM_COMISSOES = { funcionalidades: ['comissoes'] }
const SEM_COMISSOES = { funcionalidades: ['agenda'] }

describe('D5: quem abre a Equipe', () => {
  it('a Equipe em Ver abre; o Financeiro em Gerenciar com as comissões no plano também', () => {
    expect(abreAEquipe(com({ team: 'VIEW' }), false)).toBe(true)
    expect(abreAEquipe(com({ financial: 'MANAGE' }), true)).toBe(true)
  })
  it('o Financeiro em Ver não abre; sem as comissões no plano, o Financeiro em Gerenciar também não', () => {
    expect(abreAEquipe(com({ financial: 'VIEW' }), true)).toBe(false)
    expect(abreAEquipe(com({ financial: 'MANAGE' }), false)).toBe(false)
    expect(abreAEquipe(com({}), true)).toBe(false)
  })
})

describe('D5: o menu leva à Equipe quem muda a comissão', () => {
  for (const [menu, href] of [[ADMIN_MENU, '/admin/team'], [BRANCH_MENU, '/team']] as const) {
    it(`o Financeiro em Gerenciar vê "Equipe" (${href}), com as comissões no plano`, () => {
      const equipe = menuEntriesFor(menu, com({ financial: 'MANAGE' }), COM_COMISSOES).filter(e => e.key === 'team')
      expect(equipe.map(e => [e.label, e.href])).toEqual([['Equipe', href]])
    })
    it(`sem as comissões no plano, ou com o Financeiro só em Ver, não (${href})`, () => {
      expect(menuEntriesFor(menu, com({ financial: 'MANAGE' }), SEM_COMISSOES).map(e => e.key)).not.toContain('team')
      expect(menuEntriesFor(menu, com({ financial: 'VIEW' }), COM_COMISSOES).map(e => e.key)).not.toContain('team')
    })
    it(`quem tem a Equipe e o Financeiro vê UMA entrada (${href})`, () => {
      const equipe = menuEntriesFor(menu, com({ team: 'VIEW', financial: 'MANAGE' }), COM_COMISSOES).filter(e => e.key === 'team')
      expect(equipe).toHaveLength(1)
    })
  }
})

describe('D5: as duas páginas da Equipe abrem pela mesma regra', () => {
  for (const pagina of ['app/admin/team/page.tsx', 'app/[slug]/team/page.tsx']) {
    it(pagina, () => {
      const f = fonte(pagina)
      expect(f).toMatch(/if \(!abreAEquipe\(ctx\.permissions, temRecurso\(ctx, 'comissoes'\)\)\) assertPermission\(ctx, 'team', 'VIEW'\)/)
    })
  }
})
