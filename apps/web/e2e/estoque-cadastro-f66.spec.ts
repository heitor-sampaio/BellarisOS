import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao, chamarAcaoComFormulario } from './apoio/acao-direta'

/**
 * F66 — o cadastro do estoque (levantamento das regras, 2026-11-12):
 * - C17: editar o produto ZERAVA o custo — o formulário de edição não tem o
 *   campo, e `updateProduct` gravava `cost_price: null`. E o mínimo do cadastro
 *   chegava 0 ao formulário (a lista passava `min_stock: null`).
 * - C24: a categoria de OUTRA rede entrava no produto; o mínimo negativo era aceito.
 * - C63 (H8): "Quem cadastra e edita os produtos" — com "Só a rede", a gerente
 *   de unidade fixa não cria nem edita produto.
 * - C71: as categorias do estoque são da rede — a gerente de unidade não cria
 *   nem apaga.
 * Numa rede [e2e] própria, de uma unidade.
 */

test.setTimeout(180_000)

const marca = Date.now().toString(36)
const db = () => banco()
const n = (v: unknown) => Number(v ?? 0)
let rede: OutraRede
let outra: OutraRede
let dona: MembroDeTeste
let gerente: MembroDeTeste
let slug = ''
let serum = ''
let catAlheia = ''
const nomeSerum = `${PREFIXO} Sérum F66 ${marca}`

async function como(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado, viewport: { width: 1440, height: 900 } })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}
const rota = () => `/${slug}/estoque`
const produto = async () => (await db().from('products').select('name, cost_price, min_stock, category_id')
  .eq('id', serum).single<{ name: string; cost_price: number | null; min_stock: number; category_id: string | null }>()).data!

