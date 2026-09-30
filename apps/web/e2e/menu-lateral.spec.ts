import { test, expect, type Page } from '@playwright/test'

/**
 * As categorias do menu lateral se recolhem pelo título
 * (components/shared/secao-do-menu.tsx).
 *
 * O menu tinha crescido a ponto de rolar; cada categoria agora recolhe e
 * expande. O que o teste prende:
 * - fechar esconde os itens, e o fechado sobrevive à recarga;
 * - na categoria fechada, a página em que se está continua à mostra;
 * - no celular, abrir ou fechar uma categoria NÃO fecha a barra (o <nav>
 *   fecha a barra a cada clique, que é o jeito de o item navegar).
 */

const menu = (page: Page) => page.locator('aside.main-sidebar nav')
const titulo = (page: Page, nome: string) => menu(page).getByRole('button', { name: nome, exact: true })
const item = (page: Page, nome: string) => menu(page).getByRole('button', { name: nome, exact: true })

test('fechar a categoria esconde os itens, sobrevive à recarga e deixa a página aberta à mostra', async ({ page }) => {
  await page.goto('/admin/dashboard')
  await expect(titulo(page, 'Vendas')).toHaveAttribute('aria-expanded', 'true')
  await expect(item(page, 'Inbox')).toBeVisible()
  await expect(item(page, 'Oportunidades')).toBeVisible()

  await titulo(page, 'Vendas').click()
  await expect(titulo(page, 'Vendas')).toHaveAttribute('aria-expanded', 'false')
  await expect(item(page, 'Inbox')).toHaveCount(0)
  await expect(item(page, 'Oportunidades')).toHaveCount(0)
  // As outras categorias não mudam.
  await expect(item(page, 'Agenda')).toBeVisible()

  await page.reload()
  await expect(titulo(page, 'Vendas')).toHaveAttribute('aria-expanded', 'false')
  await expect(item(page, 'Inbox')).toHaveCount(0)

  // Com a categoria fechada, a página aberta continua no menu — e só ela.
  await page.goto('/admin/oportunidades')
  await expect(item(page, 'Oportunidades')).toBeVisible()
  await expect(item(page, 'Inbox')).toHaveCount(0)

  await titulo(page, 'Vendas').click()
  await expect(titulo(page, 'Vendas')).toHaveAttribute('aria-expanded', 'true')
  await expect(item(page, 'Inbox')).toBeVisible()
})

test.describe('no celular', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  test('abrir ou fechar uma categoria não fecha a barra', async ({ page }) => {
    await page.goto('/admin/dashboard')
    await page.getByRole('button', { name: 'Abrir menu' }).click()
    await expect(page.locator('aside.main-sidebar.sidebar-open')).toBeVisible()

    await titulo(page, 'Vendas').click()
    await expect(titulo(page, 'Vendas')).toHaveAttribute('aria-expanded', 'false')
    await expect(page.locator('aside.main-sidebar.sidebar-open'), 'a barra continua aberta').toBeVisible()

    await titulo(page, 'Vendas').click()
    await expect(item(page, 'Inbox')).toBeVisible()
  })
})
