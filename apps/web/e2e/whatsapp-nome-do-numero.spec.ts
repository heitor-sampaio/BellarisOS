import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * O número novo nasce com o NOME que a clínica escolhe (pedido do Heitor,
 * 2026-10-09): é o que ela lê depois no inbox, nos templates e nos vínculos.
 * Sem escolha, o nome da conta — nunca o id técnico do número (era o
 * "1372302949310529" que aparecia nos templates).
 *
 * Numa rede `[e2e]` própria; os caminhos aqui são os de credencial colada
 * (WhatsApp Web com conta própria e a API oficial no "avançado"). O cadastro
 * pela Meta e a conexão gerenciada levam o mesmo nome pelo mesmo campo.
 */

test.describe.configure({ mode: 'serial' })

const marca = Date.now().toString(36)
let outra: OutraRede
let membro: MembroDeTeste

test.beforeAll(async () => {
  test.setTimeout(240_000)
  outra = await criarOutraRede(`nome${marca}`)
  membro = await criarMembro(`nome${marca}`, {
    tenant: outra.tenantId, rotulo: 'Config', permissoes: [{ modulo: 'settings', nivel: 'MANAGE' }],
  })
})
test.afterAll(async () => {
  await banco().from('whatsapp_numbers').delete().eq('tenant_id', outra.tenantId)
  await membro?.limpar()
  await outra?.limpar()
})

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: membro.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}
const rotulos = async () => ((await banco().from('whatsapp_numbers')
  .select('label, provider').eq('tenant_id', outra.tenantId).order('created_at')).data ?? []) as { label: string; provider: string }[]

async function novoNumero(p: Page) {
  await p.goto('/admin/settings?tab=integrations')
  await p.waitForLoadState('networkidle')
  const nome = p.getByLabel('Nome do número')
  const adicionar = p.getByRole('button', { name: /Adicionar número/ })
  // O cartão do WhatsApp abre e FECHA no clique: só se clica nele se nada
  // dele estiver à vista (no CI ele já vinha aberto, e o clique o fechava).
  if (!(await nome.isVisible()) && !(await adicionar.isVisible())) await p.locator('#whatsapp').first().click()
  if (await adicionar.isVisible()) await adicionar.click()
  await expect(nome).toBeVisible()
}

test('WhatsApp Web (conta própria): o número nasce com o nome escolhido', async ({ browser }) => {
  await como(browser, async p => {
    await novoNumero(p)
    await p.getByLabel('Nome do número').fill(`${PREFIXO} Recepção ${marca}`)
    await p.getByRole('button', { name: 'Usar conta própria' }).click()
    await p.locator('input[name="token"]').fill('e2e-token')
    await p.locator('input[name="baseUrl"]').fill('https://e2e.invalido')
    await p.getByRole('button', { name: 'Salvar', exact: true }).click()
    await expect.poll(rotulos).toEqual([{ label: `${PREFIXO} Recepção ${marca}`, provider: 'uazapi' }])
  })
})

test('API oficial (credencial colada): o nome escolhido, não o id do número', async ({ browser }) => {
  await como(browser, async p => {
    await novoNumero(p)
    await p.getByLabel('Nome do número').fill(`${PREFIXO} Comercial ${marca}`)
    await p.getByRole('button', { name: /WhatsApp Oficial/ }).first().click()
    const avancado = p.getByText(/credenciais de um app próprio da Meta \(avançado\)/)
    if (await avancado.count()) await avancado.click()
    await p.locator('input[name="wabaId"]').fill('900000000000001')
    await p.locator('input[name="phoneNumberId"]').fill(`8${String(Date.now()).slice(-12)}`)
    await p.locator('input[name="accessToken"]').fill('e2e-token')
    await p.locator('input[name="verifyToken"]').fill('e2e-verify')
    await p.locator('input[name="appSecret"]').fill('e2e-secret')
    await p.getByRole('button', { name: 'Salvar', exact: true }).click()
    await expect.poll(async () => (await rotulos()).find(r => r.provider === 'official')?.label)
      .toBe(`${PREFIXO} Comercial ${marca}`)
  })
})
