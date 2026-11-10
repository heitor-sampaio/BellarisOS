import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * O lucro desconta as TAXAS DA MAQUININHA e as COMISSÕES — decisão do Heitor
 * (2026-11-04), a pergunta da 6ª simulação: "pode descontar as duas". Até
 * aqui: lucro = receita paga − despesa paga (sem a compra de estoque) − insumo.
 *
 * - As taxas são as mesmas que o Fechamento mostra: as gravadas nas parcelas da
 *   operadora (o crédito, 1x a 12x) e, no débito e no Pix, a da configuração —
 *   no dia em que a receita entrou.
 * - As comissões são as LANÇADAS no período (`released_at`), a conta de
 *   Financeiro → Comissões.
 * - Sem contar duas vezes: o "Fechar e pagar" das comissões gera uma despesa
 *   paga "Comissões" — ela fica no caixa e SAI das despesas do lucro (a
 *   comissão já entrou quando foi lançada).
 *
 * Numa rede `[e2e]` própria, no mês:
 *   - Pix R$ 1.000 a 1% (R$ 10), débito R$ 500 a 2% (R$ 10), crédito 2x R$ 600
 *     a 3% (R$ 18, nas duas parcelas da operadora): receita R$ 2.100, taxas R$ 38;
 *   - comissão lançada R$ 100; o fechamento dela, uma despesa paga "Comissões"
 *     de R$ 100; aluguel pago R$ 200.
 * Caixa: despesas R$ 300. Lucro: 2.100 − 200 − 38 − 100 = R$ 1.762 (83,9%).
 * Pela regra de antes, R$ 1.800.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let dona: MembroDeTeste | null = null
let slug = ''
const agora = new Date().toISOString()
test.describe.configure({ timeout: 120_000 })

async function como(browser: Browser, quem: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: quem.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}
const card = (p: Page, rotulo: string) =>
  p.locator('.card').filter({ has: p.getByText(rotulo, { exact: true }) }).first()
const dinheiro = (t: string) => Number((/(-?)R\$\s*(-?[\d.]+(?:,\d{2})?)/.exec(t) ?? []).slice(1).join('').replace(/\./g, '').replace(',', '.') || 'NaN')

