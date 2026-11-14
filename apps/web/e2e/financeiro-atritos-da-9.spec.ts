import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * Os atritos do dinheiro da 9ª simulação (2026-11-07), da F44:
 * - A14: a despesa não tinha "Boleto" entre as formas, e a parcelada pedia
 *   "Vencimento" e "Vencimento da 1ª parcela".
 * - A15 (decidido pelo princípio 3): o "Pagar" da despesa baixava sem
 *   perguntar a forma (ficava "—" no CSV e nos relatórios por método).
 * - A32: o "Estornar" era só um ícone de 30 px, sem texto.
 * Numa rede [e2e] própria, de uma unidade.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let slug = ''
let dona: MembroDeTeste | null = null
let despesa = ''
let receita = ''

async function como(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  test.setTimeout(150_000)
  rede = await criarOutraRede(`fa9${marca}`)
  const b = db()
  expect((await b.from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  slug = (await b.from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  dona = await criarMembro(`fa9d${marca}`, { tenant: rede.tenantId, donoDaRede: true, rotulo: 'Dona', permissoes: [] })
  const { data: d, error: eD } = await b.from('financial_transactions').insert({
    branch_id: rede.branchId, type: 'EXPENSE', category: 'Contas (energia, água, internet)', description: `Luz fa9${marca}`,
    amount: 780, is_paid: false, due_date: new Date(Date.now() + 2 * 86_400_000).toISOString(), created_by: 'e2e',
  }).select('id').single<{ id: string }>()
  expect(eD).toBeNull()
  despesa = d!.id
  const { data: r, error: eR } = await b.from('financial_transactions').insert({
    branch_id: rede.branchId, type: 'INCOME', category: 'Procedimento', description: `Receita fa9${marca}`,
    amount: 190, is_paid: true, paid_at: new Date().toISOString(), payment_method: 'PIX', created_by: 'e2e',
  }).select('id').single<{ id: string }>()
  expect(eR).toBeNull()
  receita = r!.id
})

test.afterAll(async () => {
  await dona?.limpar()
  await rede?.limpar()
})

test('A14: a despesa tem "Boleto" entre as formas, e a parcelada pede um vencimento só', async ({ browser }) => {
  await como(browser, dona!, async p => {
    await p.goto(`/${slug}/financeiro`)
    await p.getByRole('button', { name: 'Novo lançamento' }).click()
    const dlg = p.getByRole('dialog')
    await dlg.getByRole('button', { name: 'Despesa', exact: true }).click()
    await expect(dlg.getByLabel('Forma de pagamento').locator('option', { hasText: 'Boleto' })).toHaveCount(1)
    await dlg.getByRole('button', { name: 'Pendente', exact: true }).click()
    await dlg.getByRole('button', { name: 'Parcelado', exact: true }).click()
    // Um vencimento só: o da 1ª parcela.
    await expect(dlg.getByText('Vencimento da 1ª parcela')).toBeVisible()
    await expect(dlg.locator('#lanc-vencimento')).toHaveCount(0)
  })
})

test('A15: o "Pagar" da despesa pergunta a forma (com o Boleto) e grava', async ({ browser }) => {
  await como(browser, dona!, async p => {
    await p.goto(`/${slug}/financeiro?aba=movimentacoes#lancamentos`)
    await p.locator(`[data-lancamento="${despesa}"]`).getByRole('button', { name: 'Pagar' }).click()
    const dlg = p.getByRole('dialog', { name: 'Pagar despesa' })
    await expect(dlg.getByRole('button', { name: 'Confirmar pagamento' })).toBeDisabled()
    await dlg.getByLabel('Forma de pagamento').selectOption('BOLETO')
    await dlg.getByRole('button', { name: 'Confirmar pagamento' }).click()
    await expect(dlg).toBeHidden({ timeout: 15_000 })
  })
  await expect.poll(async () => (await db().from('financial_transactions').select('is_paid, payment_method').eq('id', despesa).single()).data)
    .toEqual({ is_paid: true, payment_method: 'BOLETO' })
})

test('A30: o "A receber da operadora" e o fluxo de caixa dizem o LÍQUIDO, com o bruto ao lado', async ({ browser }) => {
  const b = db()
  // Crédito 2x a 5%: a operadora deposita 2 × R$ 475,00 (R$ 500,00 bruto cada).
  expect((await b.from('payment_fees').insert({ tenant_id: rede!.tenantId, metodo: 'CREDIT_CARD', parcelas: 2, taxa_pct: 5 })).error).toBeNull()
  expect((await b.from('financial_transactions').insert({
    branch_id: rede!.branchId, type: 'INCOME', category: 'Procedimento', description: `Cartão fa9${marca}`,
    amount: 1000, is_paid: true, paid_at: new Date().toISOString(), payment_method: 'CREDIT_CARD', cartao_vezes: 2, created_by: 'e2e',
  })).error).toBeNull()
  const primeira = new Date(Date.now() + 30 * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }).slice(0, 7)
  for (const rota of [`/${slug}/financeiro`, '/admin/financeiro']) {
    await como(browser, dona!, async p => {
      await p.goto(rota)
      const cartao = p.locator('[data-kpi="a-receber-operadora"]')
      await expect(cartao.locator('[data-em-aberto]')).toContainText(/R\$\s950,00 líquido/)
      await expect(cartao.locator('[data-em-aberto]')).toContainText(/R\$\s1\.000,00 bruto/)
      const mes = p.locator(`[data-mes="${primeira}"] [data-da-operadora]`)
      await expect(mes).toContainText(/R\$\s475,00/)
      await expect(mes).toContainText(/R\$\s500,00 bruto/)
    })
  }
})

test('acessibilidade: no recebimento do atendimento, o seletor de vezes se acha pelo rótulo e grava 6x', async ({ browser }) => {
  const b = db()
  // A clínica parcela até 12x (sem depender das taxas cadastradas acima).
  expect((await b.from('tenants').update({ cartao_max_vezes: 12 }).eq('id', rede!.tenantId)).error).toBeNull()
  const cliente = await rede!.criarCliente('Carolina')
  const agora = new Date().toISOString()
  const { data: ap, error } = await b.from('appointments').insert({
    branch_id: rede!.branchId, client_id: cliente, procedure_id: rede!.procedureId, professional_id: rede!.professionalId,
    status: 'COMPLETED', source: 'INTERNAL', duration_min: 30, price: 1200, scheduled_at: agora, completed_at: agora,
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  await como(browser, dona!, async p => {
    await p.goto(`/${slug}/agenda/${ap!.id}?receber=1`)
    const dlg = p.getByRole('dialog', { name: 'Confirmar pagamento' })
    await dlg.getByRole('combobox', { name: 'Forma de pagamento' }).selectOption('CREDIT_CARD')
    // A opção diz "6x", como em toda tela de cobrança (era "6x no cartão" só aqui).
    await dlg.getByRole('combobox', { name: 'Vezes no cartão' }).selectOption({ label: '6x' })
    await dlg.getByRole('button', { name: 'Confirmar pagamento' }).click()
    await expect(dlg).toBeHidden({ timeout: 15_000 })
  })
  await expect.poll(async () => (await b.from('financial_transactions').select('cartao_vezes').eq('appointment_id', ap!.id).maybeSingle()).data?.cartao_vezes).toBe(6)
})

test('A34: o débito com a bandeira "Não informada" diz a taxa que vai valer', async ({ browser }) => {
  const b = db()
  expect((await b.from('payment_fees').insert({ tenant_id: rede!.tenantId, metodo: 'DEBIT_CARD', parcelas: 1, taxa_pct: 1.6 })).error).toBeNull()
  const cliente = await rede!.criarCliente('Bruna')
  const agora = new Date().toISOString()
  const { data: ap, error } = await b.from('appointments').insert({
    branch_id: rede!.branchId, client_id: cliente, procedure_id: rede!.procedureId, professional_id: rede!.professionalId,
    status: 'COMPLETED', source: 'INTERNAL', duration_min: 30, price: 190, scheduled_at: agora, completed_at: agora,
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  await como(browser, dona!, async p => {
    await p.goto(`/${slug}/agenda/${ap!.id}?receber=1`)
    const dlg = p.getByRole('dialog', { name: 'Confirmar pagamento' })
    await dlg.getByRole('combobox', { name: 'Forma de pagamento' }).selectOption('DEBIT_CARD')
    const aviso = dlg.locator('[data-taxa-do-debito]')
    await expect(aviso).toContainText('Taxa da maquininha no débito: 1,6%')
    await expect(aviso).toContainText(/a clínica recebe R\$\s186,96/)
  })
})

test('A32: o "Estornar" da linha tem texto, nos dois financeiros', async ({ browser }) => {
  await como(browser, dona!, async p => {
    await p.goto(`/${slug}/financeiro?aba=movimentacoes#lancamentos`)
    await expect(p.locator(`[data-lancamento="${receita}"] [data-estornar]`)).toHaveText(/Estornar/)
    await p.goto('/admin/financeiro?aba=movimentacoes#movimentacoes')
    await expect(p.locator(`[data-lancamento="${receita}"] [data-estornar]`)).toHaveText(/Estornar/)
  })
})
