import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * A26 e A27 da 14ª simulação (F75) — o recorte dito na tela (princípio 3):
 * - A26: o "Novos" do ranking de unidades somava mais que o cartão "Novos
 *   clientes". Regra mudada na 24ª (o Heitor, 18/11): "Novos clientes" só
 *   existe na rede — o ranking não tem mais a coluna, nem a dica dela.
 * - A27: o fechamento das comissões é por unidade — quem atende em duas tem
 *   dois fechamentos, cada um uma despesa no financeiro da unidade. A tela de
 *   Comissões diz isso quando a rede tem mais de uma unidade.
 *
 * Numa rede [e2e] própria, com uma segunda unidade.
 */

test.describe.configure({ mode: 'serial' })

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede
let dona: MembroDeTeste

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: dona.estado, viewport: { width: 1440, height: 900 } })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  test.setTimeout(150_000)
  rede = await criarOutraRede(`f75r${marca}`)
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  expect((await db().from('branches').insert({ tenant_id: rede.tenantId, name: `${PREFIXO} Segunda ${marca}`, slug: `e2e-f75r-${marca}` })).error).toBeNull()
  dona = await criarMembro(`f75rd${marca}`, { tenant: rede.tenantId, donoDaRede: true, rotulo: 'Dona', permissoes: [] })
})

test.afterAll(async () => {
  await dona?.limpar()
  await rede?.limpar()
})

test('A26 (24ª): o ranking de unidades não tem "Novos" — novos clientes só na rede', async ({ browser }) => {
  test.setTimeout(120_000)
  await como(browser, async p => {
    await p.goto('/admin/dashboard')
    await expect(p.getByText('Ranking de unidades')).toBeVisible({ timeout: 30_000 })
    await expect(p.getByRole('button', { name: 'Como os novos de cada unidade são contados' })).toHaveCount(0)
    await expect(p.locator('[data-recorte-do-ranking]')).toHaveCount(0)
    await expect(p.getByRole('columnheader', { name: 'Novos', exact: true })).toHaveCount(0)
  })
})

test('A27: as Comissões dizem que o fechamento é por unidade', async ({ browser }) => {
  test.setTimeout(120_000)
  await como(browser, async p => {
    await p.goto('/admin/financeiro/comissoes')
    // A regra mora na dica do título (2026-11-16).
    await p.getByRole('button', { name: 'Sobre as comissões' }).hover({ timeout: 30_000 })
    await expect(p.locator('[data-fechamento-por-unidade]')).toContainText('O fechamento é por unidade', { timeout: 30_000 })
  })
})
