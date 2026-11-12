import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao, chamarAcaoComFormulario } from './apoio/acao-direta'

/**
 * F66 — os movimentos do estoque (levantamento das regras, 2026-11-12):
 * - C18: transferir o frasco ABERTO criava rendimento — com 1,5 frasco
 *   (150 UI), transferir 2 passava (a conta era nas embalagens arredondadas).
 * - C20: o custo da perda de um lote que não veio de compra (o do ajuste) era
 *   o último custo, não o do lote.
 * - C69 (H12): "Desfazer perda" — a última perda do produto volta ao mesmo
 *   lote, e sai das Perdas.
 * - C76 (D4): o fornecedor da entrada vira a lista de Fornecedores da rede.
 * Numa rede [e2e] própria, com duas unidades.
 */

test.setTimeout(180_000)

const marca = Date.now().toString(36)
const db = () => banco()
const n = (v: unknown) => Number(v ?? 0)
let rede: OutraRede
let dona: MembroDeTeste
let gerente: MembroDeTeste
let slug = ''
let unidadeB = ''
let toxina = ''
let acido = ''
let luva = ''

async function como(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado, viewport: { width: 1440, height: 900 } })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}
const rota = () => `/${slug}/estoque`
const linha = async (produto: string, unidade = rede.branchId) => (await db().from('branch_product_stock')
  .select('current_stock, current_rendimento').eq('product_id', produto).eq('branch_id', unidade)
  .maybeSingle<{ current_stock: number; current_rendimento: number | null }>()).data
const entrada = async (produto: string, qtd: number, custo: number, lote: string | null) => {
  const r = await db().rpc('estoque_entrada', {
    p_produto: produto, p_unidade: rede.branchId, p_quantidade: qtd, p_custo: custo, p_observacao: null,
    p_lote: lote, p_validade: '2027-12-31', p_autor: 'e2e',
  })
  expect(r.error, `entrada de ${qtd}`).toBeNull()
}
const perda = async (produto: string, qtd: number, emConsumo = false, lote: string | null = null) => {
  const r = await db().rpc('estoque_perda_em', {
    p_produto: produto, p_unidade: rede.branchId, p_lote: lote, p_quantidade: qtd, p_em_consumo: emConsumo,
    p_motivo: 'QUEBROU', p_observacao: null, p_autor: 'e2e',
  })
  expect(r.error, `perda de ${qtd}`).toBeNull()
}
const perdas = async (produto: string) => (await db().from('stock_movements').select('id, unit_cost, quantity, desfeita_em')
  .eq('product_id', produto).eq('type', 'LOSS').lt('quantity', 0).order('created_at').order('id')).data as { id: string; unit_cost: number | null; quantity: number; desfeita_em: string | null }[]
