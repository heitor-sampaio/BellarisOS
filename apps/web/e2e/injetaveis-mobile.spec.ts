import { test, expect } from '@playwright/test'
import { banco, nomeDeTeste, filiaisAtivas } from './apoio/banco'

/**
 * Injetáveis no celular: uma tela por vez.
 *
 * Com lista e detalhe empilhados, abrir um planejamento colocava o mapa abaixo
 * da lista inteira — com dez planejamentos cadastrados, várias telas de rolagem
 * até o desenho, e a sensação de que o toque não tinha feito nada. O
 * planejamento aberto virou rota (`…/injetaveis/<id>`), então no aparelho a
 * lista sai da tela e o "voltar" a traz de volta.
 */

test.describe.configure({ mode: 'serial' })

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

const nome = nomeDeTeste('Mobile')
let mapId: string | null = null

test.afterAll(async () => {
  if (mapId) await banco().from('injectable_maps').delete().eq('id', mapId)
})

test('abrir um planejamento tira a lista da tela; voltar a traz', async ({ page }) => {
  await page.goto('/admin/injetaveis')

  const busca = page.getByPlaceholder('Buscar por nome do planejamento ou cliente…')
  await expect(busca).toBeVisible()

  await page.getByRole('button', { name: 'Novo planejamento' }).first().click()
  await page.getByPlaceholder('Ex.: Toxina — terço superior').fill(nome)
  await page.getByRole('button', { name: 'Criar', exact: true }).click()

  await expect.poll(async () => {
    const { data } = await banco().from('injectable_maps').select('id').eq('name', nome).maybeSingle()
    mapId = (data?.id as string) ?? null
    return mapId
  }, { message: 'o planejamento de teste deveria ter sido criado' }).not.toBeNull()

  // Criar já abre o que se acabou de criar: a URL é a do planejamento…
  await expect(page).toHaveURL(new RegExp(`/admin/injetaveis/${mapId}$`))

  // …o mapa está na tela…
  await expect(page.locator('svg image').first()).toBeVisible()

  // …e a lista saiu de cena, que é o ponto: sem isso o mapa nasceria abaixo
  // dela e a rolagem cresceria com o número de planejamentos.
  await expect(busca).toBeHidden()

  // O caminho de volta existe e é visível no aparelho.
  const voltar = page.getByRole('link', { name: 'Planejamentos' })
  await expect(voltar).toBeVisible()
  await voltar.click()

  await expect(page).toHaveURL(/\/admin\/injetaveis$/)
  await expect(busca).toBeVisible()
  await expect(page.getByText(nome)).toBeVisible()
})

test('a mesma navegação existe no portal da unidade', async ({ page }) => {
  const unidade = (await filiaisAtivas())[0]
  test.skip(!unidade, 'a rede de teste não tem unidade ativa')

  // A tela da unidade é a mesma, com outro basePath: o que se confere aqui é
  // que a rota do planejamento aberto existe nos DOIS portais — foi por não
  // existir na rede que o mapa só era alcançável pela ficha do cliente.
  await page.goto(`/${unidade!.slug}/injetaveis/${mapId}`)

  await expect(page.locator('svg image').first()).toBeVisible()
  const voltar = page.getByRole('link', { name: 'Planejamentos' })
  await expect(voltar).toBeVisible()
  await voltar.click()
  await expect(page).toHaveURL(new RegExp(`/${unidade!.slug}/injetaveis$`))
})

test('no desktop a lista continua ao lado, sem botão de voltar', async ({ page }) => {
  // A mesma URL numa tela larga: quem decide é o breakpoint do CSS, então
  // redimensionar basta — o resto do contexto (sessão, fuso) segue o da suíte.
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(`/admin/injetaveis/${mapId}`)

  await expect(page.getByPlaceholder('Buscar por nome do planejamento ou cliente…')).toBeVisible()
  await expect(page.locator('svg image').first()).toBeVisible()
  await expect(page.getByRole('link', { name: 'Planejamentos' })).toBeHidden()
})
