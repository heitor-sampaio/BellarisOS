import { test, expect } from '@playwright/test'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { banco } from './apoio/banco'

/**
 * "Conectar pela Meta" que falha NO MEIO diz o que aconteceu (F7c, achado do
 * Heitor em 2026-11-02, 22:10).
 *
 * A action de concluir o cadastro incorporado deu "Failed to find Server
 * Action": a página era de um deploy anterior (os ids das actions mudam a cada
 * build). O erro escapava do `concluir` sem tratamento, o script do layout
 * (`staleActionGuard`) recarregava a página em silêncio, e ela voltava como
 * antes — com o número ANTIGO na lista, conectado. O Heitor achou que tinha
 * conectado. Agora a tela diz que a página ficou desatualizada, que nada foi
 * gravado nem inscrito, e oferece recarregar.
 *
 * A janela da Meta não se abre no teste: o SDK (`connect.facebook.net`) é
 * trocado por um falso que devolve a conta, o número e o código como a Meta
 * devolve; e o pedido da action recebe a resposta que o servidor dá a um id
 * desconhecido (404 com `x-nextjs-action-not-found: 1`).
 */

const marca = Date.now().toString(36)
let outra: OutraRede | null = null
let membro: MembroDeTeste | null = null

/** O SDK falso: `FB.login` manda o WA_EMBEDDED_SIGNUP (de facebook.com) e devolve o código. */
const SDK_FALSO = `
window.FB = {
  init: function () {},
  login: function (cb) {
    window.dispatchEvent(new MessageEvent('message', {
      origin: 'https://www.facebook.com',
      data: JSON.stringify({ type: 'WA_EMBEDDED_SIGNUP', event: 'FINISH', data: { waba_id: '9${marca.length}0001', phone_number_id: '8${marca.length}0001' } }),
    }));
    setTimeout(function () { cb({ authResponse: { code: 'codigo-falso-${marca}' } }) }, 50);
  },
};
if (window.fbAsyncInit) window.fbAsyncInit();
`

test.beforeAll(async () => {
  test.setTimeout(240_000)
  outra = await criarOutraRede(`mf${marca}`)
  membro = await criarMembro(`mfcfg${marca}`, {
    tenant: outra.tenantId, rotulo: 'Config',
    permissoes: [{ modulo: 'settings', nivel: 'MANAGE' }],
  })
})

test.afterAll(async () => {
  await membro?.limpar()
  await outra?.limpar()
})

test('a página de um deploy anterior: a conexão diz que nada foi gravado e oferece recarregar, sem recarregar sozinha', async ({ browser }) => {
  test.skip(!process.env.META_ES_CONFIG_ID, 'o botão só aparece com META_ES_CONFIG_ID (o .env.local tem; o CI não)')
  const ctx = await browser.newContext({ storageState: membro!.estado })
  try {
    const page = await ctx.newPage()
    await page.route('**/connect.facebook.net/**', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: SDK_FALSO }))
    let pedidas = 0
    await page.route('**/admin/settings**', async route => {
      const r = route.request()
      if (r.method() === 'POST' && r.headers()['next-action'] && (r.postData() ?? '').includes(`codigo-falso-${marca}`)) {
        pedidas++
        return route.fulfill({
          status: 404, contentType: 'text/plain', body: 'Server action not found.',
          headers: { 'x-nextjs-action-not-found': '1' },
        })
      }
      return route.fallback()
    })

    await page.goto('/admin/settings?tab=integrations')
    await page.waitForLoadState('networkidle')
    const cartao = page.locator('#whatsapp')
    if (await cartao.count()) await cartao.first().click()
    await page.getByRole('button', { name: /WhatsApp Oficial/ }).first().click()

    let recarregou = false
    page.on('load', () => { recarregou = true })
    await page.getByRole('button', { name: 'Conectar pela Meta' }).click()

    const alerta = page.getByRole('alert').filter({ hasText: 'desatualizada' })
    await expect(alerta).toBeVisible()
    await expect(alerta).toContainText('O número não foi conectado')
    await expect(alerta).toContainText('nada foi gravado')
    await expect(page.getByRole('button', { name: 'Recarregar a página' })).toBeVisible()
    expect(pedidas, 'a action do build velho foi chamada').toBe(1)
    expect(recarregou, 'a página não recarregou sozinha (o aviso sumiria)').toBe(false)
  } finally { await ctx.close() }

  const { count } = await banco().from('whatsapp_numbers').select('id', { count: 'exact', head: true }).eq('tenant_id', outra!.tenantId)
  expect(count, 'nada foi gravado').toBe(0)
})
