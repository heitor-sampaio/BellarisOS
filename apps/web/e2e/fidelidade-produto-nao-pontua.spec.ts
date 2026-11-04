import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, clienteComSessao, type MembroDeTeste, type ClienteDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'

/**
 * A40 da 6ª simulação: o kit de R$ 248 da Paula não deu pontos — é a regra
 * (D4 de 29/10: a venda de produto "não pontua" por padrão, e a clínica liga),
 * e a janela "Vender" já diz isso. Mas a ficha e o app não diziam por quê: a
 * Paula e a Sofia acharam que os pontos tinham sumido. Agora, com a
 * fidelidade ligada e a venda de produto sem pontuar, o lançamento diz "Venda
 * de produto não pontua" na ficha e no app. Com a fidelidade desligada, nada
 * de pontos aparece (a regra de sempre).
 *
 * Numa rede [e2e] própria.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let recepcao: MembroDeTeste | null = null
let cliente: ClienteDeTeste | null = null
let produto = ''
let slug = ''

async function como(browser: Browser, estado: string, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`fpn${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  const { data: p, error } = await db().from('products').insert({
    tenant_id: rede.tenantId, name: `${PREFIXO} Protetor ${marca}`, unit: 'un', uso: 'REVENDA', sale_price: 99,
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  produto = p!.id
  expect((await db().rpc('estoque_entrada', {
    p_produto: produto, p_unidade: rede.branchId, p_quantidade: 3, p_custo: 40, p_observacao: 'e2e', p_lote: null, p_validade: null, p_autor: 'e2e',
  })).error).toBeNull()
  expect((await db().from('loyalty_configs').upsert(
    { tenant_id: rede.tenantId, enabled: true, earn_mode: 'POR_REAL', points_per_real: 1 }, { onConflict: 'tenant_id' })).error).toBeNull()
  recepcao = await criarMembro(`fpnr${marca}`, {
    tenant: rede.tenantId, rotulo: 'Recepção',
    permissoes: [{ modulo: 'cashier', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'VIEW' }, { modulo: 'loyalty', nivel: 'VIEW' }],
  })
  cliente = await clienteComSessao(`fpnc${marca}`, { id: rede.branchId, slug }, { tenant: rede.tenantId })
})

test.afterAll(async () => {
  const falhas: string[] = []
  if (rede) {
    const b = db()
    const { data } = await b.from('product_sales').select('id').eq('tenant_id', rede.tenantId)
    const ids = (data ?? []).map(v => v.id as string)
    for (const [o, q] of [
      ...(ids.length ? [
        ['comissão', b.from('commission_lines').delete().in('product_sale_id', ids)],
        ['lançamentos', b.from('financial_transactions').update({ product_sale_id: null }).in('product_sale_id', ids)],
      ] as const : []),
      ['lançamentos da unidade', b.from('financial_transactions').delete().eq('branch_id', rede.branchId)],
      ...(ids.length ? [['vendas', b.from('product_sales').delete().in('id', ids)]] as const : []),
      ['lotes', b.from('product_batches').delete().eq('product_id', produto)],
      ['movimentos', b.from('stock_movements').delete().eq('product_id', produto)],
      ['saldo', b.from('branch_product_stock').delete().eq('product_id', produto)],
      ['produto', b.from('products').delete().eq('id', produto)],
    ] as const) {
      const { error } = await q
      if (error) falhas.push(`${o}: ${error.message}`)
    }
  }
  await cliente?.limpar()
  await recepcao?.limpar()
  await rede?.limpar()
  expect(falhas).toEqual([])
})

test('a venda de produto paga, com a fidelidade ligada e sem pontuar: a ficha e o app dizem "Venda de produto não pontua"', async ({ browser }) => {
  await como(browser, recepcao!.estado, async p => {
    const rota = `/admin/clients/${cliente!.clientId}`
    await p.goto(rota)
    const r = await chamarAcao(p, 'actions/produtos.ts', 'venderProduto', rota,
      [cliente!.clientId, produto, rede!.branchId, 1, { forma: 'AVISTA', metodo: 'PIX' }, null])
    expect(r.texto).toContain('vendaId')
    await p.goto(`${rota}?aba=financeiro`)
    await expect(p.locator('[data-sem-pontos]').first()).toHaveText('Venda de produto não pontua')
  })
  await como(browser, cliente!.estado, async p => {
    await p.goto(`/${slug}/cliente/financeiro`)
    await expect(p.locator('[data-sem-pontos]').first()).toContainText('Venda de produto não pontua')
  })

  // Com a fidelidade desligada, nada fala de pontos.
  expect((await db().from('loyalty_configs').update({ enabled: false }).eq('tenant_id', rede!.tenantId)).error).toBeNull()
  await como(browser, cliente!.estado, async p => {
    await p.goto(`/${slug}/cliente/financeiro`)
    await expect(p.getByRole('heading', { name: 'Financeiro' })).toBeVisible()
    await expect(p.locator('[data-sem-pontos]')).toHaveCount(0)
  })
})
