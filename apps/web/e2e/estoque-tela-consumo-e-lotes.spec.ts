import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * A tela de Estoque e o histórico do produto (simulação de 2026-10-28/29):
 *
 * - J-43: o saldo aparecia em embalagens ARREDONDADAS (268 UI = "3 frasco",
 *   95 ml = "1 frasco") e o selo dizia "abaixo do mín." quando a quantidade
 *   era IGUAL ao mínimo. Agora o saldo vem na unidade de consumo, com a
 *   equivalência exata em embalagens (2,68 frasco), e igual ao mínimo é
 *   "No mínimo".
 * - J-44: o histórico misturava "−1 ml" com a embalagem — o movimento diz agora
 *   as duas coisas (−32 UI · 0,32 frasco); e a coluna "TOTAL REDE" aparecia no
 *   portal da unidade, somando só a unidade.
 * - J-45: lote, validade e custo não apareciam na tela nem no histórico, e o
 *   cartão "VALIDADE EM 30 DIAS" não dizia qual produto. A entrada com
 *   validade e sem número de lote também guarda o lote (antes a validade
 *   sumia).
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let estoquista: MembroDeTeste | null = null
let slug = ''
const toxina = `${PREFIXO} Toxina ${marca}`
const serum  = `${PREFIXO} Sérum ${marca}`
const lote   = `L-${marca}`
let idToxina = ''
let idSerum = ''
let idAcido = ''
let idToxinaD3 = ''
const toxinaD3 = `${PREFIXO} Toxina D3 ${marca}`
const acido  = `${PREFIXO} Ácido ${marca}`
const loteD1 = `D1-${marca}`
const emDias = (n: number) => new Date(Date.now() + n * 86_400_000)
const diaBR = (d: Date) => d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
// D1 da 7ª simulação: a validade digitada no campo de DATA da entrada chega
// como "AAAA-MM-DD" e é gravada à meia-noite UTC — o dia, sem hora. O dia de
// Brasília daqui a 40 dias, escrito como o campo o manda.
const diaISO = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d)
const validadeD1 = diaISO(emDias(40))
const validadeD1NaTela = validadeD1.split('-').reverse().join('/')

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: estoquista!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`etl${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  const { data: p1, error: e1 } = await db().from('products')
    .insert({ tenant_id: rede.tenantId, name: toxina, unit: 'frasco', consumption_unit: 'UI', units_per_package: 100 })
    .select('id').single<{ id: string }>()
  expect(e1).toBeNull()
  idToxina = p1!.id
  const { data: p2, error: e2 } = await db().from('products')
    .insert({ tenant_id: rede.tenantId, name: serum, unit: 'un' }).select('id').single<{ id: string }>()
  expect(e2).toBeNull()
  idSerum = p2!.id

  // 3 frascos de 100 UI, lote com número e validade em 20 dias, a R$ 650 o frasco.
  const entrada = await db().rpc('estoque_entrada', {
    p_produto: idToxina, p_unidade: rede.branchId, p_quantidade: 3, p_custo: 650, p_observacao: 'NF 1',
    p_lote: lote, p_validade: diaISO(emDias(20)), p_autor: 'e2e',
  })
  expect(entrada.error).toBeNull()
  // 2 séruns com validade e SEM número de lote: a validade tem de ficar.
  const entrada2 = await db().rpc('estoque_entrada', {
    p_produto: idSerum, p_unidade: rede.branchId, p_quantidade: 2, p_custo: 60, p_observacao: null,
    p_lote: null, p_validade: diaISO(emDias(25)), p_autor: 'e2e',
  })
  expect(entrada2.error).toBeNull()
  // D1: 2 seringas de um lote com a validade só no DIA, como o campo de data a manda.
  const { data: p3, error: e3 } = await db().from('products')
    .insert({ tenant_id: rede.tenantId, name: acido, unit: 'seringa' }).select('id').single<{ id: string }>()
  expect(e3).toBeNull()
  idAcido = p3!.id
  const entrada3 = await db().rpc('estoque_entrada', {
    p_produto: idAcido, p_unidade: rede.branchId, p_quantidade: 2, p_custo: 380, p_observacao: null,
    p_lote: loteD1, p_validade: validadeD1, p_autor: 'e2e',
  })
  expect(entrada3.error).toBeNull()
  // D3: 8 frascos de 100 UI e 20 UI aplicadas — 780 UI, o "8 frasco" arredondado.
  const { data: p4, error: e4 } = await db().from('products')
    .insert({ tenant_id: rede.tenantId, name: toxinaD3, unit: 'frasco', consumption_unit: 'UI', units_per_package: 100 })
    .select('id').single<{ id: string }>()
  expect(e4).toBeNull()
  idToxinaD3 = p4!.id
  expect((await db().rpc('estoque_entrada', {
    p_produto: idToxinaD3, p_unidade: rede.branchId, p_quantidade: 8, p_custo: 900, p_observacao: null,
    p_lote: null, p_validade: null, p_autor: 'e2e',
  })).error).toBeNull()
  expect((await db().from('stock_movements').insert({
    branch_id: rede.branchId, product_id: idToxinaD3, type: 'PROCEDURE_USAGE', quantity: -20, balance_after: 780,
    unit_cost: 9, created_by: 'e2e', notes: 'Atendimento',
  })).error).toBeNull()
  expect((await db().from('branch_product_stock').update({ current_stock: 8, current_rendimento: 780 })
    .eq('product_id', idToxinaD3).eq('branch_id', rede.branchId)).error).toBeNull()
  // Um consumo de 32 UI (a baixa do lote é o gatilho), e os mínimos: toxina 3 frascos, sérum 2.
  const consumo = await db().from('stock_movements').insert({
    branch_id: rede.branchId, product_id: idToxina, type: 'PROCEDURE_USAGE', quantity: -32, balance_after: 268,
    unit_cost: 6.5, created_by: 'e2e', notes: 'Atendimento',
  })
  expect(consumo.error).toBeNull()
  expect((await db().from('branch_product_stock').update({ current_stock: 3, current_rendimento: 268, min_stock: 3 })
    .eq('product_id', idToxina).eq('branch_id', rede.branchId)).error).toBeNull()
  expect((await db().from('branch_product_stock').update({ min_stock: 2 })
    .eq('product_id', idSerum).eq('branch_id', rede.branchId)).error).toBeNull()

  estoquista = await criarMembro(`etlm${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Estoque', permissoes: [{ modulo: 'stock', nivel: 'MANAGE' }],
  })
})

