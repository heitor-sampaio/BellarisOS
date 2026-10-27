import { test, expect } from '@playwright/test'
import { banco, nomeDeTeste } from './apoio/banco'

/**
 * O preço do procedimento é lido como os outros campos de dinheiro: digitar
 * "180" é R$ 180,00 (D10, simulação de 2026-10-27 — antes era uma máscara de
 * centavos e "180" gravava R$ 1,80, sem aviso).
 */
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
