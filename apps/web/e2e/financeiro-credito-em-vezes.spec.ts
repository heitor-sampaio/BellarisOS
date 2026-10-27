import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * As formas de pagamento dizem o que foram (A33 e A35 da simulação de
 * 2026-10-27).
 *
 * A33: o crédito em 3x virava "Crédito Pago", sem o 3x (que está no banco,
 * `cartao_vezes`), na lista, no fechamento e na ficha; e escolher 3x sem taxa
 * da maquininha cadastrada para 3x não avisava nada (a comissão usa outra).
 * A35: o Fechamento do dia dizia "Sem forma (pontos)" numa saída de compra de
 * estoque — o rótulo dos pontos valia para todo lançamento sem forma.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let financeiro: MembroDeTeste | null = null
let slug = ''
let cliente = ''
let aReceber = ''
const agora = new Date().toISOString()

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: financeiro!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`cv${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  financeiro = await criarMembro(`cvf${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Financeiro',
    permissoes: [
      { modulo: 'financial', nivel: 'MANAGE' }, { modulo: 'cashier', nivel: 'MANAGE' },
      { modulo: 'clients', nivel: 'VIEW' }, { modulo: 'agenda', nivel: 'MANAGE' },
    ],
  })
  cliente = await rede.criarCliente('Joana')
  const { error } = await db().from('financial_transactions').insert([
    { branch_id: rede.branchId, client_id: cliente, type: 'INCOME', category: 'Serviços', description: `[e2e] Peeling ${marca}`,
      amount: 300, payment_method: 'CREDIT_CARD', cartao_vezes: 3, is_paid: true, paid_at: agora, created_by: 'e2e' },
    // A compra de estoque, sem forma: "Sem forma de pagamento" — não "(pontos)".
    { branch_id: rede.branchId, type: 'EXPENSE', category: 'Estoque', description: `[e2e] Compra ${marca}`,
      amount: 90, payment_method: null, is_paid: true, paid_at: agora, created_by: 'e2e' },
  ])
  expect(error).toBeNull()
  // Um concluído a receber, para a janela do pagamento.
  await db().from('procedures').update({ price: 300 }).eq('id', rede.procedureId)
  const { data: ag, error: eAg } = await db().from('appointments').insert({
    branch_id: rede.branchId, client_id: cliente, procedure_id: rede.procedureId, professional_id: rede.professionalId,
    status: 'COMPLETED', source: 'INTERNAL', duration_min: 30, price: 300, scheduled_at: agora, completed_at: agora,
  }).select('id').single<{ id: string }>()
  expect(eAg).toBeNull()
  aReceber = ag!.id
})
test.afterAll(async () => {
  await db().from('financial_transactions').delete().eq('branch_id', rede!.branchId)
  await db().from('payment_fees').delete().eq('tenant_id', rede!.tenantId)
  await financeiro?.limpar(); await rede?.limpar()
})

test.describe.serial('as formas de pagamento', () => {
  test('A33: o crédito em 3x aparece como "Crédito 3x" no financeiro, no fechamento e na ficha', async ({ browser }) => {
    await como(browser, async p => {
      await p.goto(`/${slug}/financeiro`)
      await expect(p.locator('tr', { hasText: `Peeling ${marca}` })).toContainText('Crédito 3x')

      await p.goto(`/${slug}/fechamento`)
      await expect(p.locator('[data-forma="CREDIT_CARD:3"]')).toContainText('Cartão de crédito 3x')
      await expect(p.locator('[data-forma="CREDIT_CARD:3"]')).toContainText('300,00')

      await p.goto(`/${slug}/clients/${cliente}?aba=financeiro`)
      await expect(p.locator('tr', { hasText: `Peeling ${marca}` })).toContainText('Crédito 3x')
    })
  })

  test('A35: a saída sem forma diz "Sem forma de pagamento", e não "(pontos)"', async ({ browser }) => {
    await como(browser, async p => {
      await p.goto(`/${slug}/fechamento`)
      const semForma = p.locator('[data-forma="SEM_FORMA"]')
      await expect(semForma).toContainText('Sem forma de pagamento')
      await expect(semForma).toContainText('90,00')
      await expect(p.getByText('Sem forma (pontos)')).toHaveCount(0)
    })
  })

  test('A33: escolher um N sem taxa cadastrada avisa', async ({ browser }) => {
    // A rede só tem a taxa de 2x.
    const { error } = await db().from('payment_fees').insert({ tenant_id: rede!.tenantId, metodo: 'CREDIT_CARD', parcelas: 2, taxa_pct: 4.5 })
    expect(error).toBeNull()
    await como(browser, async p => {
      await p.goto(`/${slug}/agenda/${aReceber}?receber=1`)
      const janela = p.getByRole('dialog', { name: 'Confirmar pagamento' })
      await janela.getByLabel('Forma de pagamento').selectOption('CREDIT_CARD')
      await janela.getByLabel('Vezes no cartão').selectOption('3')
      await expect(janela.locator('[data-aviso-taxa]')).toContainText(/3x/)
      await expect(janela.locator('[data-aviso-taxa]')).toContainText('4,50%')
      await janela.getByLabel('Vezes no cartão').selectOption('2')
      await expect(janela.locator('[data-aviso-taxa]')).toHaveCount(0)
    })
  })
})
