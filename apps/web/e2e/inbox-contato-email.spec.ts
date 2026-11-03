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

/**
 * A16 da 5ª simulação (2026-11-01): o "Cadastrar cliente" do inbox vinha só
 * com nome e telefone, sem o e-mail do lead (a oportunidade tem a cópia dela,
 * `leads.email`); e o painel do contato mostrava o telefone cru
 * ("51994000050"). O J-19 tinha tratado só o modal do lead.
 */
test('A16: o cadastro pelo inbox traz o e-mail do lead, e o telefone do contato aparece formatado', async ({ page }) => {
  const db = banco()
  const tenant = await tenantId()
  const fone = '51' + '99' + String(Date.now()).slice(-7)
  const { data: conv, error } = await db.from('conversations').insert({
    tenant_id: tenant, channel: 'whatsapp', status: 'open', provider: 'uazapi',
    contact_name: `${NOME} A16`, contact_phone: fone, contact_external_id: fone, contact_aliases: [fone],
    last_message_at: new Date().toISOString(), last_message: 'oi',
  }).select('id, contato_id').single<{ id: string; contato_id: string }>()
  expect(error, 'criar a conversa').toBeNull()
  let leadId: string | null = null
  try {
    const { data: etapa } = await db.from('crm_stages').select('id, crm_funnels!inner(archived_at)')
      .eq('tenant_id', tenant).or('outcome.is.null,outcome.eq.OPEN').is('crm_funnels.archived_at', null)
      .limit(1).single<{ id: string }>()
    const { data: lead, error: eL } = await db.from('leads').insert({
      tenant_id: tenant, name: `${NOME} A16`, phone: fone, email: `lead-a16-${marca}@exemplo.com`,
      crm_stage_id: etapa!.id, contato_id: conv!.contato_id,
    }).select('id').single<{ id: string }>()
    expect(eL, 'criar o lead').toBeNull()
    leadId = lead!.id

    await page.goto(`/admin/inbox?c=${conv!.id}`)
    const telefone = page.getByPlaceholder('Telefone', { exact: true })
    await expect(telefone).toHaveValue(`(51) ${fone.slice(2, 7)}-${fone.slice(7)}`, { timeout: 15_000 })
    await page.getByRole('button', { name: 'Cadastrar cliente' }).first().click()
    await expect(page.locator('dialog input[name="email"]')).toHaveValue(`lead-a16-${marca}@exemplo.com`)
    // Mostrar formatado não regrava o número da pessoa.
    expect((await db.from('contacts').select('phone').eq('id', conv!.contato_id).single<{ phone: string | null }>()).data!.phone).toBe(fone)
  } finally {
    if (leadId) await db.from('lead_events').delete().eq('lead_id', leadId)
    if (leadId) await db.from('leads').delete().eq('id', leadId)
    await apagarConversas([conv!.id])
  }
})
