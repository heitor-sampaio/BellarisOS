import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { euVendi } from './apoio/vender'

/**
 * Os atritos do caixa da 8ª simulação (2026-11-06), da F38:
 * - A33: a recepção (Recebimentos em Gerenciar) não via Estornar, Devolver nem
 *   Cancelar pacote, e a tela não dizia a quem pedir (a regra de cargo fica).
 * - A36: pagar com "Crédito interno" não mostrava o saldo nem o que sobra.
 * - A43: a ficha dizia "Investido total R$ 0" ao lado do "Preço médio R$ 450",
 *   sem dizer que ela pagou com crédito na clínica (que não é receita, F7).
 * - A46: a venda concluída fechava a janela sem toast nem comprovante.
 * Numa rede [e2e] própria, de uma unidade.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let slug = ''
let dona: MembroDeTeste | null = null
let recepcao: MembroDeTeste | null = null
let nomeDaDona = ''
let cliente = ''
const SERUM = `${PREFIXO} Sérum cx ${marca}`

async function como(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  test.setTimeout(150_000)
  rede = await criarOutraRede(`cx8${marca}`)
  const b = db()
  expect((await b.from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  slug = (await b.from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  dona = await criarMembro(`cx8d${marca}`, { tenant: rede.tenantId, donoDaRede: true, rotulo: 'Dona', permissoes: [] })
  nomeDaDona = (await b.from('users').select('name').eq('id', dona.userId).single<{ name: string }>()).data!.name
  recepcao = await criarMembro(`cx8r${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Recepcao',
    permissoes: [{ modulo: 'cashier', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'agenda', nivel: 'MANAGE' }],
  })
  cliente = await rede.criarCliente('Daniela')
  // O crédito de fora (R$ 450) e um atendimento de R$ 180 pago com ele.
  expect((await b.from('internal_credits').insert({ client_id: cliente, branch_id: rede.branchId, amount: 450, description: 'Crédito de fora' })).error).toBeNull()
  const { data: ap, error: eAp } = await b.from('appointments').insert({
    branch_id: rede.branchId, client_id: cliente, procedure_id: rede.procedureId, professional_id: rede.professionalId,
    scheduled_at: new Date(Date.now() - 86_400_000).toISOString(), completed_at: new Date(Date.now() - 86_400_000).toISOString(),
    duration_min: 60, price: 180, status: 'COMPLETED', source: 'INTERNAL',
  }).select('id').single<{ id: string }>()
  expect(eAp).toBeNull()
  expect((await b.from('financial_transactions').insert({
    branch_id: rede.branchId, client_id: cliente, appointment_id: ap!.id, type: 'INCOME', category: 'Procedimento',
    description: 'Atendimento', amount: 180, is_paid: true, paid_at: new Date().toISOString(), payment_method: 'INTERNAL_CREDIT', created_by: 'e2e',
  })).error).toBeNull()
  // O produto (antes de qualquer tela abrir).
  const pr = await b.from('products').insert({ tenant_id: rede.tenantId, name: SERUM, unit: 'un', uso: 'REVENDA', sale_price: 100 })
    .select('id').single<{ id: string }>()
  expect(pr.error).toBeNull()
  expect((await b.rpc('estoque_entrada', {
    p_produto: pr.data!.id, p_unidade: rede.branchId, p_quantidade: 5, p_custo: 40, p_observacao: 'e2e', p_lote: null, p_validade: null, p_autor: 'e2e',
  })).error).toBeNull()
})

test.afterAll(async () => {
  await dona?.limpar(); await recepcao?.limpar()
  await rede?.limpar()
})

test('A33: a recepção lê na ficha a quem pedir o estorno, a devolução e o cancelamento do pacote', async ({ browser }) => {
  await como(browser, recepcao!, async p => {
    await p.goto(`/${slug}/clients/${cliente}?aba=financeiro`)
    const nota = p.locator('[data-quem-desfaz]')
    await expect(nota).toContainText('é de quem tem o Financeiro em Gerenciar')
    await expect(nota).toContainText(nomeDaDona)
  })
})

test('A43: a ficha diz que ela pagou com crédito na clínica (fora do investido e do "Total pago")', async ({ browser }) => {
  await como(browser, recepcao!, async p => {
    await p.goto(`/${slug}/clients/${cliente}`)
    await expect(p.locator('[data-pago-com-credito]').first()).toContainText(/R\$\s180,00 pagos com crédito na clínica/)
  })
})

test('A36 + A46: o crédito interno mostra o saldo e o que sobra, e a venda concluída avisa', async ({ browser }) => {
  await como(browser, recepcao!, async p => {
    await p.goto(`/${slug}/clients/${cliente}`)
    await p.getByRole('button', { name: 'Vender', exact: true }).click()
    const dlg = p.getByRole('dialog', { name: 'Vender' })
    await dlg.getByRole('button', { name: 'Produto', exact: true }).click()
    const produto = dlg.getByLabel('Produto', { exact: true })
    await produto.selectOption((await produto.locator('option', { hasText: SERUM }).getAttribute('value'))!)
    await dlg.getByLabel('Quantidade').fill('1')
    await dlg.getByLabel('Meio de pagamento').selectOption('INTERNAL_CREDIT')
    // R$ 450 − R$ 180 já usados = R$ 270; depois desta venda de R$ 100, R$ 170.
    await expect(dlg.locator('[data-saldo-do-credito]')).toHaveText(/Crédito na clínica: R\$\s270,00 · depois deste pagamento: R\$\s170,00/)
    await euVendi(dlg)
    await dlg.getByRole('button', { name: /^Vender por/ }).click()
    await expect(p.getByText(/Venda registrada: 1× .*Sérum cx/)).toBeVisible({ timeout: 15_000 })
  })
})
