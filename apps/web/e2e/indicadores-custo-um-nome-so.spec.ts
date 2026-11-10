import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * A54 e "Reforça", item 2, da 5ª simulação: o dashboard da rede dizia "Custo
 * do mês R$ 0,00" ao lado do gráfico "Custo R$ 445,00", e Relatórios →
 * Financeiro dizia "Consumo de insumos R$ 380" ao lado do DRE "Insumos e
 * produtos vendidos R$ 445". Mesma palavra, duas contas. Agora o cartão do
 * dashboard é "Despesas pagas" (o caixa, como o Heitor decidiu), o gráfico diz
 * "Custo do lucro", e o cartão dos Relatórios é o MESMO número do DRE.
 *
 * Numa rede `[e2e]`: um sérum vendido a R$ 98 com custo de R$ 20 e nenhuma
 * despesa paga.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let gestor: MembroDeTeste | null = null
const agora = new Date().toISOString()

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: gestor!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}
const cartao = (p: Page, rotulo: string) =>
  p.getByText(rotulo, { exact: true }).first().locator('xpath=ancestor::div[contains(@class,"card")][1]')

test.beforeAll(async () => {
  rede = await criarOutraRede(`cu${marca}`)
  expect((await db().from('tenants').update({ onboarding_completed_at: agora }).eq('id', rede.tenantId)).error).toBeNull()
  gestor = await criarMembro(`cug${marca}`, {
    tenant: rede.tenantId, rotulo: 'Gestora',
    permissoes: [{ modulo: 'financial', nivel: 'VIEW' }, { modulo: 'reports', nivel: 'VIEW' }],
  })
  expect((await db().from('role_report_tabs').insert({ tenant_id: rede.tenantId, role_id: gestor.roleId, tab: 'financeiro' })).error).toBeNull()
  const cliente = await rede.criarCliente('Carla')
  const { data: prod } = await db().from('products')
    .insert({ tenant_id: rede.tenantId, name: `[e2e] Sérum ${marca}`, unit: 'un', cost_price: 20, sale_price: 98 })
    .select('id').single<{ id: string }>()
  const { data: venda, error } = await db().from('product_sales').insert({
    tenant_id: rede.tenantId, branch_id: rede.branchId, client_id: cliente, product_id: prod!.id, quantity: 1,
    preco_unitario: 98, preco_tabela: 98, desconto: 0, price: 98, custo: 20, sold_by: gestor.userId, sold_at: agora,
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  expect((await db().from('financial_transactions').insert({
    branch_id: rede.branchId, client_id: cliente, product_sale_id: venda!.id, type: 'INCOME', category: 'Venda de produto',
    description: `[e2e] sérum ${marca}`, amount: 98, payment_method: 'PIX', is_paid: true, paid_at: agora, created_by: 'e2e',
  })).error).toBeNull()
})
test.afterAll(async () => {
  await db().from('financial_transactions').delete().eq('branch_id', rede!.branchId)
  await db().from('product_sales').delete().eq('tenant_id', rede!.tenantId)
  await db().from('products').delete().eq('tenant_id', rede!.tenantId)
  await gestor?.limpar(); await rede?.limpar()
})

test('o cartão do caixa diz "Despesas pagas", o gráfico diz "Custo do lucro", e os Relatórios batem com o DRE', async ({ browser }) => {
  await como(browser, async p => {
    await p.goto('/admin/dashboard?period=month')
    await expect(cartao(p, 'Despesas pagas do mês')).toContainText('R$ 0,00')
    await expect(p.getByText('Custo do mês', { exact: true })).toHaveCount(0)
    const evolucao = p.locator('.card').filter({ hasText: /Evolução —/ }).first()
    await expect(evolucao).toContainText(/Custo do lucro\s*R\$\s*20,00/)
    // A39 da 11ª: a legenda diz o que o "Custo do lucro" soma.
    await expect(evolucao.locator('[data-custo-do-lucro-soma]')).toContainText(
      'Custo do lucro = despesas operacionais + insumos e produtos vendidos + taxas da maquininha + comissões lançadas')

    await p.goto('/admin/reports?period=month&tab=financeiro')
    await expect(cartao(p, 'Insumos e produtos vendidos')).toContainText('R$ 20,00')
    await expect(p.getByText('Consumo de insumos', { exact: true })).toHaveCount(0)
  })
})
