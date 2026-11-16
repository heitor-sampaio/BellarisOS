import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import * as utils from '@estetica-os/utils'
import { AVISOS_DA_URL } from '@/lib/aviso-da-url'
import { motivoDaAbaFechada } from '@/lib/configuracoes/abas'
import { avisoDaAbaFechada } from '@/lib/clients/aba-fechada'
import {
  ALL_MODULES, MODULE_LEVELS, MODULOS_DO_CARGO, MODULOS_SO_DA_ADMIN, resolvePermissions,
} from '@/lib/permissions'
import { MODULE_GROUPS } from '@/lib/permissions-copy'
import { NO_PERMISSIONS, ALL_PERMISSIONS, ALL_SCOPES } from '@/lib/permissions'
import { podeVerAuditoria, assertAuditoria } from '@/lib/auth'
import type { TenantContext } from '@estetica-os/types'

/**
 * Três decisões do Heitor de 2026-11-16, em resposta direta:
 *  A. "A rede nova nasce com 8 tags; tiro e deixo o catálogo começar vazio?" — "Sim".
 *  B. O aviso "Você não tem acesso a essa unidade. Abrimos a sua." parecia
 *     dizer que o sistema CRIA uma unidade para quem não tem. Nada é criado.
 *  C. "Auditoria é só admin": o módulo `audit` é só do cargo de sistema
 *     Admin da rede; não se dá a outro cargo.
 */

const WEB = join(__dirname, '..')
const MONO = join(WEB, '..', '..')
const ler = (caminho: string) => readFileSync(join(WEB, caminho), 'utf8')
const MIGRATIONS = join(MONO, 'supabase', 'migrations')

describe('A. a rede nova nasce sem tag nenhuma', () => {
  it('a última migration que toca a semente das tags a desliga (o gatilho e a função saem)', () => {
    const ultimas = readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort()
      .filter(f => /trg_rede_ganha_tags|tags_padrao/.test(readFileSync(join(MIGRATIONS, f), 'utf8')))
    const ultima = readFileSync(join(MIGRATIONS, ultimas.at(-1)!), 'utf8')
    expect(ultima).toMatch(/drop trigger if exists trg_rede_ganha_tags on public\.tenants/)
    expect(ultima).toMatch(/drop function if exists private\.tags_padrao\(\)/)
  })
  it('não sobra lista fixa de tags no código (CLIENT_TAGS saiu de @estetica-os/utils)', () => {
    expect('CLIENT_TAGS' in utils).toBe(false)
  })
})

describe('B. o aviso de quem abriu uma unidade fora do alcance não sugere criação', () => {
  it('nenhum aviso de redirecionamento diz "abrimos"', () => {
    for (const texto of Object.values(AVISOS_DA_URL)) expect(texto.toLowerCase()).not.toContain('abrimos')
  })
  it('os avisos de aba também não dizem "abrimos" (a mesma leitura de criação): dizem onde a pessoa está', () => {
    const motivo = motivoDaAbaFechada('comissoes', {
      noPortal: ['unidade'] as never, gerencia: () => true, noPlano: () => true, unidadeFixa: false,
      nomeDoModulo: m => m, abriu: 'Unidade',
    })
    expect(motivo).toBe('A aba Comissões e taxas fica nas Configurações da rede. Você está na aba Unidade.')
    expect(motivoDaAbaFechada('nao-existe', { noPortal: [] as never, gerencia: () => true, noPlano: () => true, unidadeFixa: false, nomeDoModulo: m => m, abriu: 'Unidade' }))
      .toBe('A aba “nao-existe” não existe. Você está na aba Unidade.')
    expect(avisoDaAbaFechada({ key: 'financeiro', label: 'Financeiro' }, true)).toBe('Suas permissões não abrem a aba Financeiro desta ficha. Você está na Visão geral.')
    expect(avisoDaAbaFechada({ key: 'fichas', label: 'Prontuário' }, true).toLowerCase()).not.toContain('abrimos')
  })
  it('os três avisos dizem onde a pessoa está', () => {
    expect(AVISOS_DA_URL['outra-unidade']).toBe('Essa unidade não está entre as suas. Você está na sua unidade.')
    expect(AVISOS_DA_URL['portal-da-rede']).toBe('O portal da rede é de quem tem “A rede inteira”. Você está na sua unidade.')
    expect(AVISOS_DA_URL['setup-da-rede']).toBe('A configuração inicial da rede é de quem tem “A rede inteira”. Você está na sua unidade.')
  })
})

