import { test, expect } from '@playwright/test'
import { unidadeQueAtende } from './apoio/banco'

/**
 * Agenda e atendimento: a explicação sai da tela e vai para a dica (o Heitor,
 * 2026-11-16: "pode tirar esse monte de aviso e explicação, se quiser manter
 * bota em um tooltipzinho que só aparece se passar o mouse em cima. Aproveita
 * e faz esse ajuste pra todo sistema"; docs/regras/design.md, "A explicação
 * mora na dica").
 *
 * A tela mostra o campo, o estado e o botão; o "o que isto faz" fica no "i"
 * ao lado do rótulo, que abre ao passar o mouse. Nada é gravado: cada janela
 * se abre e se fecha sem salvar.
 */
test.describe('Agenda e atendimento: a explicação fica na dica', () => {
  test('Agendar: a cliente nova pelo nome e telefone, sem o parágrafo da ficha completa', async ({ page }) => {
    await page.goto('/admin/agenda')
    await page.getByRole('button', { name: 'Agendar', exact: true }).click()
    await page.getByRole('button', { name: 'Não é cliente ainda? Use nome e telefone' }).click()
    await expect(page.getByPlaceholder('Nome de quem será atendido')).toBeVisible()

    const texto = page.getByText('A ficha completa (CPF, e-mail) pode ser preenchida depois.')
    await expect(texto).toBeHidden()
    // O caminho de volta continua à vista.
    await expect(page.getByRole('button', { name: 'Buscar cliente cadastrado' })).toBeVisible()

    await page.getByRole('button', { name: 'Sobre a cliente nova' }).hover()
    await expect(texto).toBeVisible()
    await page.mouse.move(0, 0)
    await expect(texto).toBeHidden()
  })

  test('Bloquear horário: o que o bloqueio faz mora na dica do título', async ({ page }) => {
    const unidade = await unidadeQueAtende()
    test.skip(!unidade, 'A rede de teste não tem unidade com quem atende.')
    await page.goto(`/${unidade!.slug}/agenda`)
    await page.getByRole('button', { name: 'Bloquear horário' }).click()
    const janela = page.getByRole('dialog', { name: 'Bloquear horário' })
    await expect(janela.getByLabel('Motivo')).toBeVisible()

    const texto = janela.getByText(/não oferecem o horário bloqueado/)
    await expect(texto).toBeHidden()
    await janela.getByRole('button', { name: 'O que o bloqueio faz' }).hover()
    await expect(texto).toBeVisible()

    await janela.getByRole('button', { name: 'Cancelar' }).click()
    await expect(janela).toBeHidden()
  })

  test('o horário da unidade: "Aberta 24 horas" diz que está ligado, e o como desfazer fica na dica', async ({ page }) => {
    await page.goto('/admin/settings?tab=unidades')
    await page.getByRole('button', { name: 'Nova unidade' }).click()
    const janela = page.getByRole('dialog', { name: 'Nova unidade' })
    await janela.getByRole('button', { name: 'Aberta 24 horas, todos os dias' }).click()

    const ligado = janela.locator('[data-desfazer-24-horas]')
    await expect(ligado).toBeVisible()
    await expect(ligado).toContainText('Ligado.')
    await expect(ligado).not.toContainText('Toque de novo')

    await ligado.getByRole('button', { name: 'Como desfazer as 24 horas' }).hover()
    await expect(ligado).toContainText('Toque de novo para voltar ao horário de antes.')
  })
})
