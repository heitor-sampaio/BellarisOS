import { test, expect } from '@playwright/test'
import { filiaisAtivas } from './apoio/banco'
import { clienteComSessao } from './apoio/sessao'

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

/**
 * D18 da simulação de 2026-10-28 (regressão parcial de f1e8414): a tela dizia
 * "Página não encontrada" mas a resposta saía com HTTP 200 — o 404 vinha de um
 * segmento com `loading.tsx`, e com streaming o status já tinha ido. Buscador,
 * monitor e cache leem o status, não o texto: tem de ser 404 de verdade.
 */
test('a rota inexistente responde HTTP 404 (e não 200) em cada lugar', async ({ page, browser }) => {
  const unidade = (await filiaisAtivas())[0]
  test.skip(!unidade, 'nenhuma unidade ativa')
  const status = async (url: string) => (await page.goto(url))!.status()
  expect.soft(await status('/relatorios-que-nao-existe'), 'na raiz').toBe(404)
  expect.soft(await status('/admin/equipe-que-nao-existe'), 'no portal da rede').toBe(404)
  expect.soft(await status(`/${unidade!.slug}/cashier`), 'no portal da unidade').toBe(404)

  const marca = Date.now().toString(36)
  const cliente = await clienteComSessao(`nf${marca}`, unidade!)
  try {
    const ctx = await browser.newContext({ storageState: cliente.estado })
    try {
      const p = await ctx.newPage()
      const r = await p.goto(`/${unidade!.slug}/cliente/pontos`)
      await expect(p.getByRole('heading', { name: TITULO })).toBeVisible()
      expect.soft(r!.status(), 'no portal da cliente').toBe(404)
    } finally { await ctx.close() }
  } finally { await cliente.limpar() }
})
