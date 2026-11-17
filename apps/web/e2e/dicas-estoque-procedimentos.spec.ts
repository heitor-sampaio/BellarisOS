import { test, expect, type Page, type Locator } from '@playwright/test'

/**
 * As explicações saem da tela e vão para a dica, também no Estoque, nos
 * Procedimentos, nos Pacotes e nas telas avulsas (a Auditoria, a verificação
 * pública) — o Heitor, 2026-11-16: "pode tirar esse monte de aviso e
 * explicação, se quiser manter bota em um tooltipzinho que só aparece se
 * passar o mouse em cima. Aproveita e faz esse ajuste pra todo sistema".
 *
 * A tela mostra o título, o campo, o estado e o caminho para agir; o "como
 * funciona" fica no "i" ao lado do rótulo, que abre ao passar o mouse. O campo
 * segue ligado ao rótulo (a dica fica fora do <label>). Sessão padrão: o admin
 * da rede de teste; nenhuma tela precisa de dado montado.
 */

/** O texto não está à vista; passa o mouse na dica, aparece; sai, some. */
async function moraNaDica(p: Page, escopo: Locator, rotulo: string, texto: RegExp) {
  const botao = escopo.getByRole('button', { name: rotulo })
  await expect(botao).toBeVisible({ timeout: 20_000 })
  await expect(escopo.getByText(texto)).toBeHidden()
  await botao.hover()
  await expect(escopo.getByRole('tooltip').filter({ hasText: texto })).toBeVisible()
  await p.mouse.move(0, 0)
  await expect(escopo.getByText(texto)).toBeHidden()
}

test.describe('Estoque, procedimentos e pacotes: a explicação fica na dica', () => {
  test('o "Novo procedimento": o auto agendamento, a ficha e a margem com o porquê na dica, e o campo ligado ao rótulo', async ({ page }) => {
    await page.goto('/admin/procedures')
    await page.getByRole('button', { name: 'Novo procedimento' }).first().click()
    const janela = page.locator('dialog[open]')
    await expect(janela).toBeVisible()

    await moraNaDica(page, janela, 'Sobre o auto agendamento', /agenda sozinha, sem passar pela equipe/)
    await moraNaDica(page, janela, 'Sobre: Ficha de atendimento', /preenchida pelo profissional durante o atendimento/)
    await moraNaDica(page, janela, 'Sobre: Margem de lucro', /Defina a margem e o preço se ajusta/)
    await moraNaDica(page, janela, 'Sobre: Preço do procedimento (R$)', /o outro se ajusta automaticamente/)
    // O campo continua achável pelo rótulo, e a caixa pelo nome dela.
    await expect(janela.getByLabel('Ficha de atendimento')).toBeVisible()
    await expect(janela.getByRole('checkbox', { name: 'Permitir auto agendamento', exact: true })).toBeVisible()
  })

  test('Pacotes: a apresentação na dica do título, e a regra de cada comissão na dica do "De venda" e do "De execução"', async ({ page }) => {
    await page.goto('/admin/pacotes')
    await expect(page.getByRole('heading', { name: 'Pacotes', exact: true })).toBeVisible({ timeout: 20_000 })
    await moraNaDica(page, page.locator('main'), 'Sobre os pacotes', /vendido por um preço só/)

    const card = page.locator('[aria-label="Pacotes"]')
    await card.getByRole('button', { name: 'Novo pacote' }).click()
    const comissao = card.getByRole('group', { name: 'Comissão do pacote' })
    await moraNaDica(page, comissao, 'Sobre a comissão de venda do pacote', /Sem regra no pacote, vale a comissão de venda/)
    await moraNaDica(page, comissao, 'Sobre a comissão de execução do pacote', /Cada sessão paga a comissão de quem atende/)
  })

  test('o "Novo produto": o conteúdo da embalagem e onde o produto aparece, na dica; sem nenhum uso, o aviso fica à vista', async ({ page }) => {
    await page.goto('/admin/estoque')
    await page.getByRole('button', { name: 'Novo produto' }).first().click()
    const janela = page.locator('dialog[open]')
    await expect(janela).toBeVisible()

    await moraNaDica(page, janela, 'Sobre o conteúdo da embalagem', /custo por ml = preço ÷ 100/)
    await moraNaDica(page, janela, 'Sobre onde o produto aparece', /aparece como insumo do procedimento e da sessão/)
    // Sem Insumo nem Venda direta, o aviso que pede ação aparece à vista (e a dica some).
    await janela.getByRole('checkbox', { name: 'Insumo', exact: true }).uncheck()
    await expect(janela.getByText('Marque ao menos um: sem nenhum, o produto não aparece em lugar nenhum.')).toBeVisible()
    await expect(janela.getByRole('button', { name: 'Sobre onde o produto aparece' })).toHaveCount(0)
  })

  test('as Marcas do estoque: para que serve a lista mora na dica do título', async ({ page }) => {
    await page.goto('/admin/estoque')
    await page.getByRole('button', { name: 'Marcas', exact: true }).click()
    const janela = page.getByRole('dialog', { name: 'Marcas' })
    await expect(janela).toBeVisible()
    await moraNaDica(page, janela, 'Para que serve esta lista', /A marca é escolhida em cada entrada no estoque/)
  })
})

test.describe('Telas avulsas: a explicação fica na dica', () => {
  test('a Auditoria: o que ela mostra mora na dica do título', async ({ page }) => {
    await page.goto('/admin/auditoria')
    await expect(page.getByRole('heading', { name: 'Auditoria', exact: true })).toBeVisible({ timeout: 20_000 })
    await moraNaDica(page, page.locator('main'), 'Sobre a auditoria', /O texto clínico nunca aparece aqui/)
  })

  test('a verificação pública: o que a página confere e onde está o código, na dica; o campo ligado ao rótulo', async ({ page }) => {
    await page.goto('/verificar')
    const main = page.locator('main')
    await expect(main.getByRole('heading', { name: 'Verificar documento assinado' })).toBeVisible({ timeout: 20_000 })
    await moraNaDica(page, main, 'O que esta página confere', /é autêntico e se não foi alterado/)
    await moraNaDica(page, main, 'Onde está o código', /no rodapé de cada página do documento assinado/)
    await expect(main.getByLabel('Código de verificação')).toBeVisible()
  })
})
