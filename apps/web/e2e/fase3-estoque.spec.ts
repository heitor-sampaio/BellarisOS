import { test, expect } from '@playwright/test'
import { banco, filiaisAtivas, nomeDeTeste } from './apoio/banco'

/**
 * Produto novo com estoque inicial, cadastrado pela rede.
 *
 * O defeito que isto guarda era mudo: quem é da rede preenchia quantidade,
 * custo, lote e validade, salvava, recebia "sucesso" — e o produto nascia sem
 * movimento, sem saldo na unidade, sem lote e sem a despesa, porque a gravação
 * dependia de um `ctx.branchId` que a rede não tem. Agora a unidade é
 * perguntada no formulário, e é isso que as asserções conferem.
 */

const nomeProduto = nomeDeTeste('Produto')
const QTD   = 7
const CUSTO = 12.5

let productId: string | null = null

test.afterAll(async () => {
  const db = banco()
  if (!productId) return
  await db.from('product_batches').delete().eq('product_id', productId)
  await db.from('stock_movements').delete().eq('product_id', productId)
  await db.from('branch_product_stock').delete().eq('product_id', productId)
  await db.from('financial_transactions').delete().ilike('description', `%${nomeProduto}%`)
  await db.from('products').delete().eq('id', productId)
})

test('produto com estoque inicial grava movimento, saldo, lote e despesa', async ({ page }) => {
  const db = banco()
  const unidades = await filiaisAtivas()
  const unidade  = unidades[0]!

  await page.goto('/admin/estoque')
  await page.getByRole('button', { name: 'Novo produto' }).click()

  const dialogo = page.locator('dialog[open]')
  await dialogo.locator('input[name="name"]').fill(nomeProduto)
  await dialogo.getByText('Adicionar estoque inicial').click()

  // A unidade que recebe o estoque é perguntada aqui — sem ela, o lançamento
  // inteiro era descartado em silêncio.
  await dialogo.locator('select[name="_branchId"]').selectOption(unidade.id)
  await dialogo.locator('input[name="initial_qty"]').fill(String(QTD))
  await dialogo.locator('input[name="initial_cost"]').fill(String(CUSTO))
  await dialogo.locator('input[name="initial_batch"]').fill('LOT-E2E')
  await dialogo.getByRole('button', { name: 'Criar produto' }).click()
  await expect(dialogo).toBeHidden()

  // -- Produto ---------------------------------------------------------------
  await expect.poll(async () => {
    const { data } = await db.from('products').select('id').eq('name', nomeProduto).maybeSingle()
    productId = (data?.id as string) ?? null
    return productId
  }, { message: 'o produto deveria ter sido criado' }).not.toBeNull()

  // -- Movimento de entrada --------------------------------------------------
  const { data: movs } = await db
    .from('stock_movements')
    .select('type, quantity, branch_id')
    .eq('product_id', productId!)
  expect(movs, 'o estoque inicial precisa virar movimento — currentStock nunca muda sozinho').toHaveLength(1)
  expect(Number(movs![0]!.quantity)).toBe(QTD)
  expect(movs![0]!.branch_id).toBe(unidade.id)

  // -- Saldo na unidade escolhida -------------------------------------------
  const { data: saldo } = await db
    .from('branch_product_stock')
    .select('branch_id, current_stock')
    .eq('product_id', productId!)
    .eq('branch_id', unidade.id)
    .maybeSingle()
  expect(saldo, 'o saldo deveria existir na unidade escolhida').not.toBeNull()
  expect(Number(saldo!.current_stock)).toBe(QTD)

  // -- Lote ------------------------------------------------------------------
  const { data: lotes } = await db
    .from('product_batches').select('batch_number').eq('product_id', productId!)
  expect(lotes?.map(l => l.batch_number)).toContain('LOT-E2E')

  // -- Despesa da compra -----------------------------------------------------
  const { data: despesas } = await db
    .from('financial_transactions')
    .select('type, amount, branch_id')
    .ilike('description', `%${nomeProduto}%`)
  expect(despesas, 'a compra do estoque inicial deveria virar despesa').not.toHaveLength(0)
  expect(despesas![0]!.type).toBe('EXPENSE')
  expect(Number(despesas![0]!.amount)).toBeCloseTo(QTD * CUSTO, 2)
  expect(despesas![0]!.branch_id).toBe(unidade.id)
})
