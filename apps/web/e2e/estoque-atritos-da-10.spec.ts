import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * O custo do estoque da 10ª simulação (2026-11-10), da F49 — princípio 3:
 * - D2: o valor em estoque e o consumo usavam o ÚLTIMO custo de compra, não o
 *   do lote. Gel: 10 un a R$ 22 + 6 un a R$ 24 valiam 16 × 24 = R$ 384 (e uma
 *   entrada nova podia BAIXAR o valor); a limpeza que "sai do lote" de R$ 18,50
 *   gravava R$ 19,50. A perda e a venda já iam pelo custo do lote.
 * - D5: o ajuste de inventário não fechava com os lotes nem com os relatórios —
 *   o positivo não entrava em lote nenhum (o saldo 18,1 com os lotes 17,1), e
 *   o negativo gravava custo nulo e não aparecia em "Perdas no período".
 * Numa rede [e2e] própria, de uma unidade.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let slug = ''
let dona: MembroDeTeste | null = null
let gel = ''
const nomeGel = `${PREFIXO} Gel condutor ${marca}`
const loteA = `GA-${marca}`
const loteB = `GB-${marca}`
const diaISO = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d)
const emDias = (n: number) => new Date(Date.now() + n * 86_400_000)
const n = (v: unknown) => Number(v)

async function como(browser: Browser, m: { estado: string }, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}
const valorEmEstoque = async () => n((await db().rpc('metrics_valor_em_estoque', { p_branch_ids: [rede!.branchId] })).data)
const lote = async (numero: string) => n((await db().from('product_batches').select('quantity').eq('product_id', gel).eq('batch_number', numero).single<{ quantity: number }>()).data!.quantity)
const saldo = async () => n((await db().from('branch_product_stock').select('current_stock').eq('product_id', gel).eq('branch_id', rede!.branchId).single<{ current_stock: number }>()).data!.current_stock)

async function abrirAjuste(p: Page) {
  await p.goto(`/${slug}/estoque`)
  await p.getByRole('row').filter({ hasText: nomeGel }).first().getByTitle('Gerenciar estoque').click()
  const modal = p.locator('dialog[open]').filter({ hasText: 'Gerenciar estoque' })
  await modal.getByRole('button', { name: 'Ajuste', exact: true }).click()
  return modal
}

