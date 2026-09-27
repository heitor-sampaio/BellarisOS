import { test, expect, type Page, type Locator } from '@playwright/test'

/**
 * Cabeçalho da conversa no celular: condensado, sem perder informação.
 *
 * Ele ocupava 163px de uma tela de 844 — 19% só para dizer com quem se está
 * falando, antes da primeira mensagem aparecer. O Heitor pediu para condensar
 * em 2026-09-24.
 *
 * O que o teste protege é o TRATO: o que saiu do cabeçalho do celular (o
 * telefone e os tempos de atendimento) tem de continuar alcançável no card do
 * contato, a um toque. Condensar escondendo dado seria outra coisa.
 */

/** Acima disto o cabeçalho voltou a crescer — provavelmente por quebra de linha. */
const TETO_NO_CELULAR = 110

async function abrirPrimeiraConversa(page: Page) {
  await page.goto('/admin/inbox')
  await page.waitForLoadState('networkidle')
  // A lista é de conversas reais do banco de desenvolvimento: pega a primeira,
  // seja ela quem for, em vez de fixar um nome que some quando o dado muda.
  await page.locator('.inbox-conversa').first().click()
  await expect(page.locator('.inbox-cabecalho')).toBeVisible()
}

/** Arrasto vertical de um dedo, em eventos de toque de verdade. */
async function arrastar(alvo: Locator, x: number, de: number, ate: number) {
  const toque = (y: number) => ({ touches: [{ identifier: 1, clientX: x, clientY: y }] })
  await alvo.dispatchEvent('touchstart', toque(de))
  for (let i = 1; i <= 4; i++) await alvo.dispatchEvent('touchmove', toque(de + ((ate - de) * i) / 4))
  await alvo.dispatchEvent('touchend', { touches: [] })
}

test.describe('cabeçalho da conversa', () => {
  test('no celular cabe em poucas linhas', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await abrirPrimeiraConversa(page)

    const altura = await page.locator('.inbox-cabecalho').evaluate(
      el => Math.round(el.getBoundingClientRect().height),
    )
    expect(altura, 'o cabeçalho da conversa voltou a crescer no celular').toBeLessThanOrEqual(TETO_NO_CELULAR)

    // Uma linha só: se o seletor de situação voltar a cair para a segunda
    // linha, é porque `flex-wrap` voltou — foi metade do problema original.
    const envolve = await page.locator('.inbox-cabecalho').evaluate(el => getComputedStyle(el).flexWrap)
    expect(envolve).toBe('nowrap')
  })

  test('o que saiu do cabeçalho está no card do contato', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await abrirPrimeiraConversa(page)

    await expect(page.locator('.inbox-cabecalho').getByText(/Última interação há/)).toBeHidden()

    await page.locator('button[title="Contato e oportunidades"]').click()
    const painel = page.locator('.inbox-painel')
    await expect(painel.getByText(/Última interação há/)).toBeVisible()

    // E dá para fechar: a folha abria colada no topo do documento, com a barra
    // "Contato ✕" escondida atrás da topbar do app.
    await expect(painel.getByRole('button').first()).toBeInViewport()
  })

  test('puxar o cabeçalho para baixo abre o card; puxar a barra para cima fecha', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await abrirPrimeiraConversa(page)

    const cab = page.locator('.inbox-cabecalho')
    const painel = page.locator('.inbox-painel')
    const caixa = (await cab.boundingBox())!
    const x = caixa.x + caixa.width / 2
    const y = caixa.y + caixa.height / 2

    // Puxão curto: é toque, não gesto — o card não abre.
    await arrastar(cab, x, y, y + 30)
    await expect(painel).toBeHidden()

    await arrastar(cab, x, y, y + 160)
    await expect(painel.getByText(/Última interação há/)).toBeVisible()

    const barra = page.locator('.inbox-painel-barra')
    const b = (await barra.boundingBox())!
    await arrastar(barra, b.x + b.width / 2, b.y + b.height / 2, b.y - 120)
    await expect(painel).toBeHidden()
  })

  test('no desktop o cabeçalho continua completo', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 950 })
    await abrirPrimeiraConversa(page)

    const cab = page.locator('.inbox-cabecalho')
    await expect(cab.getByText(/Última interação há/)).toBeVisible()
    await expect(cab.locator('.inbox-meta span').first()).toBeVisible()
  })
})
