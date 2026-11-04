import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * A4 da 6ª simulação (2026-11-04): a dona via dois "endereços" — em Geral, o
 * da rede ("/sim-clinica-begonia-cace14", que não abre tela nenhuma); em
 * Unidades, o da unidade ("/begonia-savassi") — e não sabia qual dar à
 * cliente (princípio 3). Agora Geral e Unidades dizem o endereço do APP DA
 * CLIENTE, inteiro (".../begonia-savassi/cliente"), e para que serve; o
 * identificador da rede, que não é endereço de nada, saiu da tela.
 * Numa rede [e2e] própria.
 */

const marca = Date.now().toString(36)
let rede: OutraRede | null = null
let dona: MembroDeTeste | null = null
let slug = ''
let slugDaRede = ''

async function como(browser: Browser, quem: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: quem.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`ea${marca}`)
  const db = banco()
  expect((await db.from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  slug = (await db.from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  slugDaRede = (await db.from('tenants').select('slug').eq('id', rede.tenantId).single<{ slug: string }>()).data!.slug
  dona = await criarMembro(`ead${marca}`, { tenant: rede.tenantId, donoDaRede: true, permissoes: [], rotulo: 'Dona' })
})
test.afterAll(async () => { await dona?.limpar(); await rede?.limpar() })

test('A4: Geral e Unidades dizem o endereço do app da cliente, e o da rede sai da tela', async ({ browser }) => {
  await como(browser, dona!, async p => {
    await p.goto('/admin/settings?tab=general')
    const geral = p.locator('[data-app-da-cliente]')
    await expect(geral).toContainText(`/${slug}/cliente`)
    await expect(geral).toContainText('É o endereço que se dá à cliente')
    await expect(p.getByText(`/${slugDaRede}`, { exact: true })).toHaveCount(0)

    await p.goto('/admin/settings?tab=unidades')
    await expect(p.locator('[data-app-da-cliente-da-unidade]').first()).toContainText(`/${slug}/cliente`)
  })
})
