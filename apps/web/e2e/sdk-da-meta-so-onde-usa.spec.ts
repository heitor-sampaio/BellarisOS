import { test, expect, type Page } from '@playwright/test'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * O SDK da Meta (connect.facebook.net) só carrega na tela que o USA: o
 * "Conectar pela Meta" do WhatsApp oficial (o cadastro incorporado).
 *
 * Até 2026-10-22 ele vinha no layout raiz, com `FB.AppEvents.logPageView()`:
 * toda página da clínica — o login, o cadastro, o portal da cliente e o link
 * público da ficha de pré-atendimento, que leva o token no endereço — avisava
 * a Meta da visita, com os cookies dela. O CSP da clínica acusava
 * (`connect-src bloquearia https://connect.facebook.net em /register`, em
 * /login, /pre-atendimento/…): no dia em que bloquear, o aviso some; o envio
 * à Meta das telas que nada têm com ela é que não deveria existir.
 */

const marca = Date.now().toString(36)
const DA_META = /(^|\.)(facebook\.(com|net)|fbcdn\.net)$/

/** Os hosts da Meta que a página pediu, do carregamento até o ócio. */
async function pedidosAMeta(page: Page, caminho: string): Promise<string[]> {
  const hosts: string[] = []
  page.on('request', r => {
    try { const h = new URL(r.url()).hostname; if (DA_META.test(h)) hosts.push(h) } catch { /* data:, blob: */ }
  })
  await page.goto(caminho)
  await page.waitForLoadState('networkidle')
  // O SDK vinha com `lazyOnload`: carrega quando o navegador fica ocioso.
  await page.waitForTimeout(2_000)
  return hosts
}

test.describe('sem sessão', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  for (const caminho of ['/login', '/register', '/privacidade']) {
    test(`${caminho} não fala com a Meta`, async ({ page }) => {
      expect(await pedidosAMeta(page, caminho)).toEqual([])
      expect(await page.locator('script[src*="connect.facebook.net"]').count()).toBe(0)
      expect(await page.evaluate(() => typeof (window as { fbAsyncInit?: unknown }).fbAsyncInit)).toBe('undefined')
    })
  }
})

test.describe.serial('com sessão', () => {
  let outra: OutraRede | null = null
  let membro: MembroDeTeste | null = null

  test.beforeAll(async () => {
    test.setTimeout(240_000)
    outra = await criarOutraRede(`sdk${marca}`)
    membro = await criarMembro(`sdkcfg${marca}`, {
      tenant: outra.tenantId, rotulo: 'Config',
      permissoes: [{ modulo: 'settings', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'MANAGE' }],
    })
  })

  test.afterAll(async () => {
    if (membro) await membro.limpar()
    if (outra) await outra.limpar()
  })

  test('a tela de clientes não fala com a Meta', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: membro!.estado })
    try {
      expect(await pedidosAMeta(await ctx.newPage(), '/admin/clients')).toEqual([])
    } finally { await ctx.close() }
  })

  test('"Conectar pela Meta" carrega o SDK — e só sem contar a visita', async ({ browser }) => {
    test.skip(!process.env.META_ES_CONFIG_ID, 'o botão só aparece com META_ES_CONFIG_ID (o .env.local tem; o CI não)')
    const ctx = await browser.newContext({ storageState: membro!.estado })
    try {
      const page = await ctx.newPage()
      await page.goto('/admin/settings?tab=integrations')
      await page.waitForLoadState('networkidle')
      const cartao = page.locator('#whatsapp')
      if (await cartao.count()) await cartao.first().click()
      await page.getByRole('button', { name: /WhatsApp Oficial/ }).first().click()
      await expect(page.getByRole('button', { name: 'Conectar pela Meta' })).toBeVisible()
      await expect(page.locator('script[src*="connect.facebook.net"]')).toHaveCount(1)
      // A inicialização vem com o botão, e sem contar a visita (`logPageView`).
      const init = await page.evaluate(() => String((window as { fbAsyncInit?: unknown }).fbAsyncInit ?? ''))
      expect(init).not.toBe('')
      expect(init).not.toContain('logPageView')
    } finally { await ctx.close() }
  })
})
