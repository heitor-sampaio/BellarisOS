import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * A47 da 11ª simulação (2026-11-10): `/admin/relatorios` dava 404 — a rota é
 * `/admin/reports`, e o resto do sistema está em português. O endereço em
 * português leva à tela, com o que vinha na URL (o caminho antigo vira um
 * redirect de uma linha, CLAUDE.md §6), nos dois portais.
 */

const marca = Date.now().toString(36)
let rede: OutraRede
let slug = ''
let dona: MembroDeTeste

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: dona.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`rel11${marca}`)
  const b = banco()
  expect((await b.from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  slug = (await b.from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  dona = await criarMembro(`rel11d${marca}`, { tenant: rede.tenantId, donoDaRede: true, rotulo: 'Dona', permissoes: [] })
})

test.afterAll(async () => {
  await dona?.limpar()
  await rede?.limpar()
})

test('A47: /admin/relatorios e /[slug]/relatorios levam aos Relatórios, com a URL', async ({ browser }) => {
  await como(browser, async p => {
    const r = await p.goto('/admin/relatorios?periodo=mes')
    expect(r?.status()).toBeLessThan(400)
    await expect(p).toHaveURL(/\/admin\/reports\?periodo=mes$/)
    const u = await p.goto(`/${slug}/relatorios`)
    expect(u?.status()).toBeLessThan(400)
    await expect(p).toHaveURL(new RegExp(`/${slug}/reports$`))
  })
})
