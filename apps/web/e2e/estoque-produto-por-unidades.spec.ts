import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste, type Permissao } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcaoComFormulario } from './apoio/acao-direta'

/**
 * Bloco Estoque (E11 e E13) e o EQ1d do bloco Equipe — plano de adaptação
 * (o Heitor, 2026-11-13):
 * - E13: "Quem cadastra é só quem tem permissão de gerenciar. Se for pessoa de
 *   uma unidade especifica, unidade vem pré-preenchida e não pode ser mudada.
 *   Se a pessoa tiver mais de uma unidade, a lista mostra apenas as unidades
 *   dela." Sai a regra "catálogo só da rede × as unidades também" (C63).
 * - EQ1d: a unidade pré-preenchida segue as unidades da pessoa.
 * - E11: o estoque inicial "mantem como está, mas com possibilidade de dividir
 *   a entrada entre as unidades" — numa transação: uma parte que falha, nada fica.
 *
 * Numa rede [e2e] própria com três unidades (A, B, C). A prova é o banco.
 */

test.setTimeout(180_000)
test.use({ storageState: { cookies: [], origins: [] } })

const marca = Date.now().toString(36)
const db = () => banco()
const n = (v: unknown) => Number(v ?? 0)
let rede: OutraRede
let outra: OutraRede
let dona: MembroDeTeste
let deDuas: MembroDeTeste
let deUma: MembroDeTeste
let soVe: MembroDeTeste
const un = { A: { id: '', slug: '', nome: '' }, B: { id: '', slug: '', nome: '' }, C: { id: '', slug: '', nome: '' } }

const ESTOQUE: Permissao[] = [{ modulo: 'stock', nivel: 'MANAGE' }]

async function como(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado, viewport: { width: 1440, height: 900 } })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

/** O produto pelo nome, e o saldo e as entradas dele em cada unidade. */
async function produtoChamado(nome: string) {
  const { data } = await db().from('products').select('id').eq('tenant_id', rede.tenantId).eq('name', nome)
  const id = (data ?? [])[0]?.id as string | undefined
  if (!id) return { existe: false, quantos: (data ?? []).length, saldo: {} as Record<string, number>, entradas: 0, lotes: 0 }
  const saldos = (await db().from('branch_product_stock').select('branch_id, current_stock').eq('product_id', id)).data ?? []
  const entradas = (await db().from('stock_movements').select('id').eq('product_id', id).eq('type', 'PURCHASE')).data ?? []
  const lotes = (await db().from('product_batches').select('id').eq('product_id', id)).data ?? []
  return {
    existe: true, quantos: (data ?? []).length,
    saldo: Object.fromEntries(saldos.map(s => [s.branch_id as string, n(s.current_stock)])),
    entradas: entradas.length, lotes: lotes.length,
  }
}

const cadastro = (nome: string, linhas: [string, string][], extra: Record<string, string> = {}) => ({
  name: nome, unit: 'frasco', uso: 'INSUMO', min_stock: '1',
  _branchId: linhas.map(l => l[0]), initial_qty: linhas.map(l => l[1]),
  initial_cost: '30', initial_batch: `L-${marca}`, initial_nota_fiscal: '4630', _nomeRepetido: 'sim',
  ...extra,
})

