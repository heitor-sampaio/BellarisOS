import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * A2 da 6ª simulação (2026-11-04): o Estoque de uma clínica nova dizia
 * "Nenhum produto encontrado — Ajuste os filtros", sem filtro nenhum. Sem
 * produto cadastrado, a tela diz isso e oferece o "Novo produto" ali mesmo;
 * "ajuste os filtros" fica para quando a busca é que não achou. Numa rede
 * [e2e] própria, sem produto.
 */

const marca = Date.now().toString(36)
let rede: OutraRede | null = null
let gestora: MembroDeTeste | null = null
let slug = ''

async function como(browser: Browser, quem: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: quem.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`ev${marca}`)
  slug = (await banco().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  gestora = await criarMembro(`evg${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Estoque', permissoes: [{ modulo: 'stock', nivel: 'MANAGE' }],
  })
})
test.afterAll(async () => { await gestora?.limpar(); await rede?.limpar() })

test('A2: sem produto, o estoque diz "Nenhum produto cadastrado" e oferece o "Novo produto"', async ({ browser }) => {
  await como(browser, gestora!, async p => {
    await p.goto(`/${slug}/estoque`)
    const vazio = p.locator('[data-estoque-vazio]')
    await expect(vazio).toContainText('Nenhum produto cadastrado')
    await expect(vazio).not.toContainText('Ajuste os filtros')
    await vazio.getByRole('button', { name: /Novo produto/ }).click()
    await expect(p.locator('dialog[open]')).toBeVisible()
  })
})
