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
const emDias = (n: number) => new Date(Date.now() + n * 86_400_000)
const diaBR = (d: Date) => d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })

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
    p_lote: lote, p_validade: emDias(20).toISOString(), p_autor: 'e2e',
  })
  expect(entrada.error).toBeNull()
  // 2 séruns com validade e SEM número de lote: a validade tem de ficar.
  const entrada2 = await db().rpc('estoque_entrada', {
    p_produto: idSerum, p_unidade: rede.branchId, p_quantidade: 2, p_custo: 60, p_observacao: null,
    p_lote: null, p_validade: emDias(25).toISOString(), p_autor: 'e2e',
  })
  expect(entrada2.error).toBeNull()
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
  const ids = [idToxina, idSerum].filter(Boolean)
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