test.beforeAll(async () => {
  test.setTimeout(180_000)
  rede = await criarOutraRede(`ltc${marca}`)
  const b = db()
  expect((await b.from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  slug = (await b.from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  dona = await criarMembro(`ltcd${marca}`, { tenant: rede.tenantId, donoDaRede: true, permissoes: [] })

  // As taxas ANTES das vendas: o crédito retrata a dele nas parcelas da operadora.
  expect((await b.from('payment_fees').insert([
    { tenant_id: rede.tenantId, metodo: 'PIX', parcelas: 1, taxa_pct: 1 },
    { tenant_id: rede.tenantId, metodo: 'DEBIT_CARD', parcelas: 1, taxa_pct: 2 },
    { tenant_id: rede.tenantId, metodo: 'CREDIT_CARD', parcelas: 2, taxa_pct: 3 },
  ])).error).toBeNull()

  const cliente = await rede.criarCliente('Cliente')
  const lancar = async (x: Record<string, unknown>) => {
    const { error: e } = await b.from('financial_transactions').insert({
      branch_id: rede!.branchId, is_paid: true, paid_at: agora, created_by: 'e2e', ...x,
    })
    expect(e, `lançar ${String(x.description)}`).toBeNull()
  }
  await lancar({ client_id: cliente, type: 'INCOME', category: 'Outro', description: `[e2e] pix ${marca}`, amount: 1000, payment_method: 'PIX' })
  await lancar({ client_id: cliente, type: 'INCOME', category: 'Outro', description: `[e2e] débito ${marca}`, amount: 500, payment_method: 'DEBIT_CARD' })
  await lancar({ client_id: cliente, type: 'INCOME', category: 'Outro', description: `[e2e] crédito 2x ${marca}`, amount: 600, payment_method: 'CREDIT_CARD', cartao_vezes: 2 })
  await lancar({ type: 'EXPENSE', category: 'Aluguel', description: `[e2e] aluguel ${marca}`, amount: 200, payment_method: 'PIX' })
  await lancar({ type: 'EXPENSE', category: 'Comissões', description: `[e2e] fechamento ${marca}`, amount: 100, payment_method: 'PIX' })
  const mes = agora.slice(0, 7)
  expect((await b.from('commissions').insert({
    branch_id: rede.branchId, professional_id: rede.professionalId, amount: 100, type: 'PERCENTAGE', rule_value: 10,
    status: 'PAID', period_ref: mes, released_at: agora, kind: 'LIBERACAO',
  })).error, 'a comissão lançada').toBeNull()
})

test.afterAll(async () => {
  if (rede) {
    await db().from('commissions').delete().eq('branch_id', rede.branchId)
    const { data: txs } = await db().from('financial_transactions').select('id').eq('branch_id', rede.branchId)
    const ids = (txs ?? []).map(t => t.id as string)
    if (ids.length) await db().from('recebiveis_do_cartao').delete().in('transaction_id', ids)
    await db().from('financial_transactions').delete().eq('branch_id', rede.branchId)
    await db().from('payment_fees').delete().eq('tenant_id', rede.tenantId)
  }
  await dona?.limpar(); await rede?.limpar()
})

test('o banco: as taxas da maquininha (R$ 38), as comissões lançadas (R$ 100) e a despesa do fechamento (R$ 100)', async () => {
  const { data, error } = await db().rpc('metrics_custos_da_venda', {
    p_tenant: rede!.tenantId, p_branch_ids: null,
    p_from: new Date(Date.now() - 86_400_000).toISOString(), p_to: new Date(Date.now() + 86_400_000).toISOString(),
  })
  expect(error).toBeNull()
  const linhas = (data as Record<string, unknown>[]).map(r => [r.branch_id, Number(r.taxas_da_maquininha), Number(r.comissoes), Number(r.despesa_de_comissoes)])
  expect(linhas).toEqual(expect.arrayContaining([[null, 38, 100, 100], [rede!.branchId, 38, 100, 100]]))
})

test('Relatórios: o lucro desconta as taxas e as comissões, e o DRE as mostra (R$ 1.762, 83,9%)', async ({ browser }) => {
  await como(browser, dona!, async p => {
    await p.goto('/admin/reports?tab=overview&period=month')
    await expect.poll(async () => dinheiro(await card(p, 'Despesas pagas (caixa)').innerText()), { timeout: 15_000 }).toBe(300)
    await expect.poll(async () => dinheiro(await card(p, 'Lucro').innerText()), { timeout: 15_000 }).toBe(1762)

    await p.goto('/admin/reports?tab=financeiro&period=month')
    await expect.poll(async () => dinheiro(await card(p, 'Lucro').innerText()), { timeout: 15_000 }).toBe(1762)
    await expect.poll(async () => card(p, 'Margem').innerText(), { timeout: 15_000 }).toContain('83,9%')
    const dre = card(p, 'DRE Simplificado')
    await expect(dre).toContainText(/Despesas Operacionais\s*R\$\s*200/)
    await expect(dre).toContainText(/Taxas da maquininha\s*R\$\s*38/)
    await expect(dre).toContainText(/Comissões\s*R\$\s*100/)
    await expect(dre).toContainText(/Lucro\s*R\$\s*1\.762/)
  })
})

test('o financeiro da unidade e o da rede: "Lucro Líquido" e "Resultado líquido" R$ 1.762; as despesas, o caixa (R$ 300)', async ({ browser }) => {
  await como(browser, dona!, async p => {
    await p.goto(`/${slug}/financeiro`)
    await expect.poll(async () => dinheiro(await card(p, 'Lucro Líquido').innerText()), { timeout: 15_000 }).toBe(1762)
    await expect.poll(async () => dinheiro(await card(p, 'Despesas pagas (caixa)').innerText()), { timeout: 15_000 }).toBe(300)

    await p.goto('/admin/financeiro?period=month')
    await expect.poll(async () => dinheiro(await card(p, 'Resultado líquido').innerText()), { timeout: 15_000 }).toBe(1762)
    await expect.poll(async () => dinheiro(await card(p, 'Despesas pagas (caixa)').innerText()), { timeout: 15_000 }).toBe(300)
  })
})

test('D8 da 8ª: o resultado se explica na tela — a conta embaixo do "Lucro Líquido" e do "Resultado líquido" fecha', async ({ browser }) => {
  // "Receita R$ 89 · Despesas R$ 0 · Comissões R$ 0 · Resultado líquido R$ 9":
  // o insumo e as taxas entravam no resultado, e nenhum cartão os mostrava.
  const conta = /Receita R\$\s*2\.100,00\s*− despesas operacionais R\$\s*200,00\s*− insumos e produtos R\$\s*0,00\s*− taxas da maquininha R\$\s*38,00\s*− comissões lançadas R\$\s*100,00\s*= R\$\s*1\.762,00/
  await como(browser, dona!, async p => {
    await p.goto(`/${slug}/financeiro`)
    await expect(card(p, 'Lucro Líquido').locator('[data-conta-do-resultado]')).toHaveText(conta, { timeout: 15_000 })
    await p.goto('/admin/financeiro?period=month')
    const daRede = card(p, 'Resultado líquido').locator('[data-conta-do-resultado]')
    await expect(daRede).toHaveText(conta, { timeout: 15_000 })
    // As despesas do cartão são o caixa (R$ 300): a conta diz por que só R$ 200 entram.
    await expect(card(p, 'Resultado líquido')).toContainText('a compra de estoque e o pagamento das comissões ficam no caixa')
  })
})
