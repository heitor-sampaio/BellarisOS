import { test, expect, type Page, type Browser } from '@playwright/test'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'

/**
 * J-21 (2026-10-30): no público da campanha, o Esc não fechava o seletor de
 * tags, e o fundo invisível que fecha o painel engolia o clique no "Próximo"
 * (o primeiro clique só fechava o painel). O seletor é o `PickerCompacto`,
 * o mesmo de toda barra de filtros.
 *
 * Rede `[e2e]` própria, membro com Marketing em Gerenciar.
 */

const marca = Date.now().toString(36)
let f: { outra: OutraRede; membro: MembroDeTeste } | null = null

test.beforeAll(async () => {
  const outra = await criarOutraRede(`cst${marca}`)
  f = {
    outra,
    membro: await criarMembro(`cst${marca}`, {
      tenant: outra.tenantId, rotulo: 'Marketing',
      permissoes: [{ modulo: 'marketing', nivel: 'MANAGE' }],
    }),
  }
})
test.afterAll(async () => {
  if (!f) return
  await f.membro.limpar()
  await f.outra.limpar()
})

async function comoMembro(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: f!.membro.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test('o Esc fecha o seletor de tags, e com ele aberto o "Próximo" avança no primeiro clique', async ({ browser }) => {
  await comoMembro(browser, async page => {
    await page.goto('/admin/notificacoes/nova')
    await page.getByRole('button', { name: 'Próximo' }).click()
    await page.getByPlaceholder('ex: Aniversariantes de julho').fill(`[e2e] campanha ${marca}`)
    await page.getByPlaceholder(/Feliz aniversário/).fill('Oi, {{first_name}}')
    await page.getByPlaceholder(/Como presente/).fill('Texto da campanha.')
    await page.getByRole('button', { name: 'Próximo' }).click()
    await expect(page.getByTestId('alcance-da-campanha')).toBeVisible()

    const painel = page.locator('[data-painel-picker]')
    await page.getByRole('button', { name: 'Adicionar tag' }).click()
    await expect(painel).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(painel, 'o Esc fecha o painel').toHaveCount(0)
    await expect(page.getByTestId('alcance-da-campanha'), 'e só ele: a tela continua no público').toBeVisible()

    await page.getByRole('button', { name: 'Adicionar tag' }).click()
    await expect(painel).toBeVisible()
    await page.getByRole('button', { name: 'Próximo' }).click()
    await expect(painel).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Revisar campanha' }), 'o primeiro clique já avança à revisão').toBeVisible()
  })
})