test.afterAll(async () => {
  const falhas: string[] = []
  const ids = [idToxina, idSerum, idAcido, idToxinaD3].filter(Boolean)
  if (ids.length) {
    for (const tabela of ['product_batches', 'stock_movements', 'branch_product_stock']) {
      const r = await db().from(tabela).delete().in('product_id', ids)
      if (r.error) falhas.push(`${tabela}: ${r.error.message}`)
    }
    await db().from('domain_events').delete().in('entidade_id', ids)
    const r = await db().from('products').delete().in('id', ids)
    if (r.error) falhas.push(`produtos: ${r.error.message}`)
  }
  await estoquista?.limpar()
  await rede?.limpar()
  expect(falhas).toEqual([])
})

test.describe.serial('a tela de estoque', () => {
  test('o saldo na unidade de consumo, "No mínimo" quando é igual, e sem "TOTAL REDE" na unidade (J-43, J-44)', async ({ browser }) => {
    await como(browser, async p => {
      await p.goto(`/${slug}/estoque`)
      const linhaToxina = p.getByRole('row').filter({ hasText: toxina }).first()
      await expect(linhaToxina).toBeVisible()
      await expect(linhaToxina.getByText('268 UI').first(), 'o rendimento, não "3 frasco"').toBeVisible()
      await expect(linhaToxina.getByText('2,68 frasco').first()).toBeVisible()
      await expect(linhaToxina.getByText(/abaixo do mín/i).first(), '268 UI < 300 UI').toBeVisible()

      const linhaSerum = p.getByRole('row').filter({ hasText: serum }).first()
      await expect(linhaSerum.getByText(/no mínimo/i).first(), '2 un com mínimo de 2').toBeVisible()
      await expect(linhaSerum.getByText(/abaixo do mín/i)).toHaveCount(0)

      await expect(p.getByRole('columnheader', { name: /TOTAL REDE/ }), 'a unidade não é a rede').toHaveCount(0)
    })
  })

  test('o cartão da validade diz qual produto, e a linha aberta mostra lote, validade e custo (J-45)', async ({ browser }) => {
    await como(browser, async p => {
      await p.goto(`/${slug}/estoque`)
      const cartao = p.locator('[data-kpi="validade"]')
      await expect(cartao).toContainText(toxina)
      await expect(cartao).toContainText(serum)

      await p.getByRole('row').filter({ hasText: toxina }).first().click()
      const lotes = p.locator('[data-lotes-do-produto]').filter({ hasText: lote })
      await expect(lotes).toBeVisible()
      await expect(lotes).toContainText(diaBR(emDias(20)))
      await expect(lotes).toContainText('R$ 650,00')

      await p.getByRole('row').filter({ hasText: serum }).first().click()
      const semNumero = p.locator('[data-lotes-do-produto]').filter({ hasText: diaBR(emDias(25)) })
      await expect(semNumero, 'a validade da entrada sem número de lote ficou').toBeVisible()
    })
  })

  test('a validade só no dia aparece no dia gravado: a linha, a perda e o histórico (D1)', async ({ browser }) => {
    await como(browser, async p => {
      await p.goto(`/${slug}/estoque`)
      await p.getByRole('row').filter({ hasText: acido }).first().click()
      const linha = p.locator('[data-lotes-do-produto]').filter({ hasText: loteD1 })
      await expect(linha, 'a linha do lote diz o dia digitado, não a véspera').toContainText(`vence ${validadeD1NaTela}`)

      await p.getByRole('row').filter({ hasText: acido }).first().getByTitle('Gerenciar estoque').click()
      const modal = p.locator('dialog[open]').filter({ hasText: 'Gerenciar estoque' })
      await modal.getByRole('button', { name: 'Perda', exact: true }).click()
      await expect(modal.getByLabel('Lote').locator('option', { hasText: loteD1 }),
        'o seletor de lote da perda diz o dia digitado').toContainText(`vence ${validadeD1NaTela}`)

      await modal.getByRole('button', { name: 'Histórico' }).click()
      await expect(modal.locator('[data-movimento]').filter({ hasText: 'Entrada' }),
        'o histórico diz o dia digitado').toContainText(`val. ${validadeD1NaTela}`)
    })
  })

  // D3 da 7ª simulação: a toxina tinha 780 U (7,8 frascos), o Ajuste mostrava
  // "Estoque atual 8 un", a Tânia contou 7,7 e ficou 750 U — o banco tirava
  // os 20 U do frasco aberto da contagem. Sumiram 20 U (R$ 180).
  test('o ajuste mostra o saldo em UI e em frascos e conta em UI ou em frascos, dizendo a conta antes (D3)', async ({ browser }) => {
    const saldo = async () => (await db().from('branch_product_stock').select('current_stock, current_rendimento')
      .eq('product_id', idToxinaD3).eq('branch_id', rede!.branchId).single<{ current_stock: number; current_rendimento: number }>()).data!
    await como(browser, async p => {
      await p.goto(`/${slug}/estoque`)
      await p.getByRole('row').filter({ hasText: toxinaD3 }).first().getByTitle('Gerenciar estoque').click()
      const modal = p.locator('dialog[open]').filter({ hasText: 'Gerenciar estoque' })
      await modal.getByRole('button', { name: 'Ajuste', exact: true }).click()
      await expect(modal.locator('[data-saldo-do-ajuste]'), 'o saldo em consumo e em embalagens').toContainText('780 UI')
      await expect(modal.locator('[data-saldo-do-ajuste]')).toContainText('7,8 frasco')

      // Em frascos: 7,7 frascos são 770 UI — a tela diz ANTES de aplicar.
      await modal.getByRole('group', { name: 'Contar em' }).getByRole('button', { name: 'frasco', exact: true }).click()
      await modal.getByLabel('Contagem').fill('7,7')
      await expect(modal.locator('[data-ajuste-equivale]')).toContainText('7,7 frasco = 770 UI')
      await expect(modal.locator('[data-ajuste-equivale]')).toContainText('frasco aberto')
      await modal.getByLabel('Motivo').fill('Inventário')
      await modal.getByRole('checkbox').check()
      await modal.getByRole('button', { name: 'Aplicar ajuste' }).click()
      await expect.poll(saldo, 'contou 7,7 frascos: 770 UI, não 750').toEqual({ current_stock: 8, current_rendimento: 770 })
    })
    await como(browser, async p => {
      // Em UI: a contagem exata.
      await p.goto(`/${slug}/estoque`)
      await p.getByRole('row').filter({ hasText: toxinaD3 }).first().getByTitle('Gerenciar estoque').click()
      const modal = p.locator('dialog[open]').filter({ hasText: 'Gerenciar estoque' })
      await modal.getByRole('button', { name: 'Ajuste', exact: true }).click()
      await expect(modal.locator('[data-saldo-do-ajuste]')).toContainText('770 UI')
      await modal.getByLabel('Contagem').fill('765')
      await expect(modal.locator('[data-ajuste-equivale]')).toContainText('765 UI = 7,65 frasco')
      await modal.getByLabel('Motivo').fill('Inventário')
      await modal.getByRole('checkbox').check()
      await modal.getByRole('button', { name: 'Aplicar ajuste' }).click()
      await expect.poll(saldo).toEqual({ current_stock: 8, current_rendimento: 765 })
    })
    const { data: movs } = await db().from('stock_movements').select('quantity, balance_after')
      .eq('product_id', idToxinaD3).eq('type', 'MANUAL_ADJUSTMENT').order('created_at')
    expect((movs ?? []).map(m => [Number(m.quantity), Number(m.balance_after)]), 'o movimento em UI').toEqual([[-10, 770], [-5, 765]])
  })

  test('o histórico diz a unidade e a embalagem de cada movimento, o lote e o custo (J-44, J-45)', async ({ browser }) => {
    await como(browser, async p => {
      await p.goto(`/${slug}/estoque`)
      await p.getByRole('row').filter({ hasText: toxina }).first().getByTitle('Gerenciar estoque').click()
      const modal = p.locator('dialog[open]').filter({ hasText: 'Gerenciar estoque' })
      await modal.getByRole('button', { name: 'Histórico' }).click()
      const consumo = modal.locator('[data-movimento]').filter({ hasText: 'Consumo em atendimento' })
      await expect(consumo).toContainText('-32 UI')
      await expect(consumo).toContainText('0,32 frasco')
      await expect(consumo).toContainText(lote)
      const compra = modal.locator('[data-movimento]').filter({ hasText: 'Entrada' })
      await expect(compra).toContainText('+300 UI')
      await expect(compra).toContainText('3 frasco')
      await expect(compra).toContainText(lote)
      await expect(compra).toContainText('R$ 650,00')
    })
  })
})
