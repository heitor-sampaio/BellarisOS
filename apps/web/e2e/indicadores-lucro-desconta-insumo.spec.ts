import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * O lucro desconta o insumo consumido (decisão do Heitor, 2026-10-29: o
 * consumo "serve pra controle de estoque e aferimento de métricas de
 * custo/margem/lucro"). A despesa da categoria "Compra de estoque" conta no
 * CAIXA (o que saiu) e NÃO no lucro — senão o produto seria descontado duas
 * vezes, na compra e no consumo. A movimentação do estoque nunca gera despesa.
 *
 * Numa rede `[e2e]` própria, no mês:
 *   - receita paga R$ 1.000 (um atendimento), que gastou R$ 30 de insumo;
 *   - aluguel pago R$ 200;
 *   - "Compra de estoque" paga R$ 500.
 * Caixa: despesas R$ 700. Lucro: 1.000 − 200 − 30 = R$ 770 (77%). Pela regra
 * antiga (receita − despesa paga), R$ 300.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let dona: MembroDeTeste | null = null
let slug = ''
const agora = new Date().toISOString()
test.describe.configure({ timeout: 90_000 })

async function como(browser: Browser, quem: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: quem.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}
const card = (p: Page, rotulo: string) =>
  p.locator('.card').filter({ has: p.getByText(rotulo, { exact: true }) }).first()
const dinheiro = (t: string) => Number((/(-?)R\$\s*(-?[\d.]+(?:,\d{2})?)/.exec(t) ?? []).slice(1).join('').replace(/\./g, '').replace(',', '.') || 'NaN')

test.beforeAll(async () => {
  test.setTimeout(180_000)
  rede = await criarOutraRede(`lu${marca}`)
  const b = db()
  expect((await b.from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  slug = (await b.from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  dona = await criarMembro(`lud${marca}`, { tenant: rede.tenantId, donoDaRede: true, permissoes: [] })

  const cliente = await rede.criarCliente('Cliente')
  const produto = await rede.criarProduto('Insumo', 100)
  const { data: ap, error } = await b.from('appointments').insert({
    branch_id: rede.branchId, client_id: cliente, procedure_id: rede.procedureId, professional_id: rede.professionalId,
    status: 'COMPLETED', source: 'INTERNAL', duration_min: 30, price: 1000, scheduled_at: agora, completed_at: agora,
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  const lancar = async (x: Record<string, unknown>) => {
    const { error: e } = await b.from('financial_transactions').insert({
      branch_id: rede!.branchId, payment_method: 'PIX', is_paid: true, paid_at: agora, created_by: 'e2e', ...x,
    })
    expect(e, `lançar ${String(x.description)}`).toBeNull()
  }
  await lancar({ client_id: cliente, appointment_id: ap!.id, type: 'INCOME', category: 'Serviços', description: `[e2e] atendimento ${marca}`, amount: 1000 })
  await lancar({ type: 'EXPENSE', category: 'Aluguel', description: `[e2e] aluguel ${marca}`, amount: 200 })
  await lancar({ type: 'EXPENSE', category: 'Compra de estoque', description: `[e2e] compra ${marca}`, amount: 500 })
  // O insumo do atendimento: 3 unidades a R$ 10 (o custo do movimento).
  const { error: eM } = await b.from('stock_movements').insert({
    branch_id: rede.branchId, product_id: produto, type: 'PROCEDURE_USAGE', quantity: -3, unit_cost: 10,
    balance_after: 97, appointment_id: ap!.id, created_by: 'e2e',
  })
  expect(eM).toBeNull()
})

test.afterAll(async () => {
  if (rede) {
    await db().from('stock_movements').delete().eq('branch_id', rede.branchId)
    await db().from('financial_transactions').delete().eq('branch_id', rede.branchId)
    await db().from('appointments').delete().eq('branch_id', rede.branchId)
  }
  await dona?.limpar(); await rede?.limpar()
})

test('o banco: a compra de estoque paga (R$ 500) e o insumo consumido (R$ 30), por unidade e no total', async () => {
  const { data, error } = await db().rpc('metrics_resultado', {
    p_tenant: rede!.tenantId, p_branch_ids: null,
    p_from: new Date(Date.now() - 86_400_000).toISOString(), p_to: new Date(Date.now() + 86_400_000).toISOString(),
  })
  expect(error).toBeNull()
  const linhas = (data as Record<string, unknown>[]).map(r => [r.branch_id, Number(r.compra_de_estoque), Number(r.consumo_de_insumo)])
  expect(linhas).toEqual(expect.arrayContaining([[null, 500, 30], [rede!.branchId, 500, 30]]))
})

test('Relatórios: as despesas são o caixa (R$ 700) e o lucro desconta o insumo, não a compra (R$ 770, 77%)', async ({ browser }) => {
  await como(browser, dona!, async p => {
    await p.goto('/admin/reports?tab=overview&period=month')
    await expect.poll(async () => dinheiro(await card(p, 'Despesas').innerText()), { timeout: 10_000 }).toBe(700)
    await expect.poll(async () => dinheiro(await card(p, 'Lucro').innerText()), { timeout: 10_000 }).toBe(770)

    await p.goto('/admin/reports?tab=financeiro&period=month')
    await expect.poll(async () => dinheiro(await card(p, 'Lucro').innerText()), { timeout: 10_000 }).toBe(770)
    await expect.poll(async () => card(p, 'Margem').innerText(), { timeout: 10_000 }).toContain('77,0%')
    const dre = card(p, 'DRE Simplificado')
    await expect(dre).toContainText(/Despesas Operacionais\s*R\$\s*200/)
    await expect(dre).toContainText(/Insumos consumidos\s*R\$\s*30/)
    await expect(dre).toContainText(/Lucro\s*R\$\s*770/)
  })
})

test('o financeiro da unidade e o da rede: "Lucro Líquido" e "Resultado líquido" R$ 770; as despesas, R$ 700', async ({ browser }) => {
  await como(browser, dona!, async p => {
    await p.goto(`/${slug}/financeiro`)
    await expect.poll(async () => dinheiro(await card(p, 'Lucro Líquido').innerText()), { timeout: 10_000 }).toBe(770)
    await expect.poll(async () => dinheiro(await card(p, 'Despesas').innerText()), { timeout: 10_000 }).toBe(700)

    await p.goto('/admin/financeiro?period=month')
    await expect.poll(async () => dinheiro(await card(p, 'Resultado líquido').innerText()), { timeout: 10_000 }).toBe(770)
    await expect.poll(async () => dinheiro(await card(p, 'Despesas totais').innerText()), { timeout: 10_000 }).toBe(700)
  })
})
