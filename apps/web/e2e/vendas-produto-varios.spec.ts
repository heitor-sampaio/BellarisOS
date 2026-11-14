import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'
import { abrirVendaNoPdv, euVendi, pagoNoPix } from './apoio/vender'

/**
 * ven-04 da revisão das decisões (2026-11-02, "mudar"): "a Carla leva 2 séruns
 * e 1 protetor; a Bruna faz duas vendas e recebe duas vezes". Agora a venda de
 * produto leva VÁRIOS produtos e um pagamento só — o kit —, e o resto continua:
 * a baixa de cada um pelo lote que vence primeiro, a comissão da venda (uma,
 * sobre o total), o estorno com "O produto voltou?" (todos voltam) e as Vendas.
 * Numa rede [e2e] própria.
 */

test.describe.configure({ mode: 'serial' })

const marca = Date.now().toString(36)
const db = () => banco()
const n = (v: unknown) => Number(v)
let rede: OutraRede | null = null
let caixa: MembroDeTeste | null = null
let slug = ''
let cliente = ''
let serum = ''
let protetor = ''
const nomeSerum = `${PREFIXO} Sérum kit ${marca}`
const nomeProtetor = `${PREFIXO} Protetor kit ${marca}`

async function como<T>(browser: Browser, fn: (p: Page) => Promise<T>) {
  const ctx = await browser.newContext({ storageState: caixa!.estado })
  try { return await fn(await ctx.newPage()) } finally { await ctx.close() }
}
async function produto(nome: string, preco: number) {
  const p = await db().from('products').insert({ tenant_id: rede!.tenantId, name: nome, unit: 'un', uso: 'REVENDA', sale_price: preco })
    .select('id').single<{ id: string }>()
  expect(p.error).toBeNull()
  expect((await db().rpc('estoque_entrada', {
    p_produto: p.data!.id, p_unidade: rede!.branchId, p_quantidade: 5, p_custo: 40, p_observacao: 'e2e', p_lote: null, p_validade: null, p_autor: 'e2e',
  })).error).toBeNull()
  return p.data!.id
}
const saldo = async (id: string) => n((await db().from('branch_product_stock').select('current_stock')
  .eq('product_id', id).eq('branch_id', rede!.branchId).single()).data!.current_stock)
const vendas = async () => ((await db().from('product_sales').select('*').eq('tenant_id', rede!.tenantId).order('created_at')).data ?? [])

