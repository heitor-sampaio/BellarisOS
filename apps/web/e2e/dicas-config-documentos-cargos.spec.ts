import { test, expect } from '@playwright/test'

/**
 * As explicações das Configurações saem da tela e vão para a dica (o Heitor,
 * 2026-11-16: "pode tirar esse monte de aviso e explicação, se quiser manter
 * bota em um tooltipzinho que só aparece se passar o mouse em cima. Aproveita
 * e faz esse ajuste pra todo sistema").
 *
 * A tela mostra o título, o dado e o caminho para agir; o "como funciona" de
 * cada aba fica no "i" ao lado do título ou do rótulo, que abre ao passar o
 * mouse (e no toque, no celular). docs/regras/design.md, "A explicação mora na dica".
 */
test.describe('Configurações: a explicação fica na dica', () => {
  test('o topo e Cargos: o subtítulo, a apresentação e a frase do nível só com a dica aberta', async ({ page }) => {
    await page.goto('/admin/settings?tab=permissions')
    await expect(page.getByRole('heading', { name: 'Configurações' })).toBeVisible()

    // O subtítulo da tela mora na dica do título.
    await expect(page.locator('[data-subtitulo-da-tela]')).toBeHidden()
    await page.getByRole('button', { name: 'Sobre as Configurações' }).hover()
    await expect(page.locator('[data-subtitulo-da-tela]')).toBeVisible()

    // A apresentação de Cargos.
    await expect(page.getByText(/Crie um cargo com qualquer nome/)).toBeHidden()
    await page.getByRole('button', { name: 'Sobre os cargos' }).hover()
    await expect(page.getByText(/Crie um cargo com qualquer nome/)).toBeVisible()

    // A frase do nível de cada módulo: na dica ao lado do nome.
    const agenda = page.locator('[data-modulo="agenda"]').first()
    await expect(agenda).toBeVisible()
    await expect(agenda.locator('[data-frase-do-nivel]')).toHaveCount(0)
    await agenda.locator('[data-dica-botao]').first().hover()
    await expect(agenda.locator('[data-frase-do-nivel]')).toBeVisible()
    await page.mouse.move(0, 0)
    await expect(agenda.locator('[data-frase-do-nivel]')).toHaveCount(0)
  })

  test('Documentos: a apresentação e o "onde se liga" de cada grupo na dica', async ({ page }) => {
    await page.goto('/admin/settings?tab=documentos')
    await expect(page.getByRole('heading', { name: 'Termos de consentimento', exact: true })).toBeVisible()

    await expect(page.getByText(/Monte aqui os termos, contratos e documentos/)).toBeHidden()
    await page.getByRole('button', { name: 'Sobre os modelos de documento' }).hover()
    await expect(page.getByText(/Monte aqui os termos, contratos e documentos/)).toBeVisible()

    const termos = page.getByRole('region', { name: 'Termos de consentimento' })
    await expect(termos.getByText(/Ligue ao procedimento no cadastro dele/)).toBeHidden()
    await termos.getByRole('button', { name: 'Sobre: Termos de consentimento' }).hover()
    await expect(termos.getByText(/Ligue ao procedimento no cadastro dele/)).toBeVisible()

    const envio = page.getByRole('region', { name: 'Envio do link de assinatura' })
    await expect(envio.getByText(/O link vale 7 dias/)).toBeHidden()
    await envio.getByRole('button', { name: 'Sobre o envio do link' }).hover()
    await expect(envio.getByText(/O link vale 7 dias/)).toBeVisible()
  })

  test('Geral: o "para que serve" dos dados, do app da cliente e do prazo na dica', async ({ page }) => {
    await page.goto('/admin/settings?tab=general')
    await expect(page.locator('input[name="name"]')).toBeVisible()

    await expect(page.getByText(/Aparecem nos documentos e nas mensagens/)).toBeHidden()
    await page.getByRole('button', { name: 'Sobre estes dados' }).hover()
    await expect(page.getByText(/Aparecem nos documentos e nas mensagens/)).toBeVisible()

    const app = page.locator('[data-app-da-cliente]')
    await expect(app.getByText(/É o endereço que se dá à cliente/)).toBeHidden()
    await app.getByRole('button', { name: 'Sobre o app da cliente' }).hover()
    await expect(app.getByText(/É o endereço que se dá à cliente/)).toBeVisible()

    // O campo continua com o rótulo dele (a dica fica fora do <label>).
    await expect(page.getByLabel('Prazo do portal (horas)', { exact: true })).toBeVisible()
    await expect(page.getByText(/Depois, só falando com a equipe/)).toBeHidden()
    await page.getByRole('button', { name: 'Sobre: Prazo do portal (horas)' }).hover()
    await expect(page.getByText(/Depois, só falando com a equipe/)).toBeVisible()
  })

  test('LGPD, Tags e Fichas: a apresentação de cada aba na dica', async ({ page }) => {
    for (const [aba, rotulo, texto] of [
      ['lgpd', 'Sobre as solicitações de dados', /Quando um cliente pede uma cópia dos próprios dados/],
      ['tags', 'Sobre as tags', /O sistema não põe tag em ninguém sozinho/],
      ['fichas', 'Sobre as fichas de atendimento', /Monte a ficha de atendimento e escolha uma/],
    ] as const) {
      await page.goto(`/admin/settings?tab=${aba}`)
      const dica = page.getByRole('button', { name: rotulo })
      await expect(dica, aba).toBeVisible()
      await expect(page.getByText(texto), aba).toBeHidden()
      await dica.hover()
      await expect(page.getByText(texto), aba).toBeVisible()
    }
  })

  test.describe('no celular', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })
    test('a dica de Cargos abre no toque', async ({ page }) => {
      await page.goto('/admin/settings?tab=permissions')
      const dica = page.getByRole('button', { name: 'Sobre os cargos' })
      await expect(dica).toBeVisible()
      await expect(page.getByText(/Crie um cargo com qualquer nome/)).toBeHidden()
      await dica.tap()
      await expect(page.getByText(/Crie um cargo com qualquer nome/)).toBeVisible()
    })
  })
})
