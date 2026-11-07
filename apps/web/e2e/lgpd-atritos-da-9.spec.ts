import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, clienteComSessao, type MembroDeTeste, type ClienteDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * A49 da 9ª simulação (2026-11-07): a Marina pediu os dados pelo app, e a
 * Beatriz procurou na ficha e no sino — o pedido estava em Configurações →
 * LGPD, e nada apontava para lá. Agora o pedido feito pelo app avisa no sino
 * de quem responde (Configurações em Gerenciar, da clínica toda), com o
 * "Abrir" da aba, e a ficha diz o pedido em aberto e onde responder.
 * Numa rede [e2e] própria.
 */

test.setTimeout(240_000)

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede
let dona: MembroDeTeste
let cliente: ClienteDeTeste

async function como(browser: Browser, estado: string, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`lg9${marca}`)
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  dona = await criarMembro(`lg9d${marca}`, { tenant: rede.tenantId, donoDaRede: true, permissoes: [] })
  cliente = await clienteComSessao(`lg9c${marca}`, { id: rede.branchId, slug: `e2e-un-lg9${marca}` }, { tenant: rede.tenantId })
})

test.afterAll(async () => {
  await cliente?.limpar()
  await dona?.limpar()
  await rede?.limpar()
})

test('A49: o pedido de dados feito pelo app avisa a clínica no sino, e a ficha aponta para Configurações → LGPD', async ({ browser }) => {
  await como(browser, cliente.estado, async p => {
    await p.goto(`/${cliente.slug}/cliente/perfil`)
    // Com o prontuário: a parte dele espera a clínica (o pedido segue em aberto).
    await p.locator('input[name="include_medical"]').check()
    await p.getByRole('button', { name: 'Solicitar meus dados' }).click()
    await expect.poll(async () => (await db().from('lgpd_requests').select('id').eq('client_id', cliente.clientId)).data?.length).toBe(1)
  })

  await expect.poll(async () => ((await db().from('user_notifications').select('type, data').eq('user_id', dona.userId)).data ?? [])
    .filter(n => n.type === 'lgpd.pedido').map(n => (n.data as { caminho?: string }).caminho),
  { message: 'a dona é avisada, com o caminho da aba' }).toEqual(['/admin/settings?tab=lgpd'])

  await como(browser, dona.estado, async p => {
    await p.goto(`/admin/clients/${cliente.clientId}`)
    const aviso = p.locator('[data-pedido-lgpd-da-ficha]')
    await expect(aviso).toContainText('Pedido de dados (LGPD) feito pelo app')
    await expect(aviso).toContainText('responder até')
    await expect(aviso.getByRole('link', { name: /Configurações → LGPD/ })).toHaveAttribute('href', '/admin/settings?tab=lgpd')
  })
})
