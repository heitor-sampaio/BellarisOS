import { test, expect } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * O estoque inicial do produto novo (2026-10-21). A simulação de um dia de
 * clínica viu:
 * - três gravações fora de transação (movimento, saldo, lote — e a despesa),
 *   contra a regra do estoque (entrada só por estoque_entrada);
 * - o custo virar despesa PAGA de hoje sem a tela dizer nada.
 *
 * Agora é uma função só (estoque_inicial, sobre estoque_entrada) e a despesa
 * é uma caixa visível, marcada por padrão (o que já acontecia), que dá para
 * desmarcar.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let gestor: MembroDeTeste | null = null
let slug = ''

test.beforeAll(async () => {
  rede = await criarOutraRede(`ei${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  gestor = await criarMembro(`eig${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Estoque', permissoes: [{ modulo: 'stock', nivel: 'MANAGE' }],
  })
})
test.afterAll(async () => {
  if (rede) {
    await db().from('financial_transactions').delete().eq('branch_id', rede.branchId)
    const { data } = await db().from('products').select('id').eq('tenant_id', rede.tenantId)
    const ids = (data ?? []).map(p => p.id as string)
    if (ids.length) {
      await db().from('product_batches').delete().in('product_id', ids)
      await db().from('stock_movements').delete().in('product_id', ids)
      await db().from('branch_product_stock').delete().in('product_id', ids)
      await db().from('products').delete().in('id', ids)
    }
  }
  await gestor?.limpar(); await rede?.limpar()
})

async function produto(nome: string) {
  const { data, error } = await db().from('products').insert({ tenant_id: rede!.tenantId, name: nome, unit: 'un' }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  return data!.id
}

test('estoque_inicial grava tudo junto: movimento, saldo com o mínimo, lote, custo — e a despesa só se pedida', async () => {
  const com = await produto(`${PREFIXO} Com despesa ${marca}`)
  const sem = await produto(`${PREFIXO} Sem despesa ${marca}`)
  for (const [id, despesa] of [[com, true], [sem, false]] as const) {
    const { error } = await db().rpc('estoque_inicial', {
      p_produto: id, p_unidade: rede!.branchId, p_quantidade: 4, p_custo: 25, p_observacao: 'Estoque inicial',
      p_lote: `L-${marca}`, p_validade: null, p_autor: 'e2e', p_minimo: 2, p_despesa: despesa, p_descricao: 'Compra: teste',
    })
    expect(error, 'a função existe e grava').toBeNull()
  }
  const saldo = (await db().from('branch_product_stock').select('current_stock, min_stock').eq('product_id', com).single()).data
  expect(saldo).toEqual({ current_stock: 4, min_stock: 2 })
  expect((await db().from('stock_movements').select('quantity').eq('product_id', com)).data).toEqual([{ quantity: 4 }])
  expect((await db().from('product_batches').select('quantity').eq('product_id', com)).data).toEqual([{ quantity: 4 }])
  const { data: despesas } = await db().from('financial_transactions').select('amount, is_paid, category').eq('branch_id', rede!.branchId).eq('type', 'EXPENSE')
  expect(despesas, 'uma despesa só: a do produto que pediu').toEqual([{ amount: 100, is_paid: true, category: 'Estoque' }])
})

test('na tela, a despesa do estoque inicial é uma caixa visível — e desmarcada não lança', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: gestor!.estado })
  try {
    const p = await ctx.newPage()
    await p.goto(`/${slug}/estoque`)
    await expect(async () => {
      await p.getByRole('button', { name: 'Novo produto' }).click({ timeout: 1000 })
      await expect(p.getByRole('switch', { name: /Adicionar estoque inicial/ })).toBeVisible({ timeout: 1000 })
    }).toPass()
    const nome = `${PREFIXO} Pela tela ${marca}`
    const modal = p.locator('dialog[open]')
    await modal.locator('input[name="name"]').fill(nome)
    await modal.locator('select[name="unit"]').selectOption({ index: 1 })
    await modal.getByRole('switch', { name: /Adicionar estoque inicial/ }).click()
    await modal.locator('input[name="initial_qty"]').fill('3')
    await modal.locator('input[name="initial_cost"]').fill('10')
    const caixa = modal.getByRole('checkbox', { name: 'Lançar o custo como despesa paga hoje' })
    await expect(caixa, 'marcada por padrão: é o que já acontecia').toBeChecked()
    await caixa.uncheck()
    await modal.getByRole('button', { name: 'Criar produto' }).click()
    await expect.poll(async () => (await db().from('products').select('id').eq('name', nome)).data?.length ?? 0).toBe(1)
  } finally {
    await ctx.close()
  }
  const { data: prod } = await db().from('products').select('id').eq('name', `${PREFIXO} Pela tela ${marca}`).single<{ id: string }>()
  await expect.poll(async () => (await db().from('branch_product_stock').select('current_stock').eq('product_id', prod!.id).maybeSingle()).data?.current_stock).toBe(3)
  const { data: despesas } = await db().from('financial_transactions').select('id').eq('branch_id', rede!.branchId).eq('description', `Compra: ${PREFIXO} Pela tela ${marca}`)
  expect(despesas, 'desmarcada, nenhuma despesa').toEqual([])
})