test.beforeAll(async () => {
  test.setTimeout(120_000)
  rede = await criarOutraRede(`vpv${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  cliente = await rede.criarCliente('Kit')
  serum = await produto(nomeSerum, 100)
  protetor = await produto(nomeProtetor, 90)
  expect((await db().from('commission_configs').upsert({ tenant_id: rede.tenantId, modo: 'INTEGRAL', produto_pct: 10 }, { onConflict: 'tenant_id' })).error).toBeNull()
  caixa = await criarMembro(`vpv${marca}`, {
    tenant: rede.tenantId, rotulo: 'Caixa',
    permissoes: [{ modulo: 'cashier', nivel: 'MANAGE' }, { modulo: 'financial', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'MANAGE' }],
  })
})

test.afterAll(async () => {
  const b = db()
  if (rede) {
    const ids = (await vendas()).map(v => v.id as string)
    if (ids.length) {
      await b.from('commission_lines').delete().in('product_sale_id', ids)
      await b.from('financial_transactions').update({ product_sale_id: null }).in('product_sale_id', ids)
    }
    await b.from('financial_transactions').delete().eq('branch_id', rede.branchId)
    if (ids.length) await b.from('product_sales').delete().in('id', ids)
    for (const id of [serum, protetor].filter(Boolean)) {
      for (const t of ['product_batches', 'stock_movements', 'branch_product_stock']) await b.from(t).delete().eq('product_id', id)
      await b.from('domain_events').delete().eq('entidade_id', id)
      await b.from('products').delete().eq('id', id)
    }
    await b.from('commission_configs').delete().eq('tenant_id', rede.tenantId)
    await b.from('envios_unicos').delete().eq('tenant_id', rede.tenantId)
  }
  await caixa?.limpar()
  await rede?.limpar()
})

test('o kit pela ficha: 2 séruns + 1 protetor, um pagamento só — a venda, a baixa de cada um, o dinheiro e a comissão', async ({ browser }) => {
  await como(browser, async p => {
    const janela = await abrirVendaNoPdv(p, `/${slug}`, cliente)
    const aba = janela.getByRole('button', { name: 'Produto' })
    if (await aba.count()) await aba.click()
    await janela.getByLabel('Produto', { exact: true }).selectOption(serum)
    await janela.getByLabel('Quantidade', { exact: true }).fill('2')
    await janela.getByRole('button', { name: 'Adicionar produto' }).click()
    await janela.getByLabel('Produto 2', { exact: true }).selectOption(protetor)
    await janela.getByLabel('Quantidade 2', { exact: true }).fill('1')
    await expect(janela.locator('[data-resumo-do-produto]')).toContainText('290,00')
    await janela.getByRole('radio', { name: 'Pix', exact: true }).click()
    await pagoNoPix(janela)
    await euVendi(janela)
    await janela.getByRole('button', { name: /^Vender por R\$\s290,00$/ }).click()
    await expect(janela).toBeHidden()
  })

  const vs = await vendas()
  expect(vs, 'UMA venda').toHaveLength(1)
  const v = vs[0]!
  expect({ tabela: n(v.preco_tabela), preco: n(v.price), custo: n(v.custo) }).toEqual({ tabela: 290, preco: 290, custo: 120 })
  const { data: itens } = await db().from('product_sale_items').select('product_id, quantity, preco_unitario').eq('sale_id', v.id).order('sort_order')
  expect((itens ?? []).map(i => `${i.product_id === serum ? 'serum' : 'protetor'}:${i.quantity}:${n(i.preco_unitario)}`)).toEqual(['serum:2:100', 'protetor:1:90'])
  expect(await saldo(serum)).toBe(3)
  expect(await saldo(protetor)).toBe(4)
  const { data: tx } = await db().from('financial_transactions').select('amount, description').eq('product_sale_id', v.id)
  expect((tx ?? []).map(t => n(t.amount)), 'UM pagamento').toEqual([290])
  expect(tx![0]!.description).toContain(`2× ${nomeSerum} + 1× ${nomeProtetor}`)
  const { data: linhas } = await db().from('commission_lines').select('preco').eq('product_sale_id', v.id)
  expect((linhas ?? []).map(l => n(l.preco)), 'UMA comissão, sobre o total').toEqual([290])
  const { data: rel } = await db().rpc('metrics_vendas', { p_tenant: rede!.tenantId, p_branch_ids: null, p_from: new Date(Date.now() - 864e5).toISOString(), p_to: new Date(Date.now() + 864e5).toISOString() })
  const linhaDoKit = (rel as { tipo: string; descricao: string; quantidade: number; valor: number }[]).find(r => r.tipo === 'PRODUTO')
  expect(linhaDoKit && { d: linhaDoKit.descricao, q: n(linhaDoKit.quantidade), v: n(linhaDoKit.valor) })
    .toEqual({ d: `2× ${nomeSerum} + 1× ${nomeProtetor}`, q: 3, v: 290 })
})

test('sem estoque de UM dos produtos, a venda inteira é recusada — e nada é gravado', async ({ browser }) => {
  const rota = `/${slug}/clients/${cliente}`
  const antes = (await vendas()).length
  await como(browser, async p => {
    await p.goto(rota)
    const r = await chamarAcao(p, 'actions/produtos.ts', 'venderProduto', `/${slug}/pdv`,
      [cliente, [{ produtoId: serum, quantidade: 1 }, { produtoId: protetor, quantidade: 9 }], rede!.branchId, null, { forma: 'AVISTA', metodo: 'PIX' }, null, null])
    expect(r!.texto).toContain('Estoque insuficiente')
  })
  expect((await vendas()).length).toBe(antes)
  expect(await saldo(serum), 'o sérum não baixou').toBe(3)
})

test('o estorno do kit com "o produto voltou": os dois voltam ao estoque', async ({ browser }) => {
  const [kit] = await vendas()
  const { data: tx } = await db().from('financial_transactions').select('id').eq('product_sale_id', kit!.id).single<{ id: string }>()
  await como(browser, async p => {
    await p.goto(`/${slug}/financeiro`)
    await chamarAcao(p, 'actions/financial.ts', 'reverseTransaction', `/${slug}/financeiro`, [tx!.id, slug, 'Devolveu o kit', true])
  })
  expect(await saldo(serum)).toBe(5)
  expect(await saldo(protetor)).toBe(5)
  const { data: dev } = await db().from('stock_movements').select('product_id, quantity').eq('type', 'SALE_RETURN').in('product_id', [serum, protetor])
  expect((dev ?? []).map(m => `${m.product_id === serum ? 'serum' : 'protetor'}:${n(m.quantity)}`).sort()).toEqual(['protetor:1', 'serum:2'])
  expect((await db().from('product_sales').select('estornada_em').eq('id', kit!.id).single()).data!.estornada_em).not.toBeNull()
})