test.beforeAll(async () => {
  test.setTimeout(150_000)
  rede = await criarOutraRede(`es10${marca}`)
  const b = db()
  expect((await b.from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  slug = (await b.from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  dona = await criarMembro(`es10d${marca}`, { tenant: rede.tenantId, donoDaRede: true, rotulo: 'Dona', permissoes: [] })
  const { data: p, error } = await b.from('products').insert({ tenant_id: rede.tenantId, name: nomeGel, unit: 'un', uso: 'INSUMO' })
    .select('id').single<{ id: string }>()
  expect(error).toBeNull()
  gel = p!.id
  // Duas compras: 10 un a R$ 22 (o lote A, vence antes) e 6 un a R$ 24 (o B).
  for (const [l, qtd, custo, dias] of [[loteA, 10, 22, 30], [loteB, 6, 24, 90]] as const) {
    expect((await b.rpc('estoque_entrada', {
      p_produto: gel, p_unidade: rede.branchId, p_quantidade: qtd, p_custo: custo, p_observacao: null,
      p_lote: l, p_validade: diaISO(emDias(dias)), p_autor: 'e2e',
    })).error).toBeNull()
  }
})

test.afterAll(async () => {
  await dona?.limpar(); await rede?.limpar()
})

test.describe.configure({ mode: 'serial' })

test('D2: o valor em estoque é o de cada lote, e o consumo sai ao custo do lote de onde saiu', async () => {
  expect(await valorEmEstoque(), '10 × 22 + 6 × 24').toBe(364)
  // O consumo de 1 un num atendimento (o banco grava o custo de consumo; o lote decide).
  const { data: m, error } = await db().from('stock_movements').insert({
    branch_id: rede!.branchId, product_id: gel, type: 'PROCEDURE_USAGE', quantity: -1, balance_after: 15, unit_cost: 24, created_by: 'e2e',
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  expect((await db().from('branch_product_stock').update({ current_stock: 15 }).eq('product_id', gel).eq('branch_id', rede!.branchId)).error).toBeNull()
  const mov = (await db().from('stock_movements').select('unit_cost').eq('id', m!.id).single<{ unit_cost: number }>()).data!
  expect(n(mov.unit_cost), 'saiu do lote A, de R$ 22').toBe(22)
  expect(await valorEmEstoque(), '9 × 22 + 6 × 24').toBe(342)
})

test('D5: o ajuste POSITIVO entra num lote (o escolhido), ao custo dele', async ({ browser }) => {
  await como(browser, dona!, async p => {
    const modal = await abrirAjuste(p)
    await modal.getByLabel('Novo estoque').fill('17')
    const escolha = modal.getByLabel('Em qual lote entra a diferença')
    await expect(escolha).toBeVisible()
    const idA = (await db().from('product_batches').select('id').eq('product_id', gel).eq('batch_number', loteA).single<{ id: string }>()).data!.id
    await expect(escolha.locator(`option[value="${idA}"]`)).toContainText(`Lote ${loteA}`)
    await escolha.selectOption(idA)
    await modal.getByLabel('Motivo').fill('Inventário: 2 achados')
    await modal.getByRole('checkbox').check()
    await modal.getByRole('button', { name: 'Aplicar ajuste' }).click()
    await expect.poll(saldo).toBe(17)
  })
  expect(await lote(loteA), 'os 2 achados no lote A').toBe(11)
  const { data: mov } = await db().from('stock_movements').select('quantity, unit_cost').eq('product_id', gel).eq('type', 'MANUAL_ADJUSTMENT').single()
  expect(n(mov!.quantity)).toBe(2)
  expect(n(mov!.unit_cost)).toBe(22)
  expect(await valorEmEstoque(), '11 × 22 + 6 × 24').toBe(386)
})

test('D5: o ajuste NEGATIVO sai pelo FEFO, ao custo do lote, e entra em "Perdas no período" como Inventário', async ({ browser }) => {
  await como(browser, dona!, async p => {
    const modal = await abrirAjuste(p)
    await modal.getByLabel('Novo estoque').fill('15')
    await expect(modal.locator('[data-ajuste-negativo]')).toContainText('Perdas no período')
    await expect(modal.getByLabel('Em qual lote entra a diferença')).toHaveCount(0)
    await modal.getByLabel('Motivo').fill('Inventário: 2 sumiram')
    await modal.getByRole('checkbox').check()
    await modal.getByRole('button', { name: 'Aplicar ajuste' }).click()
    await expect.poll(saldo).toBe(15)
  })
  expect(await lote(loteA), 'saíram do lote A (vence antes)').toBe(9)
  const { data: movs } = await db().from('stock_movements').select('quantity, unit_cost').eq('product_id', gel).eq('type', 'MANUAL_ADJUSTMENT').lt('quantity', 0)
  expect((movs ?? []).map(m => [n(m.quantity), n(m.unit_cost)])).toEqual([[-2, 22]])
  const { data: perdas, error } = await db().rpc('metrics_perdas', {
    p_tenant: rede!.tenantId, p_branch_ids: [rede!.branchId], p_from: new Date(Date.now() - 864e5).toISOString(), p_to: new Date(Date.now() + 864e5).toISOString(),
  })
  expect(error).toBeNull()
  const inventario = ((perdas ?? []) as { motivo: string | null; product_id: string | null; custo: number }[]).find(l => l.motivo === 'INVENTARIO' && !l.product_id)
  expect(n(inventario?.custo), 'R$ 44 de perda no inventário').toBe(44)
  await como(browser, dona!, async p => {
    await p.goto('/admin/reports?tab=estoque')
    await expect(p.getByText('Inventário').first()).toBeVisible()
  })
})
