import { test, expect, type Page } from '@playwright/test'
import { banco, filiaisAtivas, nomeDeTeste } from './apoio/banco'

/**
 * Transferência e ajuste de estoque pela tela, e os dois eventos de estoque
 * que saem de GATILHO (CLAUDE.md §9.9).
 *
 * Até 2026-09-27 só a criação de produto tinha teste. E `estoque.abaixo_do_
 * minimo` nunca tinha disparado num teste: o spec de notificações inseria o
 * evento à mão, pulando o gatilho que deveria criá-lo.
 *
 * O saldo mora em `branch_product_stock`, por unidade. O cenário: produto nasce
 * com 7 na unidade A; transfere 3 para B; B é ajustada para 5; depois o mínimo
 * de A sobe para acima do saldo — e o alerta tem de nascer, uma vez.
 */

const nome = nomeDeTeste('Produto movimentos')
let produto: string | null = null

test.afterAll(async () => {
  if (!produto) return
  const db = banco()
  await db.from('product_batches').delete().eq('product_id', produto)
  await db.from('stock_movements').delete().eq('product_id', produto)
  await db.from('branch_product_stock').delete().eq('product_id', produto)
  await db.from('domain_events').delete().eq('entidade_id', produto)
  await db.from('financial_transactions').delete().ilike('description', `%${nome}%`)
  await db.from('products').delete().eq('id', produto)
})

async function abrirGerenciar(page: Page) {
  await page.goto('/admin/estoque')
  await page.locator('tr, [role="row"], div').filter({ hasText: nome })
    .filter({ has: page.getByTitle('Gerenciar estoque') }).last()
    .getByTitle('Gerenciar estoque').click()
  return page.locator('dialog[open]').filter({ hasText: 'Gerenciar estoque' })
}

async function saldo(branchId: string): Promise<number> {
  const { data } = await banco().from('branch_product_stock').select('current_stock')
    .eq('product_id', produto!).eq('branch_id', branchId).maybeSingle()
  return Number(data?.current_stock ?? NaN)
}

test('transferir, ajustar e o alerta de mínimo — com os eventos do gatilho', async ({ page }) => {
  const db = banco()
  const unidades = await filiaisAtivas()
  test.skip(unidades.length < 2, 'transferência precisa de duas unidades')
  const [a, b] = [unidades[0]!, unidades[1]!]

  // -- Nasce com 7 em A --------------------------------------------------------
  await page.goto('/admin/estoque')
  await page.getByRole('button', { name: 'Novo produto' }).click()
  const novo = page.locator('dialog[open]')
  await novo.locator('input[name="name"]').fill(nome)
  await novo.getByText('Adicionar estoque inicial').click()
  await novo.locator('select[name="_branchId"]').selectOption(a.id)
  await novo.locator('input[name="initial_qty"]').fill('7')
  await novo.getByRole('button', { name: 'Criar produto' }).click()
  await expect(novo).toBeHidden()
  await expect.poll(async () => {
    const { data } = await db.from('products').select('id').eq('name', nome).maybeSingle()
    produto = (data?.id as string) ?? null
    return produto
  }).not.toBeNull()
  await expect.poll(() => saldo(a.id)).toBe(7)

  // -- Transfere 3 de A para B -------------------------------------------------
  let modal = await abrirGerenciar(page)
  await modal.getByRole('button', { name: 'Transferência' }).click()
  await modal.locator('select[name="fromBranchId"]').selectOption(a.id)
  await modal.locator('select[name="toBranchId"]').selectOption(b.id)
  await modal.locator('input[name="quantity"]').last().fill('3')
  await modal.getByRole('button', { name: 'Confirmar transferência' }).click()
  await expect.poll(() => saldo(a.id), { message: 'A perde 3' }).toBe(4)
  expect(await saldo(b.id), 'B ganha 3').toBe(3)

  const { data: transf } = await db.from('stock_movements')
    .select('type, quantity, balance_after, branch_id, reference').eq('product_id', produto!)
    .in('type', ['TRANSFER_OUT', 'TRANSFER_IN'])
  const saida   = transf!.find(m => m.type === 'TRANSFER_OUT')!
  const entrada = transf!.find(m => m.type === 'TRANSFER_IN')!
  expect([saida.branch_id, Number(saida.quantity), Number(saida.balance_after)]).toEqual([a.id, -3, 4])
  expect([entrada.branch_id, Number(entrada.quantity), Number(entrada.balance_after)]).toEqual([b.id, 3, 3])
  expect(saida.reference, 'as duas pernas da transferência se reconhecem').toBe(entrada.reference)

  // -- Ajusta B para 5 ---------------------------------------------------------
  modal = await abrirGerenciar(page)
  await modal.getByRole('button', { name: 'Ajuste' }).click()
  await modal.locator('select[name="branchId"]').last().selectOption(b.id)
  await modal.locator('input[name="new_quantity"]').fill('5')
  await modal.locator('textarea[name="reason"]').fill('[e2e] contagem física')
  await modal.getByText(/Confirmo que o novo valor/).click()
  await modal.getByRole('button', { name: 'Aplicar ajuste' }).click()
  await expect.poll(() => saldo(b.id), { message: 'o ajuste fixa o saldo' }).toBe(5)
  const { data: ajuste } = await db.from('stock_movements').select('quantity, balance_after, notes')
    .eq('product_id', produto!).eq('type', 'MANUAL_ADJUSTMENT').single()
  expect([Number(ajuste!.quantity), Number(ajuste!.balance_after), ajuste!.notes]).toEqual([2, 5, '[e2e] contagem física'])

  // -- Cada movimento vira `estoque.movimentado`, pelo gatilho -----------------
  await expect.poll(async () => {
    const { count } = await db.from('domain_events').select('id', { count: 'exact', head: true })
      .eq('entidade_id', produto!).eq('nome', 'estoque.movimentado')
    return count
  }, { message: 'entrada inicial + 2 pernas da transferência + ajuste' }).toBe(4)

  // -- Mínimo acima do saldo em A: o alerta nasce, e uma vez só ----------------
  await db.from('branch_product_stock').update({ min_stock: 10 }).eq('product_id', produto!).eq('branch_id', a.id)
  await db.from('branch_product_stock').update({ min_stock: 12 }).eq('product_id', produto!).eq('branch_id', a.id)
  const { data: alertas } = await db.from('domain_events').select('dados')
    .eq('entidade_id', produto!).eq('nome', 'estoque.abaixo_do_minimo')
  expect(alertas, 'o alerta dispara na TRAVESSIA — subir o mínimo de novo não repete').toHaveLength(1)
  const dados = alertas![0]!.dados as { saldo: number; minimo: number }
  expect([Number(dados.saldo), Number(dados.minimo)]).toEqual([4, 10])
})
