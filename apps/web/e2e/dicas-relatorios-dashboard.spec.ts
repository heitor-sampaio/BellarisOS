import { test, expect, type Page, type Locator } from '@playwright/test'
import { unidadesAtivas } from './apoio/banco'

/**
 * As explicações saem da tela e vão para a dica, também nos Relatórios e nos
 * dashboards (o Heitor, 2026-11-16: "pode tirar esse monte de aviso e
 * explicação, se quiser manter bota em um tooltipzinho que só aparece se
 * passar o mouse em cima. Aproveita e faz esse ajuste pra todo sistema").
 *
 * O cartão mostra o número, a variação ("vs anterior") e o dado ("12
 * vendas"); o "como se calcula", a base e o que fica fora moram no "i" ao lado
 * do rótulo ou do título, que abre ao passar o mouse. Sessão padrão: o admin
 * da rede de teste (duas unidades).
 */

/** O texto não está à vista; passa o mouse na dica, aparece; sai, some. */
async function moraNaDica(p: Page, escopo: Locator, rotulo: string, texto: RegExp) {
  const botao = escopo.getByRole('button', { name: rotulo }).first()
  await expect(botao).toBeVisible({ timeout: 30_000 })
  await expect(escopo.getByText(texto)).toBeHidden()
  await botao.hover()
  await expect(escopo.getByRole('tooltip').filter({ hasText: texto })).toBeVisible()
  await p.mouse.move(0, 0)
  await expect(escopo.getByText(texto)).toBeHidden()
}

test.describe('Relatórios: a explicação fica na dica', () => {
  test('Vendas: a ponte com o caixa e a legenda da coluna Profissional', async ({ page }) => {
    await page.goto('/admin/reports?tab=vendas&period=month')
    const corpo = page.locator('main')
    await expect(page.getByText('Total vendido', { exact: true })).toBeVisible({ timeout: 30_000 })
    await moraNaDica(page, corpo, 'Como o Total vendido se liga ao caixa', /O Total vendido é a venda, no dia do primeiro pagamento dela/) // D6 (18/11): era "no dia em que foi feita"
    await moraNaDica(page, corpo, 'Quem aparece em Profissional', /no pacote, no pré-pago, no produto e no plano, quem vendeu/)
    // O dado continua à vista: a quantidade de vendas embaixo do total.
    await expect(page.getByText(/^\d[\d.]* vendas?$/).first()).toBeVisible()
  })

  test('Financeiro: o que fica fora do lucro e a base das despesas', async ({ page }) => {
    await page.goto('/admin/reports?tab=financeiro&period=month')
    const corpo = page.locator('main')
    await expect(page.getByText('DRE Simplificado', { exact: true })).toBeVisible({ timeout: 30_000 })
    await moraNaDica(page, corpo, 'O que fica fora do lucro', /A perda e o ajuste de estoque ficam fora do lucro/)
    await moraNaDica(page, corpo, 'Qual data a despesa usa', /o DRE abaixo usa só a despesa operacional/)
    // O "Desconta do lucro" não fica mais embaixo do número: é da definição na dica.
    await expect(page.getByText('Desconta do lucro', { exact: true })).toHaveCount(0)
    // O rótulo do cartão continua exato (os specs o leem assim).
    await expect(page.getByText('Despesas pagas (caixa)', { exact: true })).toBeVisible()
  })

  test('Agenda e Estoque: o recorte do total e o que conta como zerado', async ({ page }) => {
    await page.goto('/admin/reports?tab=agenda&period=month')
    await moraNaDica(page, page.locator('main'), 'Quais agendamentos entram', /Inclui os agendamentos até o fim do período/)

    await page.goto('/admin/reports?tab=estoque&period=month')
    await moraNaDica(page, page.locator('main'), 'O que conta como produto zerado', /Os produtos sem saldo/)
  })
})

test.describe('Dashboards: a explicação fica na dica', () => {
  test('o da rede: a conta do ticket, o recorte do ranking, do aproveitamento e dos quadros de clientes', async ({ page }) => {
    await page.goto('/admin/dashboard?period=month')
    const corpo = page.locator('main')
    const ticket = page.locator('[data-kpi="Ticket médio"]')
    await expect(ticket).toBeVisible({ timeout: 30_000 })
    await moraNaDica(page, ticket, 'Como o ticket médio é contado', /Pago pelas clientes ÷/)
    await moraNaDica(page, corpo, 'O que é a taxa de aproveitamento', /Horários passados concluídos ÷ total marcado/)

    // A rede de teste tem duas unidades: o ranking aparece — sem a coluna
    // "Novos" nem a dica dela. "Novos clientes" só na rede (o Heitor, 18/11:
    // a cliente é da rede; A44 da 24ª): a cliente não é nova numa unidade.
    if (await page.getByText('Ranking de unidades', { exact: true }).count() > 0) {
      await expect(corpo.getByRole('button', { name: 'Como os novos de cada unidade são contados' })).toHaveCount(0)
      await expect(corpo.getByRole('columnheader', { name: 'Novos', exact: true })).toHaveCount(0)
    }

    const clientes = page.locator('[data-clientes-do-periodo]').first()
    await moraNaDica(page, clientes, 'O que o quadro conta', /Contados até agora, os cancelados e as faltas também/)
    const reativar = page.locator('[data-reativar-clientes]').first()
    await moraNaDica(page, reativar, 'Quem entra no Reativar clientes', /quem tem horário marcado não entra/)
  })

  test('o da unidade: a conta do ticket médio mora na dica', async ({ page }) => {
    const [unidade] = await unidadesAtivas()
    test.skip(!unidade, 'a rede de teste não tem unidade ativa')
    await page.goto(`/${unidade!.slug}/dashboard`)
    const ticket = page.getByText('Ticket médio', { exact: true }).first().locator('xpath=ancestor::div[contains(@class,"card")][1]')
    await expect(ticket).toBeVisible({ timeout: 30_000 })
    await moraNaDica(page, ticket, 'Como o ticket médio é contado', /Pago pelas clientes ÷/)
  })

  test.describe('no celular', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })
    test('a dica do quadro de clientes abre no toque', async ({ page }) => {
      await page.goto('/admin/dashboard?period=month')
      const clientes = page.locator('[data-clientes-do-periodo]').first()
      await expect(clientes).toBeVisible({ timeout: 30_000 })
      await expect(clientes.locator('[data-recorte-dos-cancelados]')).toBeHidden()
      await clientes.locator('[data-dica-botao]').tap()
      await expect(clientes.locator('[data-recorte-dos-cancelados]')).toBeVisible()
    })
  })
})
