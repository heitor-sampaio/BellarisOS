import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * D10 da 15ª simulação (2026-11-15): o Dashboard do Téo (o CRM, sem Clientes,
 * Agenda nem Financeiro) dizia "3 unidades · 0 clientes", com 2 clientes na
 * rede — o total só se lê com um dos módulos do núcleo, e sem ele valia 0.
 * Princípio 4: sem o dado, não se mostra número. Quem tem os Clientes segue
 * lendo o total da rede (D12 da 13ª). Numa rede [e2e] própria.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let soCrm: MembroDeTeste | null = null
let comClientes: MembroDeTeste | null = null

async function como<T>(browser: Browser, estado: string, fn: (p: Page) => Promise<T>) {
  const ctx = await browser.newContext({ storageState: estado })
  try { return await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  test.setTimeout(180_000)
  rede = await criarOutraRede(`d10${marca}`)
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  await rede.criarCliente('Camila d10')
  await rede.criarCliente('Breno d10')
  soCrm = await criarMembro(`d10c${marca}`, { tenant: rede.tenantId, rotulo: 'So oportunidades', permissoes: [{ modulo: 'crm', nivel: 'MANAGE' }] })
  comClientes = await criarMembro(`d10k${marca}`, { tenant: rede.tenantId, rotulo: 'Com clientes', permissoes: [{ modulo: 'clients', nivel: 'VIEW' }] })
})

test.afterAll(async () => {
  await soCrm?.limpar(); await comClientes?.limpar()
  await rede?.limpar()
})

const cabecalho = (p: Page) => p.getByRole('heading', { level: 1 }).locator('xpath=following-sibling::p[1]')

test('D10: sem um módulo do núcleo, o cabeçalho do Dashboard não diz "0 clientes"', async ({ browser }) => {
  await como(browser, soCrm!.estado, async p => {
    await p.goto('/admin/dashboard')
    await expect(p.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 30_000 })
    await expect(cabecalho(p)).toBeVisible()
    await expect(cabecalho(p)).not.toContainText(/\d+ clientes?/)
  })
})

test('D10 (controle): com os Clientes, o cabeçalho diz o total da rede', async ({ browser }) => {
  await como(browser, comClientes!.estado, async p => {
    await p.goto('/admin/dashboard')
    await expect(cabecalho(p)).toContainText('2 clientes', { timeout: 30_000 })
  })
})