const perdasNasMetricas = async (produto: string) => {
  const { data } = await db().rpc('metrics_perdas', {
    p_tenant: rede.tenantId, p_branch_ids: [rede.branchId],
    p_from: new Date(Date.now() - 864e5).toISOString(), p_to: new Date(Date.now() + 864e5).toISOString(),
  })
  return ((data ?? []) as { motivo: string | null; product_id: string | null; quantidade?: number; custo: number }[])
    .filter(l => l.product_id === produto && l.motivo === 'QUEBROU').reduce((s, l) => s + n(l.custo), 0)
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`em66${marca}`)
  const b = db()
  expect((await b.from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  slug = (await b.from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  const un = await b.from('branches').insert({ tenant_id: rede.tenantId, name: `${PREFIXO} Unidade B ${marca}`, slug: `e2e-unb-${marca}` }).select('id').single<{ id: string }>()
  expect(un.error).toBeNull()
  unidadeB = un.data!.id
  const produtos = await b.from('products').insert([
    { tenant_id: rede.tenantId, name: `${PREFIXO} Toxina ${marca}`, unit: 'frasco', consumption_unit: 'UI', units_per_package: 100, cost_price: 500, uso: 'INSUMO' },
    { tenant_id: rede.tenantId, name: `${PREFIXO} Ácido ${marca}`, unit: 'un', cost_price: 10, uso: 'INSUMO' },
    { tenant_id: rede.tenantId, name: `${PREFIXO} Luva ${marca}`, unit: 'cx', cost_price: 20, uso: 'INSUMO' },
  ]).select('id, name')
  expect(produtos.error).toBeNull()
  const id = (prefixo: string) => produtos.data!.find(p => (p.name as string).startsWith(`${PREFIXO} ${prefixo}`))!.id as string
  toxina = id('Toxina'); acido = id('Ácido'); luva = id('Luva')
  dona = await criarMembro(`em66d${marca}`, { tenant: rede.tenantId, donoDaRede: true, rotulo: 'Dona', permissoes: [] })
  gerente = await criarMembro(`em66g${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Gerente', permissoes: [{ modulo: 'stock', nivel: 'MANAGE' }],
  })
})

test.afterAll(async () => {
  await dona?.limpar(); await gerente?.limpar(); await rede?.limpar()
})

test('C18: transferir confere o que o frasco aberto rende — 2 de 1,5 frasco é recusado, 1 passa', async ({ browser }) => {
  await entrada(toxina, 2, 500, `TX${marca}`)
  await perda(toxina, 50, true)
  expect(n((await linha(toxina))?.current_rendimento)).toBe(150)
  const transferir = (p: Page, qtd: string) => chamarAcaoComFormulario(p, 'actions/stock.ts', 'adminTransferStock', '/admin/estoque', [undefined], {
    productId: toxina, fromBranchId: rede.branchId, toBranchId: unidadeB, quantity: qtd,
  })
  await como(browser, dona, async p => {
    const r = await transferir(p, '2')
    expect(r.texto, 'não há 2 frascos para transferir').toContain('Estoque insuficiente')
    expect(r.texto).toContain('Disponível: 1,5 frasco')
    const ok = await transferir(p, '1')
    expect(ok.texto).toContain('"success":true')
  })
  const origem = await linha(toxina)
  const destino = await linha(toxina, unidadeB)
  expect(n(origem?.current_rendimento), 'sobram 50 UI').toBe(50)
  expect(n(origem?.current_stock), 'o frasco aberto').toBe(1)
  expect(n(destino?.current_rendimento)).toBe(100)
  expect(n(destino?.current_stock)).toBe(1)
})

test('C20: a perda do lote do ajuste sai ao custo DESSE lote, não ao último custo', async ({ browser }) => {
  await entrada(acido, 1, 10, `AC1${marca}`)
  await como(browser, dona, async p => {
    const r = await chamarAcaoComFormulario(p, 'actions/stock.ts', 'adminAdjustStock', rota(), [undefined], {
      productId: acido, branchId: rede.branchId, new_quantity: '2', unidade: 'EMBALAGEM', reason: 'Inventário: achei 1', loteId: '',
    })
    expect(r.texto).toContain('"success":true')
  })
  await entrada(acido, 1, 30, `AC2${marca}`)
  expect(n((await db().from('products').select('cost_price').eq('id', acido).single<{ cost_price: number }>()).data!.cost_price), 'o último custo').toBe(30)
  const { data: lotes } = await db().from('product_batches').select('id').eq('product_id', acido).is('batch_number', null)
  expect(lotes).toHaveLength(1)
  await perda(acido, 1, false, lotes![0]!.id as string)
  const [p1] = await perdas(acido)
  expect(n(p1!.unit_cost), 'o lote do ajuste entrou a R$ 10').toBe(10)
})

test('C69: "Desfazer perda" — só a última, com motivo; volta ao mesmo lote e sai das Perdas', async ({ browser }) => {
  const lote = `LV${marca}`
  await entrada(luva, 5, 20, lote)
  await perda(luva, 1)
  await perda(luva, 2)
  const [primeira, ultima] = await perdas(luva)
  const qtdDoLote = async () => n((await db().from('product_batches').select('quantity').eq('batch_number', lote).single<{ quantity: number }>()).data!.quantity)
  expect(await qtdDoLote()).toBe(2)
  expect(await perdasNasMetricas(luva)).toBe(60)
  const desfazer = (p: Page, id: string, motivo: string) => chamarAcao(p, 'actions/stock.ts', 'desfazerPerdaDeEstoque', rota(), [id, motivo])
  await como(browser, gerente, async p => {
    expect((await desfazer(p, ultima!.id, '')).texto).toContain('Diga por que a perda é desfeita')
    expect((await desfazer(p, primeira!.id, 'contei errado')).texto).toContain('Só a última perda')
    expect((await desfazer(p, ultima!.id, 'contei errado')).texto).toContain('"success":true')
    expect((await desfazer(p, ultima!.id, 'de novo')).texto).toContain('já foi desfeita')
  })
  expect(n((await linha(luva))?.current_stock), 'as 2 caixas voltaram').toBe(4)
  expect(await qtdDoLote(), 'ao mesmo lote').toBe(4)
  expect(await perdasNasMetricas(luva), 'só a primeira perda, R$ 20').toBe(20)
  // No Histórico: "Perda desfeita" e o botão só na que pode.
  await como(browser, dona, async p => {
    await p.goto(rota())
    await p.getByRole('row').filter({ hasText: `Luva ${marca}` }).first().getByTitle('Gerenciar estoque').click()
    const modal = p.locator('dialog[open]').filter({ hasText: 'Gerenciar estoque' })
    await modal.getByRole('button', { name: 'Histórico' }).click()
    await expect(modal.locator('[data-movimento]').filter({ hasText: 'Perda desfeita' }).first()).toBeVisible()
    await expect(modal.getByRole('button', { name: 'Desfazer perda' })).toHaveCount(1)
  })
})

test('C76: o fornecedor da entrada vira a lista da rede — o mesmo nome, sem caixa nem espaços, é o mesmo fornecedor', async ({ browser }) => {
  await como(browser, gerente, async p => {
    const r1 = await chamarAcaoComFormulario(p, 'actions/stock.ts', 'adminAddStock', rota(), [undefined], {
      productId: luva, branchId: rede.branchId, quantity: '1', unit_cost: '20', fornecedor: ' Distribuidora  Sul ', nota_fiscal: '004630',
    })
    expect(r1.texto).toContain('"success":true')
    const r2 = await chamarAcaoComFormulario(p, 'actions/stock.ts', 'adminAddStock', rota(), [undefined], {
      productId: luva, branchId: rede.branchId, quantity: '1', unit_cost: '20', fornecedor: 'distribuidora sul',
    })
    expect(r2.texto).toContain('"success":true')
  })
  const { data: lista } = await db().from('fornecedores').select('id, nome').eq('tenant_id', rede.tenantId)
  expect(lista).toEqual([expect.objectContaining({ nome: 'Distribuidora Sul' })])
  const { data: movs } = await db().from('stock_movements').select('fornecedor, fornecedor_id')
    .eq('product_id', luva).eq('type', 'PURCHASE').not('fornecedor', 'is', null)
  expect(movs).toHaveLength(2)
  for (const m of movs!) expect(m).toEqual({ fornecedor: 'Distribuidora Sul', fornecedor_id: lista![0]!.id })

  // Editar e arquivar a lista é de quem é da rede.
  await como(browser, gerente, async p => {
    const r = await chamarAcao(p, 'actions/stock.ts', 'arquivarFornecedor', rota(), [lista![0]!.id, true])
    expect(r.texto).toContain('Esta configuração é da clínica toda')
  })
  await como(browser, dona, async p => {
    const r = await chamarAcao(p, 'actions/stock.ts', 'renomearFornecedor', '/admin/estoque', [lista![0]!.id, 'Distribuidora Sul Ltda'])
    expect(r.texto).toContain('"success":true')
  })
  expect((await db().from('fornecedores').select('nome').eq('id', lista![0]!.id).single<{ nome: string }>()).data!.nome).toBe('Distribuidora Sul Ltda')
})

test('C19: as "Validades próximas" do Relatório da unidade são os lotes DELA — o da outra unidade não aparece', async ({ browser }) => {
  const b = db()
  const daqui = await b.from('products').insert({ tenant_id: rede.tenantId, name: `${PREFIXO} Creme A ${marca}`, unit: 'un', cost_price: 5, uso: 'INSUMO' }).select('id').single<{ id: string }>()
  const dali  = await b.from('products').insert({ tenant_id: rede.tenantId, name: `${PREFIXO} Creme B ${marca}`, unit: 'un', cost_price: 5, uso: 'INSUMO' }).select('id').single<{ id: string }>()
  const em10 = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(Date.now() + 10 * 864e5))
  for (const [produto, unidade, lote] of [[daqui.data!.id, rede.branchId, `CA${marca}`], [dali.data!.id, unidadeB, `CB${marca}`]] as const) {
    const r = await b.rpc('estoque_entrada', {
      p_produto: produto, p_unidade: unidade, p_quantidade: 1, p_custo: 5, p_observacao: null,
      p_lote: lote, p_validade: em10, p_autor: 'e2e',
    })
    expect(r.error).toBeNull()
  }
  await como(browser, dona, async p => {
    await p.goto(`/${slug}/reports?tab=estoque&period=today`)
    await expect(p.getByText(`${PREFIXO} Creme A ${marca}`).first(), 'o lote desta unidade aparece').toBeVisible()
    await expect(p.getByText(`${PREFIXO} Creme B ${marca}`), 'o lote da outra unidade não').toHaveCount(0)
  })
})
