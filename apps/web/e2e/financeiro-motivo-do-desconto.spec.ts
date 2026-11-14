import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { abrirVendaNoPdv, euVendi, pagoNoPix } from './apoio/vender'

/**
 * fin-01 da revisão das decisões (2026-11-02, "mudar"): "a Bruna dá R$ 20 de
 * desconto com o motivo 'cliente antiga'; no Financeiro, a linha mostra só o
 * valor". O Heitor: "Adicionar campo de texto livre para informar motivo, não
 * obrigatório". Agora:
 * - a lista do Financeiro (unidade e rede) diz o desconto e o motivo embaixo
 *   do valor;
 * - o motivo (opcional) existe em TODA venda com desconto — a de produto, de
 *   pacote, de pré-pago e o checkout do plano —, e vai para o lançamento.
 * Numa rede [e2e] própria.
 */

test.describe.configure({ mode: 'serial' })

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let caixa: MembroDeTeste | null = null
let slug = ''
let cliente = ''
let produto = ''

async function como<T>(browser: Browser, fn: (p: Page) => Promise<T>) {
  const ctx = await browser.newContext({ storageState: caixa!.estado })
  try { return await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  test.setTimeout(120_000)
  rede = await criarOutraRede(`fmd${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  cliente = await rede.criarCliente('Motivo do desconto')
  const p = await db().from('products').insert({ tenant_id: rede.tenantId, name: `${PREFIXO} Sérum fmd ${marca}`, unit: 'un', uso: 'REVENDA', sale_price: 100 })
    .select('id').single<{ id: string }>()
  expect(p.error).toBeNull()
  produto = p.data!.id
  expect((await db().rpc('estoque_entrada', {
    p_produto: produto, p_unidade: rede.branchId, p_quantidade: 5, p_custo: 40, p_observacao: 'e2e', p_lote: null, p_validade: null, p_autor: 'e2e',
  })).error).toBeNull()
  caixa = await criarMembro(`fmd${marca}`, {
    tenant: rede.tenantId, rotulo: 'Caixa',
    permissoes: [{ modulo: 'cashier', nivel: 'MANAGE' }, { modulo: 'financial', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'MANAGE' }],
  })
})

test.afterAll(async () => {
  const b = db()
  if (rede) {
    const { data: vs } = await b.from('product_sales').select('id').eq('tenant_id', rede.tenantId)
    const ids = (vs ?? []).map(v => v.id as string)
    if (ids.length) {
      await b.from('commission_lines').delete().in('product_sale_id', ids)
      await b.from('financial_transactions').delete().in('product_sale_id', ids)
      await b.from('product_sales').delete().in('id', ids)
    }
    await b.from('financial_transactions').delete().eq('branch_id', rede.branchId)
    for (const t of ['product_batches', 'stock_movements', 'branch_product_stock']) await b.from(t).delete().eq('product_id', produto)
    await b.from('products').delete().eq('id', produto)
    await b.from('envios_unicos').delete().eq('tenant_id', rede.tenantId)
  }
  await caixa?.limpar()
  await rede?.limpar()
})

test('a lista do Financeiro diz o desconto e o motivo embaixo do valor (unidade e rede)', async ({ browser }) => {
  const { data: tx, error } = await db().from('financial_transactions').insert({
    branch_id: rede!.branchId, client_id: cliente, type: 'INCOME', category: 'Serviços',
    description: `${PREFIXO} Limpeza ${marca}`, amount: 180, sale_discount: 20, desconto_motivo: 'cliente antiga',
    payment_method: 'PIX', is_paid: true, paid_at: new Date().toISOString(), created_by: 'e2e',
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  await como(browser, async p => {
    await p.goto(`/${slug}/financeiro`)
    const linha = p.locator(`[data-lancamento="${tx!.id}"]`)
    await expect(linha.locator('[data-desconto-do-lancamento]')).toHaveText('Desconto R$ 20,00 · cliente antiga')
    await p.goto('/admin/financeiro')
    await expect(p.locator(`[data-lancamento="${tx!.id}"] [data-desconto-do-lancamento]`)).toHaveText('Desconto R$ 20,00 · cliente antiga')
  })
})

test('a venda de produto com desconto tem o motivo (opcional), e ele vai ao lançamento e à lista', async ({ browser }) => {
  await como(browser, async p => {
    const janela = await abrirVendaNoPdv(p, `/${slug}`, cliente)
    const aba = janela.getByRole('button', { name: 'Produto' })
    if (await aba.count()) await aba.click()
    await expect(janela.getByLabel('Motivo do desconto'), 'sem desconto, sem o campo').toHaveCount(0)
    await janela.getByLabel('Desconto', { exact: true }).fill('10')
    await janela.getByLabel('Motivo do desconto').fill('Kit da casa')
    await pagoNoPix(janela)
    await euVendi(janela)
    await janela.getByRole('button', { name: /^Vender por R\$\s90,00/ }).click()
    await expect(janela).toBeHidden()
  })
  await expect.poll(async () => {
    const { data } = await db().from('financial_transactions').select('desconto_motivo, product_sale_id').eq('branch_id', rede!.branchId).not('product_sale_id', 'is', null)
    return (data ?? []).map(t => t.desconto_motivo)
  }).toEqual(['Kit da casa'])
  await como(browser, async p => {
    await p.goto(`/${slug}/financeiro`)
    await expect(p.locator('[data-desconto-do-lancamento]').filter({ hasText: 'Kit da casa' })).toHaveText('Desconto R$ 10,00 · Kit da casa')
  })
})
