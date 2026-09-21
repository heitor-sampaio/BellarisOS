import { test, expect } from '@playwright/test'
import { banco } from './apoio/banco'

/**
 * A ficha do cliente guarda na URL o que está aberto.
 *
 * Aba, sub-aba de planejamento e o plano aberto eram `useState`: o voltar do
 * aparelho saía da ficha inteira em vez de devolver o passo anterior,
 * recarregar jogava de volta na Visão geral, e não havia como mandar a alguém
 * "o financeiro deste cliente". Agora cada nível é um parâmetro, e o voltar
 * anda um de cada vez.
 */

test.describe.configure({ mode: 'serial' })

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

let clientId:    string | null = null
let mapaCriado:  string | null = null

test.beforeAll(async () => {
  const { data } = await banco().from('clients').select('id').limit(1).maybeSingle()
  clientId = (data?.id as string) ?? null
})

test.afterAll(async () => {
  // O planejamento nasce pela tela, com o nome do dia: some pelo id, que é o
  // que a suíte guardou.
  if (mapaCriado) await banco().from('injectable_maps').delete().eq('id', mapaCriado)
})

test('a aba aberta está na URL, sobrevive à recarga e o voltar devolve a anterior', async ({ page }) => {
  test.skip(!clientId, 'a rede de teste não tem cliente')
  await page.goto(`/admin/clients/${clientId}`)

  // Visão geral é a aba padrão e não suja a URL.
  await expect(page).toHaveURL(new RegExp(`/admin/clients/${clientId}$`))

  await page.getByRole('link', { name: 'Financeiro', exact: true }).click()
  await expect(page).toHaveURL(/[?&]aba=financeiro/)

  // Recarregar não perde o lugar — era o que o estado local não dava.
  await page.reload()
  await expect(page).toHaveURL(/[?&]aba=financeiro/)

  await page.getByRole('link', { name: 'Planejamento', exact: true }).click()
  await expect(page).toHaveURL(/[?&]aba=planejamento/)

  // …e o voltar anda UM passo, em vez de sair da ficha.
  await page.goBack()
  await expect(page).toHaveURL(/[?&]aba=financeiro/)
})

test('a sub-aba de planejamento e o que está aberto também moram na URL', async ({ page }) => {
  test.skip(!clientId, 'a rede de teste não tem cliente')
  await page.goto(`/admin/clients/${clientId}?aba=planejamento`)

  // Pelo par de botões da aba, não pelo menu lateral, que tem o mesmo rótulo.
  const parDeAbas = page.getByRole('button', { name: 'Plano de tratamento', exact: true }).locator('..')
  await parDeAbas.getByRole('button', { name: 'Injetáveis', exact: true }).click()
  await expect(page).toHaveURL(/planejamento=injetaveis/)

  // Um planejamento novo já abre, e abrir entra como `aberto=<id>`. Criar aqui
  // em vez de depender do que houver cadastrado deixa o teste determinístico.
  await page.getByRole('button', { name: 'Novo planejamento' }).click()
  await expect(page).toHaveURL(/[?&]aberto=/)
  mapaCriado = new URL(page.url()).searchParams.get('aberto')

  // Voltar devolve a lista, e a sub-aba continua em Injetáveis.
  await page.goBack()
  await expect(page).not.toHaveURL(/[?&]aberto=/)
  await expect(page).toHaveURL(/planejamento=injetaveis/)

  // Trocar de aba limpa o que era da aba de planejamento: manter `aberto` numa
  // outra aba deixaria lixo na URL e reabriria o item errado ao voltar.
  await page.getByRole('link', { name: 'Histórico', exact: true }).click()
  await expect(page).toHaveURL(/[?&]aba=historico/)
  await expect(page).not.toHaveURL(/planejamento=|aberto=/)
})