describe('C. a Auditoria é só da Admin da rede', () => {
  it('a Auditoria não é módulo de cargo: fora da matriz e dos grupos da tela de Cargos', () => {
    expect(MODULOS_SO_DA_ADMIN).toEqual(['audit'])
    expect(MODULOS_DO_CARGO).not.toContain('audit')
    expect(MODULOS_DO_CARGO).toHaveLength(ALL_MODULES.length - 1)
    expect(MODULE_GROUPS.flatMap(g => [...g.modules])).not.toContain('audit')
    // Atribuível só "Sem acesso": o Ver que a tela gravasse num cargo não vale.
    expect(MODULE_LEVELS.audit).toEqual(['NONE'])
  })
  it('a linha `audit` gravada num cargo não dá nada; a Admin da rede (tudo) a tem', () => {
    expect(resolvePermissions([{ module: 'audit', level: 'VIEW' }]).audit).toBe('NONE')
    expect(resolvePermissions([{ module: 'audit', level: 'MANAGE' }]).audit).toBe('NONE')
    expect(resolvePermissions([], { allAccess: true }).audit).toBe('MANAGE')
  })
  it('só a Admin da rede (o cargo de sistema, `isNetworkAdmin`) lê a Auditoria — nem com a linha no contexto', () => {
    const base = {
      userId: 'a1', internalUserId: 'u1', userName: 'F', roleLabel: 'C', tenantId: 't1', branchId: null, role: 'BRANCH_ADMIN',
      roleId: 'r1', clientId: null, scopes: { ...ALL_SCOPES }, reportTabs: [], providesServices: false, isClient: false,
    } as unknown as TenantContext
    const outroCargo = { ...base, isNetworkAdmin: false, permissions: { ...NO_PERMISSIONS, audit: 'VIEW' } } as TenantContext
    const admin = { ...base, isNetworkAdmin: true, permissions: { ...ALL_PERMISSIONS } } as TenantContext
    expect(podeVerAuditoria(outroCargo)).toBe(false)
    expect(() => assertAuditoria(outroCargo)).toThrow()
    expect(podeVerAuditoria(admin)).toBe(true)
    expect(() => assertAuditoria(admin)).not.toThrow()
  })
  it('a matriz que se salva não leva a Auditoria', () => {
    const acao = ler('actions/permissions.ts')
    expect(acao).toContain('MODULOS_DO_CARGO.map(module =>')
    expect(acao).not.toContain('ALL_MODULES.map(module =>')
  })
  it('a página (rede e unidade) e o CSV recusam quem não é a Admin da rede', () => {
    for (const f of ['app/admin/auditoria/page.tsx', 'app/[slug]/auditoria/page.tsx']) {
      expect(ler(f)).toContain('assertAuditoria(ctx)')
    }
    expect(ler('app/api/auditoria/csv/route.ts')).toContain('podeVerAuditoria(ctx)')
    const auth = ler('lib/auth.ts')
    expect(auth).toMatch(/export function podeVerAuditoria\(ctx: TenantContext\): boolean \{\s*return ctx\.isNetworkAdmin && can\(ctx, 'audit', 'VIEW'\)/)
  })
  it('o filtro que escondia "Abriu o prontuário" de quem tem unidades saiu (a Admin da rede vê tudo)', () => {
    expect(ler('lib/auditoria/leitura.ts')).not.toContain(".neq('operacao', 'abriu')")
    expect(ler('lib/auditoria/tipos.ts')).not.toContain('operacoesDoFiltro')
    expect(ler('app/_shared/auditoria.tsx')).not.toContain('operacoesDoFiltro')
  })
})
