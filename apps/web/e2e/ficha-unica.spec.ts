import { test, expect } from '@playwright/test'
import { banco } from './apoio/banco'

/**
 * Um construtor de fichas, e a avaliação é um procedimento como outro qualquer.
 *
 * Decisão do Heitor em 2026-09-25: "não precisamos de criação de ficha
 * específica de anamnese, isso pode ser feito pelo construtor universal de
 * fichas. A entidade avaliação deixou de existir e passou a poder ser criada
 * como um procedimento."
 *
 * Eram dois construtores com o mesmo código e dois nomes, e quem cadastrava um
 * procedimento tinha de decidir em qual das duas fichas pôr cada pergunta — uma
 * escolha que não mudava nada.
 */

test('Configurações tem UMA aba de fichas', async ({ page }) => {
  await page.goto('/admin/settings?tab=fichas')
  await page.waitForLoadState('networkidle')

  await expect(page.getByRole('link', { name: 'Fichas', exact: true })).toBeVisible()
  // As duas abas que existiam não podem voltar.
  await expect(page.getByRole('link', { name: 'Anamnese', exact: true })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Atendimento', exact: true })).toHaveCount(0)
})

test('o procedimento tem UM seletor de ficha e nenhuma marca de avaliação', async ({ page }) => {
  await page.goto('/admin/procedures')
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: /Novo procedimento/ }).first().click()

  // A tela monta um modal por procedimento; o aberto é o que interessa.
  await expect(page.locator('select[name="form_id"]:visible')).toHaveCount(1)
  await expect(page.locator('select[name="anamnesis_form_id"]')).toHaveCount(0)
  await expect(page.locator('select[name="attendance_form_id"]')).toHaveCount(0)

  // A flag de avaliação sumiu do cadastro: se o procedimento é a avaliação,
  // isso está no nome e nos campos da ficha dele.
  await expect(page.locator('input[name="is_evaluation"]')).toHaveCount(0)
})

test('as colunas da migração sumiram do banco', async () => {
  const db = banco()

  // A ficha é uma só, na tabela `forms`.
  const forms = await db.from('forms').select('id').limit(1)
  expect(forms.error, 'a tabela forms tem de existir').toBeNull()

  const antiga = await db.from('anamnesis_forms').select('id').limit(1)
  expect(antiga.error, 'anamnesis_forms tinha de ter sumido').not.toBeNull()

  // `is_evaluation` não existe mais em nenhum dos dois lados.
  for (const tabela of ['procedures', 'appointments']) {
    const r = await db.from(tabela).select('is_evaluation').limit(1)
    expect(r.error?.code, `${tabela}.is_evaluation tinha de ter sumido`).toBe('42703')
  }

  // O prontuário continua com a anamnese GERAL do cliente, que é outra coisa.
  const mr = await db.from('medical_records').select('general_anamnesis').limit(1)
  expect(mr.error, 'a anamnese geral do cliente não podia sair junto').toBeNull()
})
