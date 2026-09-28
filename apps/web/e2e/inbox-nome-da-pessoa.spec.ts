import { test, expect } from '@playwright/test'
import { banco, tenantId, PREFIXO, apagarConversas } from './apoio/banco'

/**
 * O inbox mostra — e procura — o nome da PESSOA, não a cópia da conversa
 * (CLAUDE.md §9.2.1).
 *
 * A conversa guarda uma cópia do nome, e a propagação a mantém igual à
 * pessoa. Este teste separa as duas de propósito: muda o nome direto no
 * contato, com a cópia velha na conversa. Lista, busca e card do contato têm
 * de acompanhar a pessoa — ler a cópia era o estado anterior.
 */
const marca = Date.now().toString(36)
const ANTIGO = `${PREFIXO} Nome antigo ${marca}`
const NOVO   = `${PREFIXO} Nome da pessoa ${marca}`
let convId: string | null = null

test.beforeAll(async () => {
  const db = banco()
  const fone = '5548' + String(Date.now()).slice(-9)
  const { data, error } = await db.from('conversations').insert({
    tenant_id: await tenantId(), channel: 'whatsapp', status: 'open', provider: 'uazapi',
    contact_name: ANTIGO, contact_phone: fone, contact_external_id: fone, contact_aliases: [fone],
    last_message_at: new Date().toISOString(), last_message: 'oi',
  }).select('id, contato_id').single<{ id: string; contato_id: string }>()
  expect(error, 'criar a conversa').toBeNull()
  convId = data!.id
  // Só a pessoa muda: a cópia da conversa fica com o nome antigo.
  const r = await db.from('contacts').update({ name: NOVO }).eq('id', data!.contato_id)
  expect(r.error, 'renomear a pessoa').toBeNull()
  const { data: conv } = await db.from('conversations').select('contact_name').eq('id', convId).single()
  expect(conv?.contact_name, 'a cópia da conversa continua velha').toBe(ANTIGO)
})

test.afterAll(async () => {
  if (convId) await apagarConversas([convId])
})

test('lista, busca e card mostram o nome da pessoa', async ({ page }) => {
  await page.goto('/admin/inbox')
  const linha = page.locator('button.inbox-conversa').filter({ hasText: NOVO })
  await expect(linha).toHaveCount(1)
  await expect(page.locator('button.inbox-conversa').filter({ hasText: ANTIGO })).toHaveCount(0)

  // A busca vai ao banco (inbox_pagina) e acha pelo nome da pessoa.
  await page.getByPlaceholder('Pesquisar…').fill(`Nome da pessoa ${marca}`)
  await expect(page.locator('button.inbox-conversa')).toHaveCount(1, { timeout: 10_000 })

  await linha.click()
  await expect(page.getByText(NOVO).first()).toBeVisible()
})