test.beforeAll(async () => {
  test.setTimeout(240_000)
  rede = await criarOutraRede(`epu${marca}`)
  outra = await criarOutraRede(`epuo${marca}`)
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  const a = (await db().from('branches').select('id, slug, name').eq('id', rede.branchId).single<{ id: string; slug: string; name: string }>()).data!
  un.A = { id: a.id, slug: a.slug, nome: a.name }
  for (const letra of ['B', 'C'] as const) {
    const { data, error } = await db().from('branches')
      .insert({ tenant_id: rede.tenantId, name: `${PREFIXO} Unidade ${letra} ${marca}`, slug: `e2e-epu${letra.toLowerCase()}-${marca}` })
      .select('id, slug, name').single<{ id: string; slug: string; name: string }>()
    expect(error, `criar a unidade ${letra}`).toBeNull()
    un[letra] = { id: data!.id, slug: data!.slug, nome: data!.name }
  }
  // Um produto na rede: o "Novo produto" do cabeçalho só aparece com produto cadastrado (A2).
  expect((await db().from('products').insert({ tenant_id: rede.tenantId, name: `${PREFIXO} Gel ${marca}`, unit: 'frasco', uso: 'INSUMO' })).error).toBeNull()
  dona = await criarMembro(`epud${marca}`, { tenant: rede.tenantId, donoDaRede: true, rotulo: 'Dona', permissoes: [] })
  deDuas = await criarMembro(`epu2${marca}`, { tenant: rede.tenantId, branchId: un.A.id, outrasUnidades: [un.B.id], rotulo: 'Estoque de A e B', permissoes: ESTOQUE })
  deUma = await criarMembro(`epu1${marca}`, { tenant: rede.tenantId, branchId: un.A.id, rotulo: 'Estoque de A', permissoes: ESTOQUE })
  soVe = await criarMembro(`epuv${marca}`, { tenant: rede.tenantId, branchId: un.A.id, outrasUnidades: [un.B.id], rotulo: 'Só vê o estoque', permissoes: [{ modulo: 'stock', nivel: 'VIEW' }] })
})

test.afterAll(async () => {
  await dona?.limpar(); await deDuas?.limpar(); await deUma?.limpar(); await soVe?.limpar()
  await rede?.limpar(); await outra?.limpar()
})

test('E11: o estoque inicial dividido entre A e B entra nas duas, com o lote em cada uma', async ({ browser }) => {
  const nome = `${PREFIXO} Sérum dividido ${marca}`
  await como(browser, deDuas, async p => {
    await chamarAcaoComFormulario(p, 'actions/stock.ts', 'createProduct', `/${un.A.slug}/estoque`, [undefined],
      cadastro(nome, [[un.A.id, '3'], [un.B.id, '2']]))
  })
  const r = await produtoChamado(nome)
  expect(r.existe, 'o produto nasce').toBe(true)
  expect(r.saldo[un.A.id], 'A recebe 3').toBe(3)
  expect(r.saldo[un.B.id], 'B recebe 2').toBe(2)
  expect(r.entradas, 'uma entrada por unidade').toBe(2)
  expect(r.lotes, 'o lote em cada unidade').toBe(2)
})

test('E11 + E13: uma linha numa unidade que não é dela (C) — nada fica, nem o produto', async ({ browser }) => {
  const nome = `${PREFIXO} Sérum com C ${marca}`
  await como(browser, deDuas, async p => {
    await chamarAcaoComFormulario(p, 'actions/stock.ts', 'createProduct', `/${un.A.slug}/estoque`, [undefined],
      cadastro(nome, [[un.A.id, '3'], [un.C.id, '2']]))
    // E sozinha, também não.
    await chamarAcaoComFormulario(p, 'actions/stock.ts', 'createProduct', `/${un.A.slug}/estoque`, [undefined],
      cadastro(nome, [[un.C.id, '2']]))
  })
  const r = await produtoChamado(nome)
  expect(r.existe, 'a recusa não deixa produto para trás').toBe(false)
})

test('E11: uma unidade de OUTRA rede no estoque dividido — nada fica', async ({ browser }) => {
  const nome = `${PREFIXO} Sérum com a alheia ${marca}`
  await como(browser, dona, async p => {
    await chamarAcaoComFormulario(p, 'actions/stock.ts', 'createProduct', '/admin/estoque', [undefined],
      cadastro(nome, [[un.A.id, '3'], [outra.branchId, '2']]))
  })
  const r = await produtoChamado(nome)
  expect(r.existe, 'nem o produto, nem o estoque de A').toBe(false)
  expect((await db().from('branch_product_stock').select('product_id').eq('branch_id', outra.branchId)).data ?? [], 'nada na outra rede').toHaveLength(0)
})

