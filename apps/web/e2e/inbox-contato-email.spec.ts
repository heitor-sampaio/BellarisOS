import { test, expect } from '@playwright/test'
import { banco, tenantId, PREFIXO, apagarConversas } from './apoio/banco'

/**
 * E-mail e rede social são da PESSOA (`contacts`, 2026-10-13): o importador os
 * grava nela mesmo sem oportunidade, e o painel do inbox os mostra e edita na
 * seção do contato — como o nome, o telefone e as tags.
 */
const marca = Date.now().toString(36)
const NOME = `${PREFIXO} Pessoa com e-mail ${marca}`
let convId: string | null = null
let contatoId: string

test.beforeAll(async () => {
  const db = banco()
  const fone = '5548' + String(Date.now()).slice(-9)
  const { data, error } = await db.from('conversations').insert({
    tenant_id: await tenantId(), channel: 'whatsapp', status: 'open', provider: 'uazapi',
    contact_name: NOME, contact_phone: fone, contact_external_id: fone, contact_aliases: [fone],
    last_message_at: new Date().toISOString(), last_message: 'oi',
  }).select('id, contato_id').single<{ id: string; contato_id: string }>()
  expect(error, 'criar a conversa').toBeNull()
  convId = data!.id
  contatoId = data!.contato_id
  const r = await db.from('contacts').update({ email: 'antes@exemplo.com', social_media: '@antes' }).eq('id', contatoId)
  expect(r.error, 'dar e-mail à pessoa').toBeNull()
})

test.afterAll(async () => {
  if (convId) await apagarConversas([convId])
})

test('o painel do contato mostra e edita o e-mail e a rede social da pessoa', async ({ page }) => {
  await page.goto(`/admin/inbox?c=${convId}`)
  const email = page.getByLabel('E-mail do contato')
  const social = page.getByLabel('Rede social do contato')
  await expect(email).toHaveValue('antes@exemplo.com', { timeout: 15_000 })
  await expect(social).toHaveValue('@antes')

  await email.fill('Depois@Exemplo.com')
  await social.fill('instagram.com/depois')
  await expect(page.getByText('salvo', { exact: true })).toBeVisible({ timeout: 10_000 })
  await expect.poll(async () => (await banco().from('contacts').select('email, social_media').eq('id', contatoId).single()).data)
    .toEqual({ email: 'depois@exemplo.com', social_media: 'instagram.com/depois' })
})
