import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * est-03 da revisão das decisões (2026-11-02, "mudar"): "um frasco aberto de
 * toxina vence com 30 UI sobrando; a Bruna precisa digitar '0,3 frasco'". A
 * perda se digitava só em embalagens; agora aceita também a unidade de
 * CONSUMO ("30 UI"), e a conta é do banco — o movimento sai de 30 UI exatos, o
 * lote e o saldo descem o que essas 30 UI valem, e a recusa ("o lote tem só…")
 * fala na unidade escolhida. Numa rede [e2e] própria.
 */

test.describe.configure({ mode: 'serial' })

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let estoquista: MembroDeTeste | null = null
let slug = ''
const toxina = `${PREFIXO} Toxina UI ${marca}`
let produto = ''
const lote = `L-${marca}`

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: estoquista!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}
async function saldo() {
  const { data } = await db().from('branch_product_stock').select('current_stock, current_rendimento')
    .eq('product_id', produto).eq('branch_id', rede!.branchId).single<{ current_stock: number; current_rendimento: number }>()
  return { embalagens: Number(data!.current_stock), rendimento: Number(data!.current_rendimento) }
}
async function abrirPerda(p: Page) {
  await p.goto(`/${slug}/estoque`)
  await p.getByRole('row').filter({ hasText: toxina }).first().getByTitle('Gerenciar estoque').click()
  const modal = p.locator('dialog[open]').filter({ hasText: 'Gerenciar estoque' })
  await modal.getByRole('button', { name: 'Perda', exact: true }).click()
  return modal
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`peu${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  const { data, error } = await db().from('products')
    .insert({ tenant_id: rede.tenantId, name: toxina, unit: 'frasco', consumption_unit: 'UI', units_per_package: 100 })
    .select('id').single<{ id: string }>()
  expect(error).toBeNull()
  produto = data!.id
  const r = await db().rpc('estoque_entrada', {
    p_produto: produto, p_unidade: rede.branchId, p_quantidade: 3, p_custo: 600, p_observacao: 'e2e',
    p_lote: lote, p_validade: new Date(Date.now() + 60 * 86_400_000).toISOString(), p_autor: 'e2e',
  })
  expect(r.error).toBeNull()
  estoquista = await criarMembro(`peu${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Estoque', permissoes: [{ modulo: 'stock', nivel: 'MANAGE' }],
  })
})

test.afterAll(async () => {
  if (produto) {
    for (const t of ['product_batches', 'stock_movements', 'branch_product_stock']) await db().from(t).delete().eq('product_id', produto)
    await db().from('domain_events').delete().eq('entidade_id', produto)
    await db().from('products').delete().eq('id', produto)
  }
  if (rede) await db().from('envios_unicos').delete().eq('tenant_id', rede.tenantId)
  await estoquista?.limpar(); await rede?.limpar()
})

test('a perda em UI: 30 UI do frasco aberto saem exatas, sem conta de cabeça', async ({ browser }) => {
  await como(browser, async p => {
    const modal = await abrirPerda(p)
    await modal.getByRole('group', { name: 'Unidade da perda' }).getByRole('button', { name: 'UI', exact: true }).click()
    await modal.getByLabel('Quantidade').fill('30')
    await expect(modal.locator('[data-equivale]')).toContainText('0,3 frasco')
    await modal.getByLabel('Motivo').selectOption('VENCIDO')
    await modal.getByRole('button', { name: 'Registrar perda' }).click()
    await expect(modal).toBeHidden()
  })
  const { data: mov } = await db().from('stock_movements').select('quantity').eq('product_id', produto).eq('type', 'LOSS').single()
  expect(Number(mov!.quantity), 'o movimento é de 30 UI').toBe(-30)
  expect(await saldo()).toEqual({ embalagens: 3, rendimento: 270 })
  const { data: l } = await db().from('product_batches').select('quantity').eq('product_id', produto).single()
  expect(Number(l!.quantity), 'o lote desce 0,3 frasco').toBeCloseTo(2.7, 6)
})

test('mais UI do que o lote tem é recusado na unidade escolhida', async ({ browser }) => {
  await como(browser, async p => {
    const modal = await abrirPerda(p)
    const campo = modal.getByLabel('Lote')
    const valor = await campo.locator('option', { hasText: lote }).getAttribute('value')
    await campo.selectOption(valor ?? '')
    await modal.getByRole('group', { name: 'Unidade da perda' }).getByRole('button', { name: 'UI', exact: true }).click()
    await modal.getByLabel('Quantidade').fill('300')
    await modal.getByLabel('Motivo').selectOption('QUEBROU')
    await modal.getByRole('button', { name: 'Registrar perda' }).click()
    await expect(modal.getByText('O lote tem só 270 UI.')).toBeVisible()
  })
  expect(await saldo(), 'nada saiu').toEqual({ embalagens: 3, rendimento: 270 })
})
