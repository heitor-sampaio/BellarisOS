import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'

/**
 * D9 (simulação de 2026-10-29): no plano de tratamento o insumo do Peeling
 * aparecia "5 frasco" — no atendimento, a mesma linha era "5 ml". O plano lia
 * a unidade da EMBALAGEM (`products.unit`); a quantidade está na unidade de
 * CONSUMO, como em todo o estoque desde o D1 de 2026-10-27.
 *
 * O plano gravado guarda a unidade que a tela mandou: os que já foram salvos
 * com "frasco" também passam a mostrar "ml" (a unidade é a do produto, lida
 * na hora; a quantidade gravada nunca esteve em frascos).
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let membro: MembroDeTeste | null = null
let slug = ''
let produto = ''
let nomeDoProduto = ''
let plano = ''

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: membro!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}
const ARQ = 'actions/treatment-plans.ts'

test.beforeAll(async () => {
  rede = await criarOutraRede(`uc${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  produto = await rede.criarProduto('Ácido')
  // O frasco de 100 ml: compra-se em frascos, aplica-se em ml.
  const { data: p, error: eP } = await db().from('products')
    .update({ unit: 'frasco', consumption_unit: 'ml', units_per_package: 100 })
    .eq('id', produto).select('name').single<{ name: string }>()
  expect(eP).toBeNull()
  nomeDoProduto = p!.name
  expect((await db().from('procedure_products')
    .insert({ procedure_id: rede.procedureId, product_id: produto, quantity: 5 })).error).toBeNull()

  membro = await criarMembro(`ucm${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Profissional',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'medical_records', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'VIEW' }],
  })
  const cliente = await rede.criarCliente('Cliente do plano')
  const { data: pl, error: ePl } = await db().from('treatment_plans').insert({
    branch_id: rede.branchId, client_id: cliente, professional_id: membro.userId, status: 'DRAFT',
    name: `${PREFIXO} Plano uc ${marca}`,
  }).select('id').single<{ id: string }>()
  expect(ePl).toBeNull()
  plano = pl!.id
  const { data: s, error: eS } = await db().from('treatment_plan_sessions')
    .insert({ plan_id: plano, sort_order: 0 }).select('id').single<{ id: string }>()
  expect(eS).toBeNull()
  // Como a tela gravava até aqui: a unidade da embalagem.
  expect((await db().from('treatment_plan_session_procedures').insert({
    session_id: s!.id, procedure_id: rede.procedureId, price: 100, sort_order: 0,
    products: [{ product_id: produto, name: nomeDoProduto, unit: 'frasco', quantity: 5 }],
  })).error).toBeNull()
})

test.afterAll(async () => {
  const falhas: string[] = []
  if (plano) {
    const { data: s } = await db().from('treatment_plan_sessions').select('id').eq('plan_id', plano)
    const sess = (s ?? []).map(x => x.id as string)
    for (const [o, r] of [
      ['procedimentos do plano', sess.length ? await db().from('treatment_plan_session_procedures').delete().in('session_id', sess) : { error: null }],
      ['sessões', await db().from('treatment_plan_sessions').delete().eq('plan_id', plano)],
      ['eventos', await db().from('domain_events').delete().eq('entidade_id', plano)],
      ['plano', await db().from('treatment_plans').delete().eq('id', plano)],
    ] as const) if (r.error) falhas.push(`${o}: ${r.error.message}`)
  }
  if (produto) {
    const r = await db().from('procedure_products').delete().eq('product_id', produto)
    if (r.error) falhas.push(`insumo do procedimento: ${r.error.message}`)
  }
  await membro?.limpar()
  await rede?.limpar()
  expect(falhas).toEqual([])
})

test('o plano mostra o insumo na unidade de consumo (ml), não na embalagem', async ({ browser }) => {
  const tela = `/${slug}/planejamentos/${plano}`
  await como(browser, async p => {
    // O plano gravado com "frasco": lido, é "ml".
    const r = await chamarAcao(p, ARQ, 'getPlanoParaEditar', tela, [plano])
    expect(r.texto).toContain('"unit":"ml"')
    expect(r.texto).not.toContain('"unit":"frasco"')

    await p.goto(tela)
    // O botão dos insumos com a contagem: o plano já carregou (getPlanoParaEditar).
    const insumos = p.locator('button[title="Insumos"]', { hasText: '1' }).first()
    await expect(insumos).toBeVisible()
    await expect(async () => {
      await insumos.click()
      await expect(p.getByText('INSUMOS', { exact: true })).toBeVisible({ timeout: 2_000 })
    }).toPass()
    const linha = p.locator('div', { hasText: nomeDoProduto }).filter({ has: p.locator('input[type="number"]') }).last()
    await expect(linha).toContainText('ml')
    await expect(linha).not.toContainText('frasco')
    // O catálogo do editor ("+ Adicionar insumo…") também: o produto em ml.
    await expect(p.locator('option', { hasText: `${nomeDoProduto} (ml)` }).first()).toBeAttached()
    await expect(p.locator('option', { hasText: `${nomeDoProduto} (frasco)` })).toHaveCount(0)
  })
})
