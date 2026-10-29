import { test, expect } from '@playwright/test'
import { banco, nomeDeTeste } from './apoio/banco'

/**
 * O preço do procedimento é lido como os outros campos de dinheiro: digitar
 * "180" é R$ 180,00 (D10, simulação de 2026-10-27 — antes era uma máscara de
 * centavos e "180" gravava R$ 1,80, sem aviso).
 */
test.describe.configure({ mode: 'serial' })

const nome = nomeDeTeste('Proc preco')

test.afterAll(async () => {
  const db = banco()
  const { data } = await db.from('procedures').select('id').eq('name', nome).maybeSingle<{ id: string }>()
  if (!data) return
  const falhas: string[] = []
  for (const [o, r] of [
    ['eventos',      await db.from('domain_events').delete().eq('entidade_id', data.id)],
    ['histórico',    await db.from('procedure_price_history').delete().eq('procedure_id', data.id)],
    ['unidades',     await db.from('procedure_branch_availability').delete().eq('procedure_id', data.id)],
    ['procedimento', await db.from('procedures').delete().eq('id', data.id)],
  ] as const) if (r.error) falhas.push(`${o}: ${r.error.message}`)
  expect(falhas).toEqual([])
})

test('digitar 180 no preço é R$ 180,00, e o custo também', async ({ page }) => {
  await page.goto('/admin/procedures')
  await page.getByRole('button', { name: 'Novo procedimento' }).click()
  const dialogo = page.locator('dialog[open]')
  await dialogo.locator('input[name="name"]').fill(nome)
  await dialogo.locator('select[name="category"]').selectOption('Outros')
  await dialogo.locator('input[name="duration_min"]').fill('45')
  await dialogo.locator('input[name="labor_cost"]').pressSequentially('50')
  await dialogo.locator('input[name="price"]').pressSequentially('180')
  await dialogo.locator('input[name="name"]').click() // tira o foco do preço
  await expect(dialogo.locator('input[name="price"]')).toHaveValue('180,00')
  await expect(dialogo.locator('input[name="labor_cost"]')).toHaveValue('50,00')
  await dialogo.getByRole('button', { name: 'Criar procedimento' }).click()
  await expect(dialogo).toBeHidden()

  const { data } = await banco().from('procedures').select('price, labor_cost').eq('name', nome).single()
  expect(Number(data!.price)).toBe(180)
  expect(Number(data!.labor_cost)).toBe(50)
})

/**
 * D3 (simulação de 2026-10-29): "1.400" no preço da Toxina gravou R$ 1,40.
 * O ponto seguido de três dígitos é milhar; o ambíguo ("0.012") não se
 * adivinha — o campo fica como foi escrito e a tela pede a vírgula.
 */
test('"1.400" no preço é R$ 1.400,00, e o ambíguo é recusado com aviso', async ({ page }) => {
  await page.goto('/admin/procedures')
  // O procedimento do teste anterior: editar o preço dele.
  await page.locator('tr', { hasText: nome }).getByRole('button', { name: 'Editar' }).click()
  const dialogo = page.locator('dialog[open]')
  const preco = dialogo.locator('input[name="price"]')
  await expect(preco).toBeVisible()

  // O ambíguo: fica como foi escrito, o aviso aparece, e não grava.
  await preco.fill('')
  await preco.pressSequentially('0.012')
  await dialogo.locator('input[name="name"]').click()
  await expect(preco).toHaveValue('0.012')
  await expect(dialogo.getByRole('alert').filter({ hasText: 'vírgula para os centavos' })).toBeVisible()
  await dialogo.getByRole('button', { name: 'Salvar alterações' }).click()
  await expect(dialogo).toBeVisible()
  const { data: antes } = await banco().from('procedures').select('price').eq('name', nome).single()
  expect(Number(antes!.price)).toBe(180)

  // "1.400" é mil e quatrocentos — e a tela mostra isso ao sair do campo.
  await preco.fill('')
  await preco.pressSequentially('1.400')
  await dialogo.locator('input[name="name"]').click()
  await expect(preco).toHaveValue('1.400,00')
  await dialogo.getByRole('button', { name: 'Salvar alterações' }).click()
  await expect(dialogo).toBeHidden()
  const { data } = await banco().from('procedures').select('price').eq('name', nome).single()
  expect(Number(data!.price)).toBe(1400)
})
