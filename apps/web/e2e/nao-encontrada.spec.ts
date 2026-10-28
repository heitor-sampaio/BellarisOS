import { test, expect } from '@playwright/test'
import { filiaisAtivas } from './apoio/banco'

/**
 * Rota que não existe (D12 da simulação de 2026-10-27): mostrava o 404 padrão
 * do Next, em inglês, sem layout nem caminho de volta. Agora é uma tela em
 * português dentro do layout de cada lugar, com o link para o início dele.
 */
const TITULO = 'Página não encontrada'

test('na raiz: português e um caminho de volta', async ({ page }) => {
  await page.goto('/relatorios-que-nao-existe')
  await expect(page.getByRole('heading', { name: TITULO })).toBeVisible()
  await expect(page.getByText('This page could not be found')).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Ir para o início' })).toBeVisible()
})

test('no portal da rede: dentro do layout, com a barra lateral e a volta ao dashboard', async ({ page }) => {
  await page.goto('/admin/equipe-que-nao-existe')
  await expect(page.getByRole('heading', { name: TITULO })).toBeVisible()
  await expect(page.getByRole('navigation').first()).toBeVisible()
  await expect(page.getByRole('link', { name: 'Voltar ao início' })).toHaveAttribute('href', '/admin/dashboard')
})

test('no portal da unidade: dentro do layout e a volta ao dashboard dela', async ({ page }) => {
  const unidade = (await filiaisAtivas())[0]
  test.skip(!unidade, 'nenhuma unidade ativa')
  await page.goto(`/${unidade!.slug}/cashier`)
  await expect(page.getByRole('heading', { name: TITULO })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Voltar ao início' })).toHaveAttribute('href', `/${unidade!.slug}/dashboard`)
})
