import { test, expect } from '@playwright/test'

/**
 * As explicações saem da tela e vão para a dica (o Heitor, 2026-11-16, sobre o
 * Resumo do Financeiro: "pode tirar esse monte de aviso e explicação, se quiser
 * manter bota em um tooltipzinho que só aparece se passar o mouse em cima.
 * Aproveita e faz esse ajuste pra todo sistema").
 *
 * O cartão mostra o número, o que está em aberto e o caminho para agir; o
 * "como se calcula" fica no "i" ao lado do rótulo, que abre ao passar o mouse
 * (e no toque, no celular).
 */
test.describe('Financeiro: a explicação fica na dica', () => {
  test('o Resumo mostra os números sem os parágrafos, e a dica abre ao passar o mouse', async ({ page }) => {
    await page.goto('/admin/financeiro?period=month')
    const despesas = page.locator('[data-kpi="despesas"]')
    const resultado = page.locator('[data-kpi="resultado"]')
    const aReceber = page.locator('[data-kpi="a-receber"]')
    const operadora = page.locator('[data-kpi="a-receber-operadora"]')
    await expect(resultado).toBeVisible()

    // Nenhum parágrafo de explicação à vista.
    await expect(despesas.getByText(/O que saiu do caixa/)).toBeHidden()
    await expect(resultado.locator('[data-conta-do-resultado]')).toBeHidden()
    await expect(resultado.getByText(/É o resultado do período/)).toBeHidden()
    await expect(aReceber.getByText(/Pelo vencimento, no período/)).toBeHidden()
    await expect(operadora.getByText(/contam como recebidos no dia da venda/)).toBeHidden()

    // O número e o em aberto continuam à vista.
    await expect(aReceber.locator('[data-em-aberto]')).toBeVisible()

    // A conta do resultado está na dica: passa o mouse, aparece; sai, some.
    const dica = resultado.locator('[data-dica-botao]')
    await dica.hover()
    await expect(resultado.locator('[data-conta-do-resultado]')).toBeVisible()
    await page.mouse.move(0, 0)
    await expect(resultado.locator('[data-conta-do-resultado]')).toBeHidden()

    // A das despesas também.
    await despesas.locator('[data-dica-botao]').hover()
    await expect(despesas.getByText(/O que saiu do caixa/)).toBeVisible()
  })

  test('as listas e o fluxo de caixa: sem faixa nem parágrafo, o "como se lê" na dica do título', async ({ page }) => {
    await page.goto('/admin/financeiro?period=month')
    const fluxo = page.locator('[data-fluxo-de-caixa]')
    await expect(fluxo).toBeVisible()
    await expect(fluxo.getByText(/O que entra \(o a receber da cliente/)).toBeHidden()
    await fluxo.getByRole('button', { name: 'Como se lê o fluxo de caixa' }).hover()
    await expect(fluxo.getByText(/O que entra \(o a receber da cliente/)).toBeVisible()

    for (const [aba, dica] of [['a-receber', 'Sobre as contas a receber'], ['a-pagar', 'Sobre as contas a pagar']]) {
      await page.goto(`/admin/financeiro?aba=${aba}`)
      await expect(page.getByRole('button', { name: dica })).toBeVisible()
      await expect(page.locator('[data-so-o-em-aberto]')).toBeHidden()
      await page.getByRole('button', { name: dica }).hover()
      await expect(page.locator('[data-so-o-em-aberto]')).toBeVisible()
    }
  })

  test.describe('no celular', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })
    test('a dica abre no toque', async ({ page }) => {
      await page.goto('/admin/financeiro?period=month')
      const resultado = page.locator('[data-kpi="resultado"]')
      await expect(resultado).toBeVisible()
      await expect(resultado.locator('[data-conta-do-resultado]')).toBeHidden()
      await resultado.locator('[data-dica-botao]').tap()
      await expect(resultado.locator('[data-conta-do-resultado]')).toBeVisible()
    })
  })
})
