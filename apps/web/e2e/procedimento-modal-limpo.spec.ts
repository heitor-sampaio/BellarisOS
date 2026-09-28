import { test, expect } from '@playwright/test'
import { banco, nomeDeTeste } from './apoio/banco'

/**
 * Depois de criar um procedimento, "Novo procedimento" abre o formulário VAZIO.
 *
 * O diálogo só se esconde ao fechar — não desmonta —, e o formulário guardava
 * os campos digitados e o "Procedimento criado com sucesso." da vez anterior.
 * Visto pelo Heitor em produção (2026-09-28). A modal agora monta um
 * formulário novo a cada abertura (`key` em `procedure-modal.tsx`).
 */
const nome = nomeDeTeste('Proc modal')
let procedureId: string | null = null

test.afterAll(async () => {
  const db = banco()
  const { data } = await db.from('procedures').select('id').eq('name', nome).maybeSingle<{ id: string }>()
  procedureId = data?.id ?? procedureId
  if (!procedureId) return
  const falhas: string[] = []
  for (const [o, r] of [
    ['eventos',      await db.from('domain_events').delete().eq('entidade_id', procedureId)],
    ['histórico',    await db.from('procedure_price_history').delete().eq('procedure_id', procedureId)],
    ['unidades',     await db.from('procedure_branch_availability').delete().eq('procedure_id', procedureId)],
    ['procedimento', await db.from('procedures').delete().eq('id', procedureId)],
  ] as const) if (r.error) falhas.push(`${o}: ${r.error.message}`)
  expect(falhas).toEqual([])
})

test('criar e abrir de novo: o formulário volta vazio, sem o aviso da vez anterior', async ({ page }) => {
  await page.goto('/admin/procedures')
  await page.getByRole('button', { name: 'Novo procedimento' }).click()
  const dialogo = page.locator('dialog[open]')
  await dialogo.locator('input[name="name"]').fill(nome)
  await dialogo.locator('select[name="category"]').selectOption('Outros')
  await dialogo.locator('input[name="duration_min"]').fill('45')
  await dialogo.locator('input[name="price"]').fill('300,00')
  await dialogo.getByRole('button', { name: 'Criar procedimento' }).click()
  await expect(dialogo).toBeHidden()

  await page.getByRole('button', { name: 'Novo procedimento' }).click()
  const deNovo = page.locator('dialog[open]')
  await expect(deNovo).toBeVisible()
  await expect(deNovo.locator('input[name="name"]')).toHaveValue('')
  await expect(deNovo.locator('input[name="duration_min"]')).not.toHaveValue('45')
  await expect(deNovo.getByText('Procedimento criado com sucesso.')).toHaveCount(0)
  await expect(deNovo.getByRole('button', { name: 'Criar procedimento' })).toBeEnabled()
})
