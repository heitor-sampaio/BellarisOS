import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao, chamarAcaoComFormulario } from './apoio/acao-direta'

/**
 * Os defeitos de estoque da 11ª simulação (2026-11-10), da F54 (Gisele e
 * Marta, Clínica Azaleia):
 * - D2: o mínimo digitado no cadastro do produto não valia na unidade — a
 *   primeira entrada criava a linha da unidade com mínimo 0.
 * - D4: o lote criado pelo ajuste de inventário dizia "custo —", e valia
 *   R$ 39,50 na conta (`custo_do_lote`).
 * - D5: o ajuste errado não se desfazia e ficava em Perdas; o "Contar em" do
 *   Ajuste abria em g (consumo) e o da Perda em un (embalagem), em ordens
 *   trocadas; e uma variação de −98% passava com a caixa genérica.
 * - D6: o custo por grama do insumo do procedimento gravava 2 casas (R$ 0,038
 *   virava R$ 0,04), e o Histórico do estoque dizia "R$ 0,02/g".
 * Numa rede [e2e] própria, de uma unidade.
 */

test.setTimeout(180_000)

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let slug = ''
let dona: MembroDeTeste | null = null
let cera = ''
let luva = ''
let gaze = ''
let creme = ''
const nomeCera = `${PREFIXO} Cera ${marca}`
const nomeLuva = `${PREFIXO} Luva ${marca}`
const nomeGaze = `${PREFIXO} Gaze ${marca}`
const nomeCreme = `${PREFIXO} Creme ${marca}`
const loteA = `CA-${marca}`
const n = (v: unknown) => Number(v)

async function como(browser: Browser, m: { estado: string }, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado, viewport: { width: 1440, height: 900 } })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}
const linha = async (produto: string) => (await db().from('branch_product_stock').select('current_stock, current_rendimento, min_stock')
  .eq('product_id', produto).eq('branch_id', rede!.branchId).maybeSingle<{ current_stock: number; current_rendimento: number | null; min_stock: number }>()).data
const qtdDoLote = async (numero: string) => n((await db().from('product_batches').select('quantity').eq('batch_number', numero).single<{ quantity: number }>()).data!.quantity)
const perdasDaCera = async () => {
  const { data } = await db().rpc('metrics_perdas', {
    p_tenant: rede!.tenantId, p_branch_ids: [rede!.branchId],
    p_from: new Date(Date.now() - 864e5).toISOString(), p_to: new Date(Date.now() + 864e5).toISOString(),
  })
  return ((data ?? []) as { motivo: string; product_id: string | null; custo: number }[])
    .filter(l => l.product_id === cera && l.motivo === 'INVENTARIO').reduce((s, l) => s + n(l.custo), 0)
}

async function abrirGerenciar(p: Page, nome: string) {
  await p.goto(`/${slug}/estoque`)
  await p.getByRole('row').filter({ hasText: nome }).first().getByTitle('Gerenciar estoque').click()
  return p.locator('dialog[open]').filter({ hasText: 'Gerenciar estoque' })
}
const rotaDoEstoque = () => `/${slug}/estoque`

async function ajustar(p: Page, produto: string, novo: string, unidade: 'EMBALAGEM' | 'CONSUMO', motivo: string) {
  const r = await chamarAcaoComFormulario(p, 'actions/stock.ts', 'adminAdjustStock', rotaDoEstoque(), [undefined], {
    productId: produto, branchId: rede!.branchId, new_quantity: novo, unidade, reason: motivo, loteId: '',
  })
  expect(r.texto, `ajustar ${novo}`).toContain('"success":true')
}

