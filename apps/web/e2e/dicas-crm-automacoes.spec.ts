import { test, expect } from '@playwright/test'

/**
 * As explicações do CRM, das campanhas, dos templates e das automações saem da
 * tela e vão para a dica (o Heitor, 2026-11-16: "pode tirar esse monte de aviso
 * e explicação, se quiser manter bota em um tooltipzinho que só aparece se
 * passar o mouse em cima. Aproveita e faz esse ajuste pra todo sistema").
 *
 * Em cada tela: o parágrafo não está à vista, e aparece ao passar o mouse no
 * "i" ao lado do título. O que pede ação fica à vista (o canal da campanha:
 * "não vai pelo WhatsApp").
 */
test.describe('CRM e automações: a explicação fica na dica', () => {
  test('Automações: a apresentação e o "modelo nasce desligado" moram na dica', async ({ page }) => {
    await page.goto('/admin/automacoes')
    await expect(page.getByRole('heading', { name: 'Automações', exact: true })).toBeVisible()
    await expect(page.getByText('Fluxos que reagem sozinhos ao que acontece na rede.')).toBeHidden()
    await page.getByRole('button', { name: 'Sobre as automações' }).hover()
    await expect(page.getByText('Fluxos que reagem sozinhos ao que acontece na rede.')).toBeVisible()

    await page.getByRole('button', { name: 'Usar um modelo' }).click()
    const janela = page.getByRole('dialog', { name: 'Modelos de automação' })
    await expect(janela.getByText(/O modelo cria a automação desligada/)).toBeHidden()
    await expect(janela.locator('[data-ficha-de-saude-mora-nas-fichas]')).toHaveCount(0)
    await janela.getByRole('button', { name: 'Sobre os modelos' }).hover()
    await expect(janela.getByText(/O modelo cria a automação desligada/)).toBeVisible()
    await expect(janela.locator('[data-ficha-de-saude-mora-nas-fichas]')).toContainText('Configurações → Fichas')
  })

  test('O que já aconteceu: a apresentação mora na dica', async ({ page }) => {
    await page.goto('/admin/automacoes/eventos')
    await expect(page.getByRole('heading', { name: 'O que já aconteceu', exact: true })).toBeVisible()
    await expect(page.getByText(/Os fatos que o sistema registrou/)).toBeHidden()
    await page.getByRole('button', { name: 'Sobre o que já aconteceu' }).hover()
    await expect(page.getByText(/Os fatos que o sistema registrou/)).toBeVisible()
  })

  test('Notificações: o "como chega" na dica, o canal à vista', async ({ page }) => {
    await page.goto('/admin/notificacoes')
    await expect(page.getByRole('heading', { name: 'Notificações', exact: true })).toBeVisible()
    await expect(page.getByText('Campanhas de aviso no celular para as clientes')).toBeHidden()
    await page.getByRole('button', { name: 'Sobre as notificações' }).hover()
    await expect(page.getByText('Campanhas de aviso no celular para as clientes')).toBeVisible()

    // O canal fica à vista (sem ler, a rede achava que ia pelo WhatsApp); o detalhe, na dica.
    const canal = page.getByRole('note').filter({ hasText: 'Aviso no celular' })
    await expect(canal).toContainText('não vai pelo WhatsApp')
    await expect(canal.getByText(/fica no sino do portal da cliente/)).toBeHidden()
    await canal.getByRole('button', { name: 'Como a campanha chega' }).hover()
    await expect(canal.getByText(/fica no sino do portal da cliente/)).toBeVisible()
  })

  test('Templates: a apresentação mora na dica', async ({ page }) => {
    await page.goto('/admin/templates')
    await expect(page.getByRole('heading', { name: 'Templates', exact: true })).toBeVisible()
    await expect(page.getByText(/Mensagens pré-aprovadas pela Meta/)).toBeHidden()
    await page.getByRole('button', { name: 'Sobre os templates' }).hover()
    await expect(page.getByText(/Mensagens pré-aprovadas pela Meta/)).toBeVisible()
  })

  test('Importar contatos: o formato da planilha e o que cada destino faz moram na dica', async ({ page }) => {
    await page.goto('/admin/settings?tab=importacoes')
    await expect(page.getByLabel('Arquivo CSV')).toBeVisible()
    await expect(page.getByText(/A primeira linha é o cabeçalho/)).toBeHidden()
    await page.getByRole('button', { name: 'Sobre o formato da planilha' }).hover()
    await expect(page.getByText(/A primeira linha é o cabeçalho/)).toBeVisible()

    await page.mouse.move(0, 0)
    await expect(page.locator('[data-explica-destino]')).toHaveCount(0)
    await page.getByRole('button', { name: 'Clientes ou contatos do CRM' }).hover()
    await expect(page.locator('[data-explica-destino]').first()).toBeVisible()
  })

  test('Configurar funis: a legenda de uso mora na dica', async ({ page }) => {
    await page.goto('/admin/oportunidades')
    await page.getByTitle('Configurar funis').click()
    const janela = page.locator('dialog[open]')
    await expect(janela.getByRole('heading', { name: 'Configurar funis' })).toBeVisible()
    await expect(janela.getByText(/Arraste para reordenar/)).toBeHidden()
    await janela.getByRole('button', { name: 'Como configurar os funis' }).hover()
    await expect(janela.getByText(/Arraste para reordenar/)).toBeVisible()

    await page.mouse.move(0, 0)
    await expect(janela.getByText(/Levar a oportunidade a uma etapa de perdido/)).toBeHidden()
    await janela.getByRole('button', { name: 'Sobre os motivos de perda' }).hover()
    await expect(janela.getByText(/Levar a oportunidade a uma etapa de perdido/)).toBeVisible()
  })
})
