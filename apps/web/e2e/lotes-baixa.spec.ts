import { test, expect, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * Os lotes são DA UNIDADE e BAIXAM com o consumo (migration 20260928000001).
 *
 * Até 2026-09-28:
 *  - `product_batches` não tinha `branch_id`, e a entrada de estoque gravava
 *    um — toda entrada COM número de lote falhava (depois de já ter gravado o
 *    movimento e o saldo);
 *  - o lote nunca baixava: o alerta de "vencendo" contava o que já tinha sido
 *    usado.
 *
 * A baixa é gatilho (`trg_lote_do_movimento`), FEFO entre os não vencidos, e
 * cada baixa deixa a ligação em `stock_movement_batches`.
 *
 * Numa rede `[e2e]` com duas unidades, pela tela de estoque da rede.
 */

const marca = Date.now().toString(36)
const db = () => banco()
const dia = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString().slice(0, 10)

interface Fx { outra: OutraRede; unidadeA: string; gestor: MembroDeTeste; produto: string; nome: string }
let f: Fx | null = null
const criado: { outra?: OutraRede; unidadeA?: string; membros: MembroDeTeste[] } = { membros: [] }

test.beforeAll(async () => {
  const outra = await criarOutraRede(`lote${marca}`)
  criado.outra = outra
  const { data: a, error } = await db().from('branches')
    .insert({ tenant_id: outra.tenantId, name: `${PREFIXO} Unidade A ${marca}`, slug: `e2e-lotea-${marca}` })
    .select('id').single<{ id: string }>()
  expect(error).toBeNull()
  criado.unidadeA = a!.id
  const gestor = await criarMembro(`lote${marca}`, {
    tenant: outra.tenantId, rotulo: 'Estoque', permissoes: [{ modulo: 'stock', nivel: 'MANAGE' }],
  })
  criado.membros.push(gestor)
  const produto = await outra.criarProduto('lotes', 0)
  const { data: pr } = await db().from('products').select('name').eq('id', produto).single()
  f = { outra, unidadeA: a!.id, gestor, produto, nome: pr!.name as string }
})

test.afterAll(async () => {
  if (!criado.outra) return
  const b = db()
  const falhas: string[] = []
  const olhar = (o: string, r: { error: { message: string } | null }) => { if (r.error) falhas.push(`${o}: ${r.error.message}`) }
  for (const m of criado.membros) await m.limpar()
  // Os produtos avulsos deste teste (o de rendimento) não passam pelo limpar().
  const { data: prods } = await b.from('products').select('id').eq('tenant_id', criado.outra.tenantId)
  const ids = (prods ?? []).map(p => p.id as string)
  if (ids.length) {
    olhar('lotes', await b.from('product_batches').delete().in('product_id', ids))
    olhar('movimentos', await b.from('stock_movements').delete().in('product_id', ids))
    olhar('saldos', await b.from('branch_product_stock').delete().in('product_id', ids))
    olhar('eventos', await b.from('domain_events').delete().in('entidade_id', ids))
    olhar('despesas', await b.from('financial_transactions').delete().in('branch_id', [criado.outra.branchId, criado.unidadeA!]))
    olhar('produtos', await b.from('products').delete().in('id', ids))
  }
  // A rede inteira, com a unidade A (e2e_apagar_rede); na completa, no fim da rodada (F25).
  await criado.outra.limpar()
  expect(falhas).toEqual([])
})

async function abrirGerenciar(page: Page) {
  await page.goto('/admin/estoque')
  await page.locator('tr, [role="row"], div').filter({ hasText: f!.nome })
    .filter({ has: page.getByTitle('Gerenciar estoque') }).last()
    .getByTitle('Gerenciar estoque').click()
  return page.locator('dialog[open]').filter({ hasText: 'Gerenciar estoque' })
}

/** Os lotes do produto, por número: unidade e quantidade. */
async function lotes(produto: string) {
  const { data } = await db().from('product_batches').select('batch_number, branch_id, quantity, expires_at')
    .eq('product_id', produto).order('batch_number')
  return (data ?? []).map(l => ({ lote: l.batch_number, unidade: l.branch_id, qtd: Number(l.quantity), vence: l.expires_at }))
}

test.describe.serial('lotes por unidade', () => {
  test('entrada com lote grava o lote NA UNIDADE (antes falhava a entrada inteira)', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: f!.gestor.estado })
    const page = await ctx.newPage()
    try {
      for (const [lote, qtd, vence] of [['L1-LONGE', 5, dia(90)], ['L2-PERTO', 3, dia(20)], ['L3-VENCIDO', 2, dia(-5)]] as const) {
        const modal = await abrirGerenciar(page)
        await modal.getByRole('button', { name: 'Entrada', exact: true }).click()
        await modal.locator('select[name="branchId"]').first().selectOption(f!.outra.branchId)
        await modal.locator('input[name="quantity"]').first().fill(String(qtd))
        await modal.locator('input[name="batch_number"]').fill(lote)
        await modal.locator('input[name="expires_at"]').fill(vence)
        await modal.getByRole('button', { name: 'Registrar entrada' }).click()
        await expect(modal).toBeHidden()
      }
    } finally { await ctx.close() }
    expect((await lotes(f!.produto)).map(l => [l.lote, l.unidade, l.qtd])).toEqual([
      ['L1-LONGE', f!.outra.branchId, 5], ['L2-PERTO', f!.outra.branchId, 3], ['L3-VENCIDO', f!.outra.branchId, 2],
    ])
  })

  test('ajuste para baixo baixa FEFO entre os não vencidos; o vencido fica', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: f!.gestor.estado })
    const page = await ctx.newPage()
    try {
      const modal = await abrirGerenciar(page)
      await modal.getByRole('button', { name: 'Ajuste' }).click()
      await modal.locator('select[name="branchId"]').last().selectOption(f!.outra.branchId)
      await modal.locator('input[name="new_quantity"]').fill('6')   // 10 → 6: saem 4
      await modal.locator('textarea[name="reason"]').fill('[e2e] contagem')
      // A49 da 11ª: a confirmação é "Confirmo que contei na prateleira." (era "Confirmo que o novo valor…").
      await modal.getByText('Confirmo que contei na prateleira.', { exact: true }).click()
      await modal.getByRole('button', { name: 'Aplicar ajuste' }).click()
      await expect(modal).toBeHidden()
    } finally { await ctx.close() }
    // O que vence primeiro (L2, 3) sai inteiro; o resto (1) do L1. O vencido não é tocado.
    expect((await lotes(f!.produto)).map(l => [l.lote, l.qtd])).toEqual([['L1-LONGE', 4], ['L2-PERTO', 0], ['L3-VENCIDO', 2]])
    const { data: ajuste } = await db().from('stock_movements').select('id').eq('product_id', f!.produto).eq('type', 'MANUAL_ADJUSTMENT').single()
    const { data: ligacoes } = await db().from('stock_movement_batches').select('quantity').eq('movement_id', ajuste!.id)
    expect((ligacoes ?? []).map(l => Number(l.quantity)).sort(), 'a baixa diz de qual lote saiu').toEqual([1, 3])
  })

  test('transferência leva o lote: sai da origem e chega no destino com o mesmo número e validade', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: f!.gestor.estado })
    const page = await ctx.newPage()
    try {
      const modal = await abrirGerenciar(page)
      await modal.getByRole('button', { name: 'Transferência' }).click()
      await modal.locator('select[name="fromBranchId"]').selectOption(f!.outra.branchId)
      await modal.locator('select[name="toBranchId"]').selectOption(f!.unidadeA)
      await modal.locator('input[name="quantity"]').last().fill('3')
      await modal.getByRole('button', { name: 'Confirmar transferência' }).click()
      await expect(modal).toBeHidden()
    } finally { await ctx.close() }
    const todos = await lotes(f!.produto)
    const l1 = todos.filter(l => l.lote === 'L1-LONGE')
    expect(l1.map(l => [l.unidade, l.qtd]).sort()).toEqual([[f!.outra.branchId, 1], [f!.unidadeA, 3]].sort())
    expect(new Set(l1.map(l => l.vence)).size, 'mesma validade dos dois lados').toBe(1)
  })

  test('consumo no atendimento em unidade de consumo baixa em embalagens', async () => {
    // O consumo do atendimento grava em ml quando o produto tem rendimento; o
    // lote conta embalagens. Direto no banco: é o gatilho que está em prova, e
    // é o mesmo insert que `finishSession` faz.
    const b = db()
    const { data: p } = await b.from('products').insert({
      tenant_id: f!.outra.tenantId, name: `${PREFIXO} toxina ${marca}`, unit: 'frasco',
      units_per_package: 100, consumption_unit: 'UI',
    }).select('id').single<{ id: string }>()
    await b.from('product_batches').insert({ product_id: p!.id, branch_id: f!.outra.branchId, batch_number: 'TX-1', expires_at: dia(60), quantity: 2 })
    const { error } = await b.from('stock_movements').insert({
      branch_id: f!.outra.branchId, product_id: p!.id, type: 'PROCEDURE_USAGE', quantity: -50, balance_after: 150, created_by: f!.gestor.userId,
    })
    expect(error).toBeNull()
    expect((await lotes(p!.id)).map(l => l.qtd), '50 UI de frascos de 100 UI = meio frasco').toEqual([1.5])
  })

  // D5 e D7 da 33ª simulação.
  test('o lote que entra cobre a falta que ficou sem lote, e o consumo nasce com o custo dos lotes (sem "Corrigiu o custo")', async ({ browser }) => {
    // O ácido (frasco de 10 ml) acaba no meio do atendimento: 2 ml do AM1 e 2 ml
    // sem lote, o saldo em −2 ml. A entrada do AM2 (1 frasco) leva o saldo a 8 ml
    // — e o AM2 tem de ficar com 8 ml, não 10 (ES-20; princípio 3). Os consumos
    // direto no banco, o mesmo insert que `finishSession` faz.
    const b = db()
    const nome = `${PREFIXO} ácido ${marca}`
    const { data: p, error: eP } = await b.from('products').insert({
      tenant_id: f!.outra.tenantId, name: nome, unit: 'frasco', units_per_package: 10, consumption_unit: 'ml',
    }).select('id').single<{ id: string }>()
    expect(eP).toBeNull()
    const entrada = async (lote: string, vence: string) => expect((await b.rpc('estoque_entrada', {
      p_produto: p!.id, p_unidade: f!.outra.branchId, p_quantidade: 1, p_custo: 100, p_observacao: null,
      p_lote: lote, p_validade: vence, p_autor: 'e2e',
    })).error).toBeNull()
    const consumo = async (ml: number, saldo: number) => {
      const { data: m, error } = await b.from('stock_movements').insert({
        branch_id: f!.outra.branchId, product_id: p!.id, type: 'PROCEDURE_USAGE', quantity: -ml, balance_after: saldo,
        unit_cost: 12, created_by: f!.gestor.userId,
      }).select('id').single<{ id: string }>()
      expect(error).toBeNull()
      // As embalagens para longe do zero (lib/estoque/baixa.ts): 2 ml = 1 frasco aberto; −2 ml = −1.
      expect((await b.from('branch_product_stock').update({ current_rendimento: saldo, current_stock: saldo >= 0 ? Math.ceil(saldo / 10) : Math.floor(saldo / 10) })
        .eq('product_id', p!.id).eq('branch_id', f!.outra.branchId)).error).toBeNull()
      return m!.id
    }
    const custo = async (id: string) => Number((await b.from('stock_movements').select('unit_cost').eq('id', id).single<{ unit_cost: number }>()).data!.unit_cost)
    const ligacoes = async (id: string) => ((await b.from('stock_movement_batches').select('quantity').eq('movement_id', id)).data ?? []).map(l => Number(l.quantity))

    await entrada('AM1', dia(60))                      // 10 ml a R$ 10/ml
    const c1 = await consumo(8, 2)
    expect(await custo(c1), 'os 8 ml saíram do AM1').toBe(10)
    const c2 = await consumo(4, -2)
    expect(await ligacoes(c2), 'o AM1 cobriu 2 ml (0,2 frasco)').toEqual([0.2])
    expect(await custo(c2), '2 ml do AM1 a R$ 10 e 2 ml sem lote a R$ 12').toBe(11)
    // D7: o custo veio no insert — nenhuma edição do movimento na Auditoria.
    const { count, error: eA } = await b.from('auditoria').select('id', { count: 'exact', head: true })
      .eq('tabela', 'stock_movements').in('registro_id', [c1, c2]).eq('operacao', 'editou')
    expect(eA).toBeNull()
    expect(count, 'ninguém corrigiu o custo').toBe(0)

    await entrada('AM2', dia(120))
    expect((await lotes(p!.id)).map(l => [l.lote, l.qtd]), 'o AM2 cobriu os 2 ml que faltavam: fica com 8 ml').toEqual([['AM1', 0], ['AM2', 0.8]])
    const { data: compra } = await b.from('stock_movements').select('id').eq('product_id', p!.id).eq('type', 'PURCHASE')
      .order('created_at', { ascending: false }).limit(1).single<{ id: string }>()
    expect(await ligacoes(compra!.id), 'a ligação diz o que entrou no lote (o "Desfazer entrada" confere por ela)').toEqual([0.8])
    const { data: s } = await b.from('branch_product_stock').select('current_stock, current_rendimento')
      .eq('product_id', p!.id).eq('branch_id', f!.outra.branchId).single()
    expect([Number(s!.current_stock), Number(s!.current_rendimento)], '8 ml = 1 frasco aberto (não "0 frasco")').toEqual([1, 8])

    // O Histórico diz o que cada lote cobriu.
    const ctx = await browser.newContext({ storageState: f!.gestor.estado })
    const page = await ctx.newPage()
    try {
      await page.goto('/admin/estoque')
      await page.locator('tr, [role="row"], div').filter({ hasText: nome })
        .filter({ has: page.getByTitle('Gerenciar estoque') }).last()
        .getByTitle('Gerenciar estoque').click()
      const modal = page.locator('dialog[open]').filter({ hasText: 'Gerenciar estoque' })
      await modal.getByRole('button', { name: 'Histórico' }).click()
      const linhas = modal.locator('[data-lotes-do-movimento]')
      await expect(linhas.filter({ hasText: /Lote AM1 .*: 2 ml · 2 ml sem lote/ })).toHaveCount(1)
      await expect(linhas.filter({ hasText: /Lote AM2 .*: 8 ml · 2 ml cobriram a falta de antes \(sem lote\)/ })).toHaveCount(1)
    } finally { await ctx.close() }
  })
})