test.beforeAll(async () => {
  test.setTimeout(150_000)
  rede = await criarOutraRede(`ed11${marca}`)
  const b = db()
  expect((await b.from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  slug = (await b.from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  dona = await criarMembro(`ed11d${marca}`, { tenant: rede.tenantId, donoDaRede: true, rotulo: 'Dona', permissoes: [] })
  // O cadastro com o mínimo (D2), sem estoque inicial: a unidade ainda não tem linha.
  const produtos = await b.from('products').insert([
    { tenant_id: rede.tenantId, name: nomeCera, unit: 'refil', consumption_unit: 'g', units_per_package: 1000, cost_price: 39.5, min_stock: 3, uso: 'INSUMO' },
    { tenant_id: rede.tenantId, name: nomeLuva, unit: 'cx', min_stock: 2, uso: 'INSUMO', cost_price: 30 },
    { tenant_id: rede.tenantId, name: nomeGaze, unit: 'pct', min_stock: 5, uso: 'INSUMO', cost_price: 8 },
    { tenant_id: rede.tenantId, name: nomeCreme, unit: 'pote', min_stock: 3, uso: 'INSUMO', cost_price: 12 },
  ]).select('id, name')
  expect(produtos.error).toBeNull()
  const id = (nome: string) => produtos.data!.find(p => p.name === nome)!.id as string
  cera = id(nomeCera); luva = id(nomeLuva); gaze = id(nomeGaze); creme = id(nomeCreme)
  // A cera: 15 refis no lote A, a R$ 39,50 o refil (R$ 0,0395 o grama).
  expect((await b.rpc('estoque_entrada', {
    p_produto: cera, p_unidade: rede.branchId, p_quantidade: 15, p_custo: 39.5, p_observacao: null,
    p_lote: loteA, p_validade: '2027-12-31', p_autor: 'e2e',
  })).error).toBeNull()
})

test.afterAll(async () => {
  await dona?.limpar(); await rede?.limpar()
})

test('D2: a primeira linha da unidade herda o mínimo do cadastro — na entrada e no ajuste; o 0 salvo à mão fica 0', async ({ browser }) => {
  await como(browser, dona!, async p => {
    const entrada = await chamarAcaoComFormulario(p, 'actions/stock.ts', 'adminAddStock', rotaDoEstoque(), [undefined], {
      productId: creme, branchId: rede!.branchId, quantity: '5', unit_cost: '12',
    })
    expect(entrada.texto).toContain('"success":true')
    await ajustar(p, luva, '4', 'EMBALAGEM', 'Inventário inicial')
    // O mínimo salvo à mão na unidade é o da unidade, mesmo 0.
    const r = await chamarAcao(p, 'actions/stock.ts', 'adminUpdateMinStock', rotaDoEstoque(), [gaze, rede!.branchId, 0])
    expect(r.texto).toContain('"success":true')
  })
  expect(n((await linha(creme))?.min_stock), 'a entrada do creme').toBe(3)
  expect(n((await linha(luva))?.min_stock), 'o ajuste da luva').toBe(2)
  expect(n((await linha(gaze))?.min_stock), 'o 0 salvo à mão').toBe(0)
})

test('D4 e D6: o lote do ajuste diz o custo dele, "R$ 39,50 (último custo)", e o Histórico o custo por grama com 4 casas', async ({ browser }) => {
  await como(browser, dona!, async p => {
    // A contagem de 16 refis: o refil a mais entra num lote novo, sem número, ao último custo.
    await ajustar(p, cera, '16', 'EMBALAGEM', 'Inventário: achei 1 refil')
    await p.goto(rotaDoEstoque())
    await p.getByRole('row').filter({ hasText: nomeCera }).first().click()
    const semNumero = p.locator('[data-lotes-do-produto]').filter({ hasText: 'Lote sem número' })
    await expect(semNumero).toContainText('R$ 39,50/refil (último custo)')
    await expect(p.locator('[data-lotes-do-produto]').filter({ hasText: `Lote ${loteA}` })).toContainText('R$ 39,50/refil')

    const modal = await abrirGerenciar(p, nomeCera)
    await modal.getByRole('button', { name: 'Histórico' }).click()
    const daEntrada = modal.locator('[data-movimento]').filter({ hasText: `Lote ${loteA}` }).filter({ hasText: 'Entrada' }).first()
    await expect(daEntrada, 'R$ 0,0395 o grama, não R$ 0,04').toContainText('R$ 0,0395/g')
  })
  // D6: o insumo do procedimento guarda o custo de consumo com 4 casas.
  const { data: proc } = await db().from('procedures').insert({ tenant_id: rede!.tenantId, name: `${PREFIXO} Depilação ${marca}`, category: 'e2e', duration_min: 30, price: 50 })
    .select('id').single<{ id: string }>()
  const ins = await db().from('procedure_products').insert({ procedure_id: proc!.id, product_id: cera, quantity: 30, unit_cost: 0.0395 })
    .select('unit_cost').single<{ unit_cost: number }>()
  expect(ins.error).toBeNull()
  expect(n(ins.data!.unit_cost), 'o custo do insumo com 4 casas').toBe(0.0395)
})

test('D5: o "Contar em" do Ajuste e da Perda nasce na embalagem, na mesma ordem, e a variação grande avisa forte', async ({ browser }) => {
  await como(browser, dona!, async p => {
    const modal = await abrirGerenciar(p, nomeCera)
    await modal.getByRole('button', { name: 'Ajuste', exact: true }).click()
    const doAjuste = modal.getByRole('group', { name: 'Contar em' }).getByRole('button')
    await expect(doAjuste).toHaveText(['refil', 'g'])
    await expect(doAjuste.first()).toHaveAttribute('aria-pressed', 'true')
    // A Gisele digitou 15 querendo refis, com a contagem em g: −99,9% do saldo.
    await doAjuste.nth(1).click()
    await modal.getByLabel('Contagem').fill('15')
    const aviso = modal.locator('[data-variacao-grande]')
    await expect(aviso).toBeVisible()
    await expect(aviso).toContainText('15 g')
    await modal.getByLabel('Contagem').fill('15900')
    await expect(aviso, 'a variação pequena não avisa').toHaveCount(0)

    await modal.getByRole('button', { name: 'Perda', exact: true }).click()
    const daPerda = modal.getByRole('group', { name: 'Unidade da perda' }).getByRole('button')
    await expect(daPerda).toHaveText(['refil', 'g'])
    await expect(daPerda.first()).toHaveAttribute('aria-pressed', 'true')
  })
})

test('D5: "Desfazer ajuste" devolve o saldo e os lotes, e a perda que ele gerou sai de Perdas', async ({ browser }) => {
  const antesA = await qtdDoLote(loteA)
  await como(browser, dona!, async p => {
    // O refil achado (o do teste do D4), se aquele não rodou neste worker.
    if (n((await linha(cera))?.current_rendimento) === 15000) await ajustar(p, cera, '16', 'EMBALAGEM', 'Inventário: achei 1 refil')
    // O ajuste a menos (16 → 15 refis): sai 1 refil do lote A e é perda "Inventário".
    await ajustar(p, cera, '15', 'EMBALAGEM', 'Inventário errado')
  })
  expect(n((await linha(cera))?.current_rendimento)).toBe(15000)
  expect(await qtdDoLote(loteA)).toBe(antesA - 1)
  expect(await perdasDaCera(), 'a perda do ajuste').toBeCloseTo(39.5, 2)

  await como(browser, dona!, async p => {
    const modal = await abrirGerenciar(p, nomeCera)
    await modal.getByRole('button', { name: 'Histórico' }).click()
    const ajuste = modal.locator('[data-movimento]').filter({ hasText: 'Inventário errado' })
    await ajuste.getByRole('button', { name: 'Desfazer ajuste' }).click()
    const janela = p.locator('dialog[open]').filter({ hasText: 'Desfazer o ajuste' }).last()
    await expect(janela).toContainText('não fica em Perdas')
    await janela.getByLabel('Motivo').fill('Contei em gramas')
    await janela.getByRole('button', { name: 'Desfazer ajuste' }).click()
    await expect(janela).toHaveCount(0)
    // O ajuste a mais (o refil achado), do lote novo sem saída, também se desfaz.
    await expect(modal.locator('[data-movimento]').filter({ hasText: 'Inventário: achei 1 refil' })
      .getByRole('button', { name: 'Desfazer ajuste' })).toBeVisible()
    await expect(modal.locator('[data-movimento]').filter({ hasText: 'Inventário errado' })).toContainText('Desfeito em')
  })
  await expect.poll(async () => n((await linha(cera))?.current_rendimento)).toBe(16000)
  expect(await qtdDoLote(loteA), 'o refil volta ao lote A').toBe(antesA)
  expect(await perdasDaCera(), 'a perda desfeita sai de Perdas').toBe(0)
  const { data: orig } = await db().from('stock_movements').select('desfeita_em, desfeita_motivo')
    .eq('product_id', cera).eq('type', 'MANUAL_ADJUSTMENT').eq('notes', 'Inventário errado').single()
  expect(orig!.desfeita_em).not.toBeNull()
  expect(orig!.desfeita_motivo).toBe('Contei em gramas')
  // Desfazer de novo é recusado pelo banco.
  const { data: m } = await db().from('stock_movements').select('id').eq('product_id', cera).eq('notes', 'Inventário errado').single<{ id: string }>()
  const deNovo = await db().rpc('estoque_desfazer_ajuste', { p_tenant: rede!.tenantId, p_movimento: m!.id, p_motivo: 'de novo', p_autor: 'e2e' })
  expect(deNovo.error?.message).toContain('já foi desfeito')
})