test('E13: quem só VÊ o Estoque não cadastra (pela action direta)', async ({ browser }) => {
  const nome = `${PREFIXO} Sérum de quem só vê ${marca}`
  await como(browser, soVe, async p => {
    await chamarAcaoComFormulario(p, 'actions/stock.ts', 'createProduct', `/${un.A.slug}/estoque`, [undefined],
      cadastro(nome, [[un.A.id, '1']]))
  })
  expect((await produtoChamado(nome)).existe).toBe(false)
})

test('E13 + EQ1d: quem é de UMA unidade vê a unidade preenchida e travada', async ({ browser }) => {
  await como(browser, deUma, async p => {
    await p.goto(`/${un.A.slug}/estoque`)
    await p.getByRole('button', { name: 'Novo produto' }).first().click()
    const modal = p.locator('dialog[open]')
    await modal.getByRole('switch', { name: /Adicionar estoque inicial/ }).click()
    await expect(modal.locator('[data-unidade-travada]'), 'a unidade dela, escrita').toContainText(un.A.nome)
    await expect(modal.locator('select[name="_branchId"]'), 'sem lista para trocar').toHaveCount(0)
    await expect(modal.getByRole('button', { name: /Dividir com outra unidade/ }), 'uma unidade só: não há o que dividir').toHaveCount(0)
  })
})

test('E13 + EQ1d: quem é de A e B vê só A e B, com a do endereço escolhida, e divide pela tela', async ({ browser }) => {
  const nome = `${PREFIXO} Sérum pela tela ${marca}`
  await como(browser, deDuas, async p => {
    await p.goto(`/${un.B.slug}/estoque`)
    await p.getByRole('button', { name: 'Novo produto' }).first().click()
    const modal = p.locator('dialog[open]')
    await modal.getByRole('switch', { name: /Adicionar estoque inicial/ }).click()
    const primeira = modal.locator('select[name="_branchId"]').first()
    await expect(primeira, 'vem com a unidade em que ela está').toHaveValue(un.B.id)
    const opcoes = await primeira.locator('option').evaluateAll(os => os.map(o => (o as HTMLOptionElement).value).filter(Boolean))
    expect(new Set(opcoes), 'só as unidades dela').toEqual(new Set([un.A.id, un.B.id]))

    await modal.locator('input[name="name"]').fill(nome)
    await modal.locator('input[name="initial_qty"]').first().fill('4')
    await modal.getByRole('button', { name: /Dividir com outra unidade/ }).click()
    const segunda = modal.locator('select[name="_branchId"]').nth(1)
    await expect(segunda, 'a outra linha vem com a unidade que sobrou').toHaveValue(un.A.id)
    await modal.locator('input[name="initial_qty"]').nth(1).fill('1')
    await modal.getByRole('button', { name: 'Criar produto' }).click()
    await expect(modal).toHaveCount(0, { timeout: 20_000 })
  })
  const r = await produtoChamado(nome)
  expect(r.saldo[un.B.id]).toBe(4)
  expect(r.saldo[un.A.id]).toBe(1)
})

test('E13: quem tem a rede inteira escolhe entre todas, e a regra "Só a rede" saiu da tela', async ({ browser }) => {
  await como(browser, dona, async p => {
    await p.goto('/admin/estoque')
    await expect(p.locator('[data-catalogo-de-produtos]'), 'a configuração "Quem cadastra os produtos" saiu (E13)').toHaveCount(0)
    await p.getByRole('button', { name: 'Novo produto' }).first().click()
    const modal = p.locator('dialog[open]')
    await modal.getByRole('switch', { name: /Adicionar estoque inicial/ }).click()
    const opcoes = await modal.locator('select[name="_branchId"]').first().locator('option')
      .evaluateAll(os => os.map(o => (o as HTMLOptionElement).value).filter(Boolean))
    expect(new Set(opcoes)).toEqual(new Set([un.A.id, un.B.id, un.C.id]))
  })
})
