import { test, expect, type Page, type Browser } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'

/**
 * D-3 (decisão do Heitor, 2026-10-29): "A campanha de hoje é aviso no celular
 * (push). A tela passa a dizer isso claramente. O WhatsApp fica para o futuro."
 *
 * A campanha só alcança no celular quem tem o app (ou os avisos do navegador
 * ligados), e a tela não dizia que nada ia pelo WhatsApp. Aqui: duas clientes
 * no público, uma com aparelho — a tela diz o canal e quantas vão receber.
 *
 * Rede `[e2e]` própria, membro com Marketing em Gerenciar.
 */

const marca = Date.now().toString(36)
let f: { outra: OutraRede; membro: MembroDeTeste; comApp: string; semApp: string } | null = null

test.beforeAll(async () => {
  const outra = await criarOutraRede(`cam${marca}`)
  const comApp = await outra.criarCliente('Com app')
  const semApp = await outra.criarCliente('Sem app')
  const { error } = await banco().from('push_tokens')
    .insert({ client_id: comApp, token: `e2e-token-${marca}`, platform: 'android' })
  expect(error, 'o aparelho da cliente com app').toBeNull()
  f = {
    outra, comApp, semApp,
    membro: await criarMembro(`cam${marca}`, {
      tenant: outra.tenantId, rotulo: 'Marketing',
      permissoes: [{ modulo: 'marketing', nivel: 'MANAGE' }],
    }),
  }
})

test.afterAll(async () => {
  if (!f) return
  const { error } = await banco().from('push_tokens').delete().eq('token', `e2e-token-${marca}`)
  expect(error).toBeNull()
  await f.membro.limpar()
  await f.outra.limpar()
})

async function comoMembro(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: f!.membro.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test('a campanha diz que é aviso no celular, não WhatsApp, e quantas clientes vão receber', async ({ browser }) => {
  await comoMembro(browser, async page => {
    // A lista já diz o canal.
    await page.goto('/admin/notificacoes')
    await expect(page.getByText('Aviso no celular', { exact: false }).first()).toBeVisible()
    await expect(page.getByText(/não vai pelo WhatsApp/i).first()).toBeVisible()

    await page.goto('/admin/notificacoes/nova')
    // Logo no começo da criação, antes de escrever qualquer coisa.
    await expect(page.getByText(/não vai pelo WhatsApp/i)).toBeVisible()

    await page.getByRole('button', { name: 'Próximo' }).click()
    await page.getByPlaceholder('ex: Aniversariantes de julho').fill(`[e2e] campanha ${marca}`)
    await page.getByPlaceholder(/Feliz aniversário/).fill('Oi, {{first_name}}')
    await page.getByPlaceholder(/Como presente/).fill('Texto da campanha.')
    await page.getByRole('button', { name: 'Próximo' }).click()

    // No público: as duas clientes, e só uma com o app — é ela que recebe.
    const alcance = page.getByTestId('alcance-da-campanha')
    await expect(alcance).toContainText('2 clientes no público')
    await expect(alcance).toContainText('1 vai receber o aviso no celular')

    await page.getByRole('button', { name: 'Próximo' }).click()
    await expect(page.getByText('Aviso no celular (push)')).toBeVisible()
    await expect(page.getByTestId('alcance-da-campanha')).toContainText('1 vai receber o aviso no celular')
  })
})
