import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * A venda de produto no "Meu faturamento" de quem VENDEU (decisão do Heitor,
 * 2026-11-01: "concordo"; F7 da 5ª simulação). Com o financeiro "só os
 * meus", o dinheiro dela era só o ligado a um atendimento dela — o sérum que
 * a Bruna vendeu no balcão não entrava em nenhum faturamento "dela". Agora o
 * lançamento da venda de produto (`product_sale_id`) conta para
 * `product_sales.sold_by`, como as Vendas já faziam.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let bruna: MembroDeTeste | null = null
let slug = ''
const agora = new Date().toISOString()
const de = new Date(Date.now() - 86_400_000).toISOString()
const ate = new Date(Date.now() + 86_400_000).toISOString()

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: bruna!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`vp${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  bruna = await criarMembro(`vpb${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Recepção',
    permissoes: [{ modulo: 'financial', nivel: 'VIEW', escopo: 'OWN' }],
  })
  const cliente = await rede.criarCliente('Carla')
  const { data: prod, error: eP } = await db().from('products')
    .insert({ tenant_id: rede.tenantId, name: `[e2e] Sérum ${marca}`, unit: 'un', cost_price: 40, sale_price: 98 })
    .select('id').single<{ id: string }>()
  expect(eP, 'produto').toBeNull()
  const { data: venda, error: eV } = await db().from('product_sales').insert({
    tenant_id: rede.tenantId, branch_id: rede.branchId, client_id: cliente, product_id: prod!.id, quantity: 1,
    preco_unitario: 98, preco_tabela: 98, desconto: 0, price: 98, custo: 40, sold_by: bruna.userId, sold_at: agora,
  }).select('id').single<{ id: string }>()
  expect(eV, 'venda').toBeNull()
  const { error: eT } = await db().from('financial_transactions').insert({
    branch_id: rede.branchId, client_id: cliente, product_sale_id: venda!.id, type: 'INCOME', category: 'Venda de produto',
    description: `[e2e] sérum ${marca}`, amount: 98, payment_method: 'PIX', is_paid: true, paid_at: agora, created_by: 'e2e',
  })
  expect(eT, 'lançamento').toBeNull()
})
test.afterAll(async () => {
  await db().from('financial_transactions').delete().eq('branch_id', rede!.branchId)
  await db().from('product_sales').delete().eq('tenant_id', rede!.tenantId)
  await db().from('products').delete().eq('tenant_id', rede!.tenantId)
  await bruna?.limpar(); await rede?.limpar()
})

test('o sérum que a Bruna vendeu entra no faturamento DELA (só os meus)', async ({ browser }) => {
  const p = { p_tenant: rede!.tenantId, p_branch_ids: [rede!.branchId], p_from: de, p_to: ate, p_professional_id: bruna!.userId }

  const { data: pagas, error: e1 } = await db().rpc('metrics_receitas_pagas', p)
  expect(e1).toBeNull()
  expect((pagas as { amount: number }[]).reduce((s, t) => s + Number(t.amount), 0)).toBe(98)

  const { data: core, error: e2 } = await db().rpc('metrics_core', p)
  expect(e2).toBeNull()
  expect(Number(core![0]!.revenue_cash)).toBe(98)

  const { data: serie, error: e3 } = await db().rpc('metrics_series', { ...p, p_granularity: 'month' })
  expect(e3).toBeNull()
  expect((serie as { revenue: number }[]).reduce((s, x) => s + Number(x.revenue), 0)).toBe(98)

  // Outra pessoa não leva a venda dela.
  const { data: outro } = await db().rpc('metrics_core', { ...p, p_professional_id: rede!.professionalId })
  expect(Number(outro![0]!.revenue_cash)).toBe(0)

  // A tela: o dashboard da unidade dela diz "Meu faturamento", e o mês tem os R$ 98.
  await como(browser, async pg => {
    await pg.goto(`/${slug}/dashboard`)
    await expect(pg.getByRole('heading', { name: 'Meu faturamento' })).toBeVisible()
    await expect(pg.getByText('R$ 98 no semestre')).toBeVisible()
  })
})
