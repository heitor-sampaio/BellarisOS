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
    await p.goto(`/${slug}/financeiro#lancamentos`)
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

test('A32: o "Estornar" da linha tem texto, nos dois financeiros', async ({ browser }) => {
  await como(browser, dona!, async p => {
    await p.goto(`/${slug}/financeiro#lancamentos`)
    await expect(p.locator(`[data-lancamento="${receita}"] [data-estornar]`)).toHaveText(/Estornar/)
    await p.goto('/admin/financeiro#movimentacoes')
    await expect(p.locator(`[data-lancamento="${receita}"] [data-estornar]`)).toHaveText(/Estornar/)
  })
})
