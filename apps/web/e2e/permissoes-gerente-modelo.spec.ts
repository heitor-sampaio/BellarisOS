import { test, expect } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * D15 da 6ª simulação (2026-11-04): a H7 deu à gerente de unidade fixa a aba
 * Unidade de Configurações (os dados, o horário e as salas dela) — mas o cargo
 * modelo "Gerente" nascia SEM o módulo Configurações, e a Carol só via "Tags e
 * importações" até a Helô liberar. O padrão sensato (princípio 1) é o que a H7
 * descreve: o Gerente nasce com Configurações em Gerenciar, e a H7 já recusa o
 * que é da clínica toda. As redes que já existiam não mudam sozinhas
 * (princípio 6): vale para a rede NOVA.
 */

const marca = Date.now().toString(36)
let rede: OutraRede | null = null
let gerente: MembroDeTeste | null = null
let slug = ''
test.describe.configure({ timeout: 180_000 })

test.beforeAll(async () => {
  test.setTimeout(240_000)
  rede = await criarOutraRede(`pgm${marca}`)
  const db = banco()
  expect((await db.from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  slug = (await db.from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  gerente = await criarMembro(`pgmg${marca}`, { tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Gerente modelo', cargoDaRede: 'BRANCH_ADMIN', permissoes: [] })
})

test.afterAll(async () => {
  await gerente?.limpar(); await rede?.limpar()
})

test('o Gerente modelo da rede nova nasce com Configurações em Gerenciar', async () => {
  const { data, error } = await banco().from('role_permissions').select('level, scope')
    .eq('role_id', gerente!.roleId).eq('module', 'settings').maybeSingle<{ level: string; scope: string }>()
  expect(error).toBeNull()
  expect(data, 'a linha de Configurações do Gerente modelo').toEqual({ level: 'MANAGE', scope: 'ALL' })
})

test('a gerente de unidade fixa, no cargo modelo, abre a aba Unidade e não a configuração da clínica toda', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: gerente!.estado })
  try {
    const p = await ctx.newPage()
    await p.goto(`/${slug}/settings?tab=unidade`)
    await expect(p.getByRole('heading', { name: 'Salas' })).toBeVisible()
    // O que é da clínica toda continua da rede (H7).
    await p.goto(`/${slug}/settings?tab=tags`)
    await expect(p.getByText('Esta configuração é da clínica toda').first()).toBeVisible()
  } finally { await ctx.close() }
})
