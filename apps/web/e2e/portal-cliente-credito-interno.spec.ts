import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { clienteComSessao, type ClienteDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * D-17 (decisão do Heitor, 2026-10-30): o saldo do crédito interno da cliente
 * — o da ficha da clínica do ENDEREÇO — aparece no Financeiro do app. Era só
 * da equipe: a cliente com R$ 150 de crédito (o plano cancelado, a devolução)
 * não sabia que tinha.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let cliente: ClienteDeTeste | null = null
let semCredito: ClienteDeTeste | null = null
let slug = ''

async function como(browser: Browser, quem: ClienteDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: quem.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`ci${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  cliente = await clienteComSessao(`cic${marca}`, { id: rede.branchId, slug }, { tenant: rede.tenantId })
  semCredito = await clienteComSessao(`cis${marca}`, { id: rede.branchId, slug }, { tenant: rede.tenantId })
  // Concessão de R$ 200 e um uso de R$ 50: o saldo é R$ 150.
  const { error } = await db().from('internal_credits').insert([
    { client_id: cliente.clientId, branch_id: rede.branchId, amount: 200, description: '[e2e] Plano cancelado' },
    { client_id: cliente.clientId, branch_id: rede.branchId, amount: -50, description: '[e2e] Uso' },
  ])
  expect(error, 'dar o crédito').toBeNull()
})
test.afterAll(async () => {
  if (cliente) await db().from('internal_credits').delete().eq('client_id', cliente.clientId)
  await cliente?.limpar(); await semCredito?.limpar(); await rede?.limpar()
})

test('o Financeiro do app mostra o saldo do crédito na clínica', async ({ browser }) => {
  await como(browser, cliente!, async p => {
    await p.goto(`/${slug}/cliente/financeiro`)
    const cartao = p.locator('[data-credito-interno]')
    await expect(cartao).toContainText('Crédito na clínica')
    await expect(cartao).toContainText('R$ 150,00')
  })
})

test('sem crédito, o cartão não aparece', async ({ browser }) => {
  await como(browser, semCredito!, async p => {
    await p.goto(`/${slug}/cliente/financeiro`)
    await expect(p.getByRole('heading', { name: 'Financeiro' })).toBeVisible()
    await expect(p.locator('[data-credito-interno]')).toHaveCount(0)
  })
})