test.beforeAll(async () => {
  rede = await criarOutraRede(`ec66${marca}`)
  outra = await criarOutraRede(`ec66o${marca}`)
  const b = db()
  expect((await b.from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  slug = (await b.from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  const p = await b.from('products').insert({
    tenant_id: rede.tenantId, name: nomeSerum, unit: 'frasco', min_stock: 3, uso: 'INSUMO', cost_price: 40,
  }).select('id').single<{ id: string }>()
  expect(p.error).toBeNull()
  serum = p.data!.id
  const c = await b.from('product_categories').insert({ tenant_id: outra.tenantId, name: `${PREFIXO} Cat alheia ${marca}` }).select('id').single<{ id: string }>()
  expect(c.error).toBeNull()
  catAlheia = c.data!.id
  dona = await criarMembro(`ec66d${marca}`, { tenant: rede.tenantId, donoDaRede: true, rotulo: 'Dona', permissoes: [] })
  gerente = await criarMembro(`ec66g${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Gerente', permissoes: [{ modulo: 'stock', nivel: 'MANAGE' }],
  })
})

test.afterAll(async () => {
  await dona?.limpar(); await gerente?.limpar(); await rede?.limpar(); await outra?.limpar()
})

const edicao = (extra: Record<string, string> = {}) => ({
  _productId: serum, name: nomeSerum, unit: 'frasco', uso: 'INSUMO', min_stock: '3', ...extra,
})

test('C17: editar o produto não mexe no custo — e o formulário abre com o mínimo do cadastro', async ({ browser }) => {
  await como(browser, dona, async p => {
    const r = await chamarAcaoComFormulario(p, 'actions/stock.ts', 'updateProduct', rota(), [undefined], edicao({ name: `${nomeSerum} editado` }))
    expect(r.texto).toContain('"success":true')
    expect(n((await produto()).cost_price), 'o custo de R$ 40 fica').toBe(40)

    await p.goto(rota())
    await p.getByRole('row').filter({ hasText: `${nomeSerum} editado` }).first().getByTitle('Editar produto').click()
    const modal = p.locator('dialog[open]').filter({ hasText: 'Editar produto' })
    await expect(modal.locator('input[name="min_stock"]'), 'o mínimo 3 do cadastro, não 0').toHaveValue('3')
  })
  await db().from('products').update({ name: nomeSerum }).eq('id', serum)
})

test('C24: a categoria de outra rede e o mínimo negativo são recusados', async ({ browser }) => {
  await como(browser, dona, async p => {
    const r = await chamarAcaoComFormulario(p, 'actions/stock.ts', 'updateProduct', rota(), [undefined], edicao({ category_id: catAlheia }))
    expect(r.texto).toContain('Categoria não encontrada')
    expect((await produto()).category_id).toBeNull()

    const m = await chamarAcao(p, 'actions/stock.ts', 'adminUpdateMinStock', rota(), [serum, rede.branchId, -2])
    expect(m.texto).toContain('O mínimo não pode ser negativo')
  })
})

// Era o C71 (as categorias da rede, só para quem é da rede). O Bloco Estoque do
// plano de adaptação (E4, o Heitor, 13/11: "é só quem tem permissão de gerenciar,
// mesma regra para categoria, marca e fornecedor") o reverteu: quem tem o Estoque
// em Gerenciar, de uma unidade só, cria e exclui. A prova inteira das três listas
// está em e2e/estoque-marcas-e-fornecedores.spec.ts.
test('E4 (revê o C71): a gerente de unidade, com o Estoque em Gerenciar, cria e exclui categoria', async ({ browser }) => {
  const nome = `${PREFIXO} Cat da gerente ${marca}`
  const { data: cat } = await db().from('product_categories').insert({ tenant_id: rede.tenantId, name: `${PREFIXO} Cat da rede ${marca}` }).select('id').single<{ id: string }>()
  await como(browser, gerente, async p => {
    const c = await chamarAcao(p, 'actions/stock.ts', 'criarItemDoEstoque', rota(), ['categorias', nome])
    expect(c.texto).toContain('"id"')
    const d = await chamarAcao(p, 'actions/stock.ts', 'excluirItemDoEstoque', rota(), ['categorias', cat!.id])
    expect(d.texto).toContain('"success":true')
  })
  expect((await db().from('product_categories').select('id').eq('tenant_id', rede.tenantId).eq('name', nome)).data).toHaveLength(1)
  expect((await db().from('product_categories').select('id').eq('id', cat!.id)).data).toHaveLength(0)
})

test('C63: com "Só a rede", a gerente de unidade não cadastra nem edita produto — e a dona sim', async ({ browser }) => {
  // O padrão é a unidade: a gerente edita.
  await como(browser, gerente, async p => {
    const r = await chamarAcaoComFormulario(p, 'actions/stock.ts', 'updateProduct', rota(), [undefined], edicao())
    expect(r.texto).toContain('"success":true')
  })
  await como(browser, dona, async p => {
    const r = await chamarAcao(p, 'actions/stock.ts', 'salvarCatalogoDeProdutos', '/admin/estoque', ['REDE'])
    expect(r.texto).toContain('"success":true')
  })
  expect((await db().from('tenants').select('catalogo_de_produtos').eq('id', rede.tenantId).single<{ catalogo_de_produtos: string }>()).data!.catalogo_de_produtos).toBe('REDE')
  await como(browser, gerente, async p => {
    const r = await chamarAcaoComFormulario(p, 'actions/stock.ts', 'updateProduct', rota(), [undefined], edicao({ name: 'não pode' }))
    expect(r.texto).toContain('O catálogo de produtos é da rede')
    const c = await chamarAcaoComFormulario(p, 'actions/stock.ts', 'createProduct', rota(), [undefined], {
      name: `${PREFIXO} Novo da gerente ${marca}`, unit: 'un', uso: 'INSUMO',
    })
    expect(c.texto).toContain('O catálogo de produtos é da rede')
    // A tela diz por quê, no lugar do "Novo produto".
    await p.goto(rota())
    await expect(p.locator('[data-catalogo-da-rede]')).toContainText('O catálogo de produtos é da rede')
    await expect(p.getByRole('button', { name: 'Novo produto' })).toHaveCount(0)
  })
  expect((await produto()).name).toBe(nomeSerum)
  // A gerente não muda a regra.
  await como(browser, gerente, async p => {
    const r = await chamarAcao(p, 'actions/stock.ts', 'salvarCatalogoDeProdutos', rota(), ['UNIDADE'])
    expect(r.texto).toContain('Esta configuração é da clínica toda')
  })
  await como(browser, dona, async p => {
    const r = await chamarAcaoComFormulario(p, 'actions/stock.ts', 'updateProduct', rota(), [undefined], edicao())
    expect(r.texto).toContain('"success":true')
  })
})
