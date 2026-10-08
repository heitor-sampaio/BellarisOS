import { test, expect } from '@playwright/test'
import { banco, tenantId, PREFIXO, apagarConversas } from './apoio/banco'

/**
 * A clínica não vê o nome do fornecedor da conexão por QR (2026-10-08, pedido
 * do Heitor: "para parecer mais profissional, como nossa solução"). Na tela é
 * "WhatsApp Web"; "uazapi" fica só no código e nos dados gravados.
 *
 * O endereço de webhook que a tela mostra (o da conta própria) também deixa de
 * carregar o nome: `/api/webhooks/whatsapp-web`, que recebe como o antigo — o
 * `/api/webhooks/uazapi` continua no ar, porque as instâncias já criadas
 * apontam para ele.
 */

const marca = Date.now().toString(36)

test('o cartão do WhatsApp não mostra "uazapi" — nem no caminho da conta própria', async ({ page }) => {
  await page.goto('/admin/settings?tab=integrations')
  await page.waitForLoadState('networkidle')
  const cartao = page.locator('#whatsapp')
  if (await cartao.count()) await cartao.first().click()
  const corpo = page.locator('main')

  await expect(corpo.getByText('WhatsApp', { exact: true }).first()).toBeVisible()
  await expect(corpo).not.toContainText(/uazapi/i)

  await page.getByRole('button', { name: 'Adicionar número' }).click()
  await expect(page.getByRole('button', { name: /^WhatsApp Web/ })).toBeVisible()
  await expect(corpo).not.toContainText(/uazapi/i)

  await page.getByRole('button', { name: 'Usar conta própria', exact: true }).click()
  await expect(corpo.getByText('/api/webhooks/whatsapp-web')).toBeVisible()
  await expect(corpo).not.toContainText(/uazapi/i)
})

test('o aviso de templates não fala em "uazapi"', async ({ page }) => {
  await page.goto('/admin/templates')
  await page.waitForLoadState('networkidle')
  await expect(page.locator('main')).not.toContainText(/uazapi/i)
})

test('o webhook novo recebe a mensagem como o antigo', async ({ request }) => {
  const db = banco()
  const tenant = await tenantId()
  const token = `e2e-web-${marca}`
  const telefone = '5548' + String(Date.now()).slice(-9)
  const { data: caixa, error } = await db.from('whatsapp_numbers').insert({
    tenant_id: tenant, provider: 'uazapi', label: `${PREFIXO} Web ${marca}`,
    is_active: true, config: { token, baseUrl: 'http://127.0.0.1:9' },
  }).select('id').single<{ id: string }>()
  expect(error, 'criar a caixa').toBeNull()

  let convId: string | null = null
  try {
    const res = await request.post('/api/webhooks/whatsapp-web', {
      data: {
        token,
        data: {
          chat: { name: `${PREFIXO} Webhook novo ${marca}`, phone: telefone },
          message: {
            sender_pn: telefone, chatid: `${telefone}@s.whatsapp.net`,
            text: 'Oi pelo endereço novo', messageTimestamp: Math.floor(Date.now() / 1000),
            id: `E2EWEB_${marca}`, fromMe: false,
          },
        },
      },
    })
    expect(res.ok()).toBe(true)

    await expect.poll(async () => {
      const { data } = await db.from('conversations')
        .select('id, whatsapp_number_id').eq('tenant_id', tenant).eq('contact_phone', telefone).maybeSingle()
      convId = (data?.id as string) ?? null
      return data?.whatsapp_number_id ?? null
    }, { message: 'a conversa nasce, pela caixa do token' }).toBe(caixa!.id)
  } finally {
    if (convId) await apagarConversas([convId])
    await db.from('whatsapp_numbers').delete().eq('id', caixa!.id)
  }
})
