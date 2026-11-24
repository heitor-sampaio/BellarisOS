import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * A57 da 5ª simulação: os Relatórios ignoravam `?unidade=` e só liam
 * `?branch=<uuid>`. O J-54 (6f42d768) levou o drill-down `?unidade=<id|slug>`
 * ao dashboard e a Clientes; agora os Relatórios também o aceitam (o id ou o
 * endereço da unidade), com `?branch=` como apelido, e o seletor grava
 * `?unidade=`.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let gestor: MembroDeTeste | null = null
let segunda = { id: '', slug: '', name: '' }
let primeira = { id: '', slug: '', name: '' }

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: gestor!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`ru${marca}`)
  primeira = (await db().from('branches').select('id, slug, name').eq('id', rede.branchId).single<typeof primeira>()).data!
  const { data, error } = await db().from('branches')
    .insert({ tenant_id: rede.tenantId, name: `[e2e] Zona Sul ${marca}`, slug: `e2e-zs-${marca}` })
    .select('id, slug, name').single<typeof segunda>()
  expect(error).toBeNull()
  segunda = data!
  gestor = await criarMembro(`rug${marca}`, {
    tenant: rede.tenantId, rotulo: 'Gestora',
    permissoes: [{ modulo: 'financial', nivel: 'VIEW' }, { modulo: 'reports', nivel: 'VIEW' }],
  })
  expect((await db().from('role_report_tabs').insert({ tenant_id: rede.tenantId, role_id: gestor.roleId, tab: 'overview' })).error).toBeNull()
})
test.afterAll(async () => {
  await gestor?.limpar()
  await db().from('branches').delete().eq('id', segunda.id)
  await rede?.limpar()
})

test('os Relatórios recortam a unidade do ?unidade= (endereço ou id), e ?branch= continua valendo', async ({ browser }) => {
  await como(browser, async p => {
    await p.goto(`/admin/reports?period=month&unidade=${segunda.slug}`)
    await expect(p.getByText(`✦ ${segunda.name}`)).toBeVisible()

    await p.goto(`/admin/reports?period=month&unidade=${primeira.id}`)
    await expect(p.getByText(`✦ ${primeira.name}`)).toBeVisible()

    await p.goto(`/admin/reports?period=month&branch=${segunda.id}`)
    await expect(p.getByText(`✦ ${segunda.name}`)).toBeVisible()

    // O seletor grava ?unidade=.
    await p.goto('/admin/reports?period=month')
    await expect(p.getByText('✦ Rede')).toBeVisible()
    await p.getByRole('combobox').filter({ hasText: 'Rede inteira' }).selectOption(primeira.id)
    await expect(p).toHaveURL(new RegExp(`unidade=${primeira.slug}`))
    await expect(p).not.toHaveURL(/branch=/)
    await expect(p.getByText(`✦ ${primeira.name}`)).toBeVisible()
  })
})

// ?tab= de uma aba que o cargo não abre (ou que não existe) não mostra outra calada: leva à
// primeira aba da permissão, com a URL dela e o aviso que diz por quê (princípio 3). Numa
// rede [e2e] própria.
test.describe('a aba de Relatórios fora da permissão leva à primeira dela, com a URL certa e o aviso (indicadores.md)', () => {
  let rede: OutraRede | null = null
  let membro: MembroDeTeste | null = null

  async function como<T>(browser: Browser, estado: string, fn: (p: Page) => Promise<T>) {
    const ctx = await browser.newContext({ storageState: estado, viewport: { width: 1440, height: 900 } })
    try { return await fn(await ctx.newPage()) } finally { await ctx.close() }
  }

  test.beforeAll(async () => {
    test.setTimeout(180_000)
    rede = await criarOutraRede(`rab${marca}`)
    expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
    membro = await criarMembro(`rabm${marca}`, {
      tenant: rede.tenantId, rotulo: 'Vendas e agenda',
      permissoes: [{ modulo: 'reports', nivel: 'VIEW' }, { modulo: 'financial', nivel: 'VIEW' }],
    })
    expect((await db().from('role_report_tabs').insert(['vendas', 'agenda'].map(tab => ({
      tenant_id: rede!.tenantId, role_id: membro!.roleId, tab,
    })))).error).toBeNull()
  })

  test.afterAll(async () => {
    await membro?.limpar()
    await rede?.limpar()
  })

  test('a aba fora da permissão leva à primeira dela, com a URL certa e o aviso', async ({ browser }) => {
    await como(browser, membro!.estado, async p => {
      await p.goto('/admin/reports?tab=financeiro&period=7d')
      await expect(p).toHaveURL(/tab=vendas/)
      await expect(p).toHaveURL(/period=7d/)
      await expect(p.getByText('Essa aba de Relatórios não está na sua permissão. Você está na primeira que ela abre.')).toBeVisible()
      await expect(p).not.toHaveURL(/aviso=/)
      await expect(p).not.toHaveURL(/tab=financeiro/)

      await p.goto('/admin/reports?tab=nao-existe')
      await expect(p).toHaveURL(/tab=vendas/)
      await expect(p.getByText('Essa aba de Relatórios não existe. Você está na primeira que a sua permissão abre.')).toBeVisible()

      // A aba da permissão abre sem aviso.
      await p.goto('/admin/reports?tab=agenda')
      await expect(p).toHaveURL(/tab=agenda/)
      await expect(p.getByText(/Essa aba de Relatórios/)).toHaveCount(0)
    })
  })
})
