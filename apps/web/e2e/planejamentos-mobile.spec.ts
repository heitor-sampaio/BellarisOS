import { test, expect } from '@playwright/test'
import { banco, nomeDeTeste, filiaisAtivas } from './apoio/banco'

/**
 * Tratamentos: o plano aberto é uma tela, não uma camada.
 *
 * Ele era um modal de 780px sobre a lista — no celular cobria tudo sem oferecer
 * volta, e no computador espremia um editor com procedimentos, sessões, preços
 * e checkout. Virou rota (`…/planejamentos/<id>`): tela inteira, "voltar" do
 * aparelho funcionando e link que pode ser mandado para alguém.
 */

test.describe.configure({ mode: 'serial' })

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

const nome = nomeDeTeste('Plano')
let planId: string | null = null

test.afterAll(async () => {
  if (planId) await banco().from('treatment_plans').delete().eq('id', planId)
})

test('criar um plano abre a tela dele; voltar traz a lista', async ({ page }) => {
  await page.goto('/admin/planejamentos')

  const busca = page.getByPlaceholder('Nome do plano, cliente, CPF ou telefone…')
  await expect(busca).toBeVisible()

  await page.getByRole('button', { name: 'Novo plano' }).first().click()
  await page.getByPlaceholder('Ex.: Harmonização — Marina (indicação)').fill(nome)

  // Na rede com mais de uma unidade o plano precisa dizer de qual é: é ela que
  // define o caixa que recebe e a agenda onde as sessões caem.
  const unidade = page.locator('select').first()
  if (await unidade.count()) {
    const valores = await unidade.locator('option').evaluateAll(
      os => os.map(o => (o as HTMLOptionElement).value).filter(Boolean),
    )
    if (valores[0]) await unidade.selectOption(valores[0])
  }

  await page.getByRole('button', { name: 'Criar', exact: true }).click()

  await expect.poll(async () => {
    const { data } = await banco().from('treatment_plans').select('id').eq('name', nome).maybeSingle()
    planId = (data?.id as string) ?? null
    return planId
  }, { message: 'o plano de teste deveria ter sido criado' }).not.toBeNull()

  // Criar já abre o plano…
  await expect(page).toHaveURL(new RegExp(`/admin/planejamentos/${planId}$`))
  await expect(page.getByRole('heading', { name: nome })).toBeVisible()

  // …e a lista saiu da tela, que é o ponto.
  await expect(busca).toBeHidden()

  const voltar = page.getByRole('link', { name: 'Planejamentos' })
  await expect(voltar).toBeVisible()
  await voltar.click()

  await expect(page).toHaveURL(/\/admin\/planejamentos$/)
  await expect(busca).toBeVisible()
  await expect(page.getByText(nome)).toBeVisible()
})

test('o plano abre pela lista e renomear volta para a lista', async ({ page }) => {
  await page.goto('/admin/planejamentos')

  await page.getByText(nome).first().click()
  await expect(page).toHaveURL(new RegExp(`/admin/planejamentos/${planId}$`))

  // O nome é como o plano é encontrado enquanto não há cliente: renomear estava
  // sem chamador nenhum antes de a tela existir.
  const novo = `${nome} II`
  await page.getByRole('heading', { name: nome }).click()
  await page.locator('input.field').first().fill(novo)
  await page.getByRole('button', { name: 'Salvar', exact: true }).click()
  await expect(page.getByRole('heading', { name: novo })).toBeVisible()

  await page.getByRole('link', { name: 'Planejamentos' }).click()
  await expect(page.getByText(novo)).toBeVisible()
})

test('a mesma navegação existe no portal da unidade', async ({ page }) => {
  const unidade = (await filiaisAtivas())[0]
  test.skip(!unidade, 'a rede de teste não tem unidade ativa')

  await page.goto(`/${unidade!.slug}/planejamentos/${planId}`)

  const voltar = page.getByRole('link', { name: 'Planejamentos' })
  await expect(voltar).toBeVisible()
  await voltar.click()
  await expect(page).toHaveURL(new RegExp(`/${unidade!.slug}/planejamentos$`))
})
