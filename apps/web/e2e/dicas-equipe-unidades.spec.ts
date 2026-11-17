import { test, expect, type Page, type Locator } from '@playwright/test'
import { unidadesAtivas } from './apoio/banco'

/**
 * As explicações saem da tela e vão para a dica, também na Equipe e nas
 * Unidades (o Heitor, 2026-11-16: "pode tirar esse monte de aviso e
 * explicação, se quiser manter bota em um tooltipzinho que só aparece se
 * passar o mouse em cima. Aproveita e faz esse ajuste pra todo sistema").
 *
 * A tela mostra o título, o campo e o caminho para agir; o "o que vale" e o
 * "por que" ficam no "i" ao lado do rótulo, que abre ao passar o mouse. O
 * aviso que pede ação continua à vista (a senha temporária a trocar no
 * primeiro acesso). Sessão padrão: o admin da rede de teste.
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

test.describe('Equipe e unidades: a explicação fica na dica', () => {
  test('o "Adicionar membro" da rede: o registro e a escolha do acesso na dica, a senha temporária à vista', async ({ page }) => {
    await page.goto('/admin/team')
    await page.getByRole('button', { name: 'Adicionar membro' }).click()
    const janela = page.getByRole('dialog', { name: 'Novo membro da equipe' })
    await expect(janela).toBeVisible()

    // O aviso que pede ação fica.
    await expect(janela.getByText('A senha temporária deve ser trocada no primeiro acesso.')).toBeVisible()
    // O campo segue ligado ao rótulo (a dica fica fora do <label>).
    await expect(janela.getByLabel('Registro no conselho (opcional)')).toBeVisible()
    await moraNaDica(page, janela, 'Sobre o registro no conselho', /Sai nos documentos pela variável do registro/)

    // Escolhido o cargo de sistema de Admin, a abrangência some e o porquê está na dica.
    const opcoes = await janela.locator('#tm-role option').allTextContents()
    const admin = opcoes.find(o => /^Admin/.test(o.trim()))
    if (admin) {
      await janela.locator('#tm-role').selectOption({ label: admin.trim() })
      await moraNaDica(page, janela, 'Sobre a escolha do acesso', /tem acesso à rede toda, em todas as unidades/)
    }
    await janela.getByRole('button', { name: 'Cancelar' }).click()
  })

  test('a Equipe da unidade: o recorte da lista mora na dica do título', async ({ page }) => {
    const [unidade] = await unidadesAtivas()
    test.skip(!unidade, 'a rede de teste não tem unidade ativa')
    await page.goto(`/${unidade!.slug}/team`)
    // A dica fica fora do h1: o título continua "Equipe".
    await expect(page.getByRole('heading', { name: 'Equipe', exact: true })).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('[data-recorte-da-equipe]')).toHaveCount(0)
    await page.getByRole('button', { name: 'Sobre a equipe da unidade' }).hover()
    await expect(page.locator('[data-recorte-da-equipe]')).toContainText(`Equipe da unidade ${unidade!.name}`)
    // Quem tem a Equipe em Gerenciar não lê o "só vê".
    await expect(page.locator('[data-equipe-so-leitura]')).toHaveCount(0)
  })

  test('a "Nova unidade": o endereço, o telefone em branco e o horário, cada um na sua dica', async ({ page }) => {
    await page.goto('/admin/settings?tab=unidades')
    await page.getByRole('button', { name: 'Nova unidade' }).first().click()
    const janela = page.getByRole('dialog', { name: 'Nova unidade' })
    await expect(janela).toBeVisible()

    await moraNaDica(page, janela, 'Sobre o endereço do portal', /O endereço da unidade é o caminho do portal dela/)
    await moraNaDica(page, janela, 'Sobre o endereço do portal', /O endereço é único no sistema inteiro/)
    await expect(janela.locator('[data-telefone-vazio-no-app]')).toHaveCount(0)
    await moraNaDica(page, janela, 'O que o app mostra sem número', /Em branco, o app da cliente mostra o telefone da rede/)
    await moraNaDica(page, janela, 'Sobre o horário de funcionamento', /O padrão é segunda a sábado, das 8h às 20h/)
    // Os campos seguem ligados aos rótulos, e o título continua à vista.
    await expect(janela.getByLabel(/Endereço da unidade/)).toBeVisible()
    await expect(janela.getByLabel('Telefone', { exact: true })).toBeVisible()
    await expect(janela.getByText('Horário de funcionamento')).toBeVisible()
    await janela.getByRole('button', { name: 'Cancelar' }).click()
  })

  test('o detalhe da unidade: o horário de funcionamento e as salas, com o "como funciona" na dica', async ({ page }) => {
    const [unidade] = await unidadesAtivas()
    test.skip(!unidade, 'a rede de teste não tem unidade ativa')
    await page.goto(`/admin/branches/${unidade!.id}`)
    const main = page.locator('main')
    await moraNaDica(page, main, 'Sobre o horário de funcionamento', /e a ocupação, seguem este horário/)
    const salas = page.locator('[data-salas-da-unidade]')
    await expect(salas.getByRole('heading', { name: 'Salas' })).toBeVisible()
    await moraNaDica(page, salas, 'Como funcionam as salas', /uma sala não recebe dois atendimentos ao mesmo tempo/)
  })
})
