import { test, expect } from '@playwright/test'

/**
 * As explicações do PDV, das vendas e do financeiro saem da tela e vão para a
 * dica (o Heitor, 2026-11-16: "pode tirar esse monte de aviso e explicação, se
 * quiser manter bota em um tooltipzinho que só aparece se passar o mouse em
 * cima. Aproveita e faz esse ajuste pra todo sistema").
 *
 * Fica à vista o que muda o valor cobrado ou devolvido e a consequência nas
 * janelas de estorno, cancelamento e devolução; o "como se calcula", a
 * legenda, o subtítulo e o "de quem é" vão para o "i" ao lado do rótulo.
 * As telas aqui abrem sem dado semeado, com a Admin da rede de teste.
 */
test.describe('PDV e vendas: a explicação fica na dica', () => {
  test('Comissões: a regra sai do parágrafo e abre na dica do título', async ({ page }) => {
    await page.goto('/admin/financeiro/comissoes')
    const dica = page.getByRole('button', { name: 'Sobre as comissões' })
    await expect(dica).toBeVisible({ timeout: 30_000 })
    await expect(page.locator('[data-regra-da-comissao]')).toBeHidden()
    await dica.hover()
    await expect(page.locator('[data-regra-da-comissao]')).toContainText('A comissão fica a pagar quando a cliente paga tudo')
    await page.mouse.move(0, 0)
    await expect(page.locator('[data-regra-da-comissao]')).toBeHidden()
  })

  test('CSV do fechamento: o subtítulo da janela mora na dica', async ({ page }) => {
    await page.goto('/admin/financeiro?aba=movimentacoes&period=today')
    await page.getByRole('button', { name: 'CSV do fechamento do dia' }).click({ timeout: 30_000 })
    const janela = page.getByRole('dialog', { name: 'CSV do fechamento do dia' })
    await expect(janela.getByText(/a planilha da contabilidade/)).toBeHidden()
    await janela.getByRole('button', { name: 'Sobre o CSV do fechamento' }).hover()
    await expect(janela.getByText(/a planilha da contabilidade/)).toBeVisible()
  })

  test('Nova venda na rede: "Em qual unidade é a venda?" com o porquê na dica', async ({ page }) => {
    // A rede de teste tem duas unidades: sem a unidade na URL, a venda pergunta (F33).
    await page.goto('/admin/pdv?nova=1')
    const pergunta = page.locator('[data-unidade-da-venda]')
    await expect(pergunta).toContainText('Em qual unidade é a venda?', { timeout: 30_000 })
    await expect(pergunta.getByText(/O catálogo, o estoque e o caixa/)).toBeHidden()
    await pergunta.getByRole('button', { name: 'Sobre a unidade da venda' }).hover()
    await expect(pergunta.getByText(/O catálogo, o estoque e o caixa/)).toBeVisible()
  })

  test('Planos propostos: o "o que esta lista mostra" fica na dica do título', async ({ page }) => {
    await page.goto('/admin/checkout')
    const dica = page.getByRole('button', { name: 'Sobre os planos propostos' })
    await expect(dica).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText(/Quando a cliente quiser pensar antes/)).toBeHidden()
    await dica.hover()
    await expect(page.getByText(/Quando a cliente quiser pensar antes/)).toBeVisible()
  })

  test.describe('no celular', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })
    test('a dica das comissões abre no toque', async ({ page }) => {
      await page.goto('/admin/financeiro/comissoes')
      const dica = page.getByRole('button', { name: 'Sobre as comissões' })
      await expect(dica).toBeVisible({ timeout: 30_000 })
      await expect(page.locator('[data-regra-da-comissao]')).toBeHidden()
      await dica.tap()
      await expect(page.locator('[data-regra-da-comissao]')).toBeVisible()
    })
  })
})
