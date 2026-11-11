import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * D11 da 12ª simulação (2026-11-10/11, a Helena da [sim] Clínica Margarida): o
 * Sérum tem mínimo 3 no cadastro e nenhuma linha na unidade
 * (`branch_product_stock`, que só nasce com o primeiro movimento) — a aba
 * "Estoque mínimo" mostrava 0, e salvar dali gravava 0. A herança do cadastro
 * (D2 da 11ª) valia ao criar a linha; a tela de antes dela ficou de fora.
 * Princípio 3: sem a linha, a aba mostra o mínimo do cadastro, e diz de onde ele
 * vem. Numa rede [e2e] própria, de uma unidade.
 */

test.setTimeout(180_000)

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede
let dona: MembroDeTeste
let slug = ''
let serum = ''
let nomeDaUnidade = ''
const nomeSerum = `${PREFIXO} Sérum ${marca}`

async function como(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado, viewport: { width: 1440, height: 900 } })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`es12${marca}`)
  const b = db()
  expect((await b.from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  const un = (await b.from('branches').select('slug, name').eq('id', rede.branchId).single<{ slug: string; name: string }>()).data!
  slug = un.slug; nomeDaUnidade = un.name
  const p = await b.from('products').insert({
    tenant_id: rede.tenantId, name: nomeSerum, unit: 'frasco', min_stock: 3, uso: 'REVENDA', cost_price: 40, sale_price: 90,
  }).select('id').single<{ id: string }>()
  expect(p.error).toBeNull()
  serum = p.data!.id
  dona = await criarMembro(`es12d${marca}`, { tenant: rede.tenantId, donoDaRede: true, rotulo: 'Dona', permissoes: [] })
})

test.afterAll(async () => {
  await dona?.limpar(); await rede?.limpar()
})

test('D11: sem a linha da unidade, o "Estoque mínimo" mostra o mínimo do cadastro — e salvar grava ele', async ({ browser }) => {
  await como(browser, dona, async p => {
    await p.goto(`/${slug}/estoque`)
    await p.getByRole('row').filter({ hasText: nomeSerum }).first().getByTitle('Gerenciar estoque').click()
    const modal = p.locator('dialog[open]').filter({ hasText: 'Gerenciar estoque' })
    await modal.getByRole('button', { name: 'Estoque mínimo' }).click()
    const campo = modal.getByLabel(`Estoque mínimo em ${nomeDaUnidade}`)
    await expect(campo).toHaveValue('3')
    await expect(modal.locator('[data-minimo-do-cadastro]')).toContainText('o mínimo do cadastro do produto')
    await modal.getByRole('button', { name: 'Salvar mínimo' }).click()
    await expect(modal.locator('[data-minimo-salvo]')).toBeVisible()
  })
  const { data } = await db().from('branch_product_stock').select('min_stock').eq('product_id', serum).eq('branch_id', rede.branchId).maybeSingle<{ min_stock: number }>()
  expect(Number(data?.min_stock), 'salvar dali grava o 3, não 0').toBe(3)
})
