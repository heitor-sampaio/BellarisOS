import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * A compra pela "Entrada" de estoque vira despesa, como a do cadastro (D13 da
 * simulação de 2026-10-28).
 *
 * A simulação achou: no Kobrasol entraram R$ 1.800 de insumo pela "Entrada"
 * (1 frasco pela dona, 2 seringas pelo Otávio) com despesa de R$ 0, enquanto o
 * Centro pagou R$ 4.500 pelo cadastro do produto — que oferece "Lançar o custo
 * como despesa paga hoje". O lucro do dia diferia por um critério que ninguém
 * escolheu.
 *
 * Decisão do Heitor (2026-10-28): a "Entrada" (unidade e rede) ganha a MESMA
 * opção, com o mesmo padrão (marcada), e a despesa nasce na mesma transação do
 * movimento.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let daRede: MembroDeTeste | null = null
let daUnidade: MembroDeTeste | null = null
let slug = ''
let produto = ''
let nome = ''

async function como(m: MembroDeTeste, browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}
async function abrirEntrada(p: Page, rota: string) {
  await p.goto(rota)
  await p.locator('tr, [role="row"], div').filter({ hasText: nome })
    .filter({ has: p.getByTitle('Gerenciar estoque') }).last()
    .getByTitle('Gerenciar estoque').click()
  const modal = p.locator('dialog[open]').filter({ hasText: 'Gerenciar estoque' })
  await modal.getByRole('button', { name: 'Entrada', exact: true }).click()
  return modal
}
async function despesas() {
  const { data, error } = await db().from('financial_transactions')
    .select('amount, is_paid, category, description, type')
    .eq('branch_id', rede!.branchId).eq('type', 'EXPENSE').eq('category', 'Estoque').order('created_at')
  expect(error).toBeNull()
  return (data ?? []).map(d => ({ valor: Number(d.amount), pago: d.is_paid, descricao: d.description }))
}
async function entradas() {
  const { count } = await db().from('stock_movements').select('id', { count: 'exact', head: true })
    .eq('product_id', produto).eq('type', 'PURCHASE')
  return count ?? 0
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`ed${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  produto = await rede.criarProduto('Toxina', 0)
  nome = (await db().from('products').select('name').eq('id', produto).single<{ name: string }>()).data!.name
  daRede = await criarMembro(`edr${marca}`, {
    tenant: rede.tenantId, rotulo: 'Estoque da rede', permissoes: [{ modulo: 'stock', nivel: 'MANAGE' }],
  })
  daUnidade = await criarMembro(`edu${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Estoque da unidade', permissoes: [{ modulo: 'stock', nivel: 'MANAGE' }],
  })
})

test.afterAll(async () => {
  const falhas: string[] = []
  if (rede) {
    const r = await db().from('financial_transactions').delete().eq('branch_id', rede.branchId)
    if (r.error) falhas.push(`despesas: ${r.error.message}`)
  }
  await daRede?.limpar()
  await daUnidade?.limpar()
  await rede?.limpar()
  expect(falhas).toEqual([])
})

test.describe('a entrada de estoque lança a despesa', () => {
  test('na rede: a opção vem marcada, com o valor, e a despesa paga nasce com a entrada', async ({ browser }) => {
    const [e0, d0] = [await entradas(), (await despesas()).length]
    await como(daRede!, browser, async p => {
      const modal = await abrirEntrada(p, '/admin/estoque')
      await modal.locator('select[name="branchId"]').first().selectOption(rede!.branchId)
      await modal.locator('input[name="quantity"]').first().fill('2')
      await modal.locator('input[name="unit_cost"]').fill('300')
      const opcao = modal.getByLabel(/Lançar o custo como despesa paga hoje/)
      await expect(opcao).toBeChecked()
      await expect(modal.getByText(/despesa paga hoje: R\$\s?600,00/)).toBeVisible()
      await modal.getByRole('button', { name: 'Registrar entrada' }).click()
      await expect(modal).toBeHidden()
    })
    expect(await entradas()).toBe(e0 + 1)
    expect((await despesas()).slice(d0)).toEqual([{ valor: 600, pago: true, descricao: `Compra: ${nome}` }])
  })

  test('na unidade: desmarcada, a entrada não lança despesa; marcada, lança', async ({ browser }) => {
    const [e0, d0] = [await entradas(), (await despesas()).length]
    await como(daUnidade!, browser, async p => {
      let modal = await abrirEntrada(p, `/${slug}/estoque`)
      await modal.locator('input[name="quantity"]').first().fill('1')
      await modal.locator('input[name="unit_cost"]').fill('900')
      await modal.getByLabel(/Lançar o custo como despesa paga hoje/).uncheck()
      await modal.getByRole('button', { name: 'Registrar entrada' }).click()
      await expect(modal).toBeHidden()

      modal = await abrirEntrada(p, `/${slug}/estoque`)
      await modal.locator('input[name="quantity"]').first().fill('1')
      await modal.locator('input[name="unit_cost"]').fill('900')
      await expect(modal.getByLabel(/Lançar o custo como despesa paga hoje/)).toBeChecked()
      await modal.getByRole('button', { name: 'Registrar entrada' }).click()
      await expect(modal).toBeHidden()
    })
    expect(await entradas()).toBe(e0 + 2)
    expect((await despesas()).slice(d0), 'só a marcada lança').toEqual([{ valor: 900, pago: true, descricao: `Compra: ${nome}` }])
  })

  test('sem custo, não há opção nem despesa', async ({ browser }) => {
    const [e0, d0] = [await entradas(), (await despesas()).length]
    await como(daUnidade!, browser, async p => {
      const modal = await abrirEntrada(p, `/${slug}/estoque`)
      await modal.locator('input[name="quantity"]').first().fill('1')
      await expect(modal.getByLabel(/Lançar o custo como despesa paga hoje/)).toHaveCount(0)
      await modal.getByRole('button', { name: 'Registrar entrada' }).click()
      await expect(modal).toBeHidden()
    })
    expect(await entradas()).toBe(e0 + 1)
    expect(await despesas()).toHaveLength(d0)
  })
})
