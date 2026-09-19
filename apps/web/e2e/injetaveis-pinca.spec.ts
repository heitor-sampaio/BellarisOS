import { test, expect, type Page } from '@playwright/test'
import { banco, nomeDeTeste } from './apoio/banco'

/**
 * Pinça no celular.
 *
 * O zoom existe porque ponto de toxina fica a milímetros do vizinho; os botões
 * de + e − resolvem no desktop, mas no celular ninguém os procura com o dedo já
 * sobre o rosto. O gesto é o caminho natural, e é o que este teste guarda.
 *
 * O Playwright não tem pinça pronta: os dois dedos vão por CDP
 * (`Input.dispatchTouchEvent`), que é o que o próprio DevTools usa para emular
 * toque.
 */

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

const nome = nomeDeTeste('Pinça')
let mapId: string | null = null

test.afterAll(async () => {
  if (mapId) await banco().from('injectable_maps').delete().eq('id', mapId)
})

/**
 * Afasta dois dedos a partir do centro VISÍVEL do elemento.
 *
 * A ilustração é mais alta que a tela do celular: o centro geométrico dela cai
 * fora da viewport, e toque fora da viewport não chega a elemento nenhum.
 */
async function pincar(page: Page, box: { x: number; y: number; width: number; height: number }) {
  const cdp = await page.context().newCDPSession(page)
  const vp = page.viewportSize()!
  const topo   = Math.max(box.y, 0)
  const fundo  = Math.min(box.y + box.height, vp.height)
  const cx = box.x + box.width / 2
  const cy = (topo + fundo) / 2

  const dedos = (d: number) => ([
    { x: cx - d, y: cy, id: 1 },
    { x: cx + d, y: cy, id: 2 },
  ])

  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: dedos(20) })
  // Em passos: um salto único seria reconhecido, mas não é o que a mão faz, e o
  // caminho intermediário é onde um cálculo errado de foco apareceria.
  for (const d of [40, 60, 80, 100]) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: dedos(d) })
    await page.waitForTimeout(60)
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await cdp.detach()
}

test('pinça aproxima a ilustração e não marca ponto', async ({ page }) => {
  await page.goto('/admin/injetaveis')

  // Um planejamento novo, vazio: o gesto precisa funcionar antes de haver ponto.
  await page.getByRole('button', { name: 'Novo planejamento' }).first().click()
  // O campo do modal, pelo placeholder: é o único input de texto dele.
  await page.getByPlaceholder('Ex.: Toxina — terço superior').fill(nome)
  await page.getByRole('button', { name: 'Criar', exact: true }).click()

  await expect.poll(async () => {
    const { data } = await banco().from('injectable_maps').select('id').eq('name', nome).maybeSingle()
    mapId = (data?.id as string) ?? null
    return mapId
  }, { message: 'o planejamento de teste deveria ter sido criado' }).not.toBeNull()

  const svg = page.locator('svg').filter({ has: page.locator('image') }).first()
  await expect(svg).toBeVisible()
  await svg.scrollIntoViewIfNeeded()
  await page.waitForTimeout(300)

  const zoomLabel = page.getByText(/^\d+%$/).first()
  await expect(zoomLabel).toHaveText('100%')

  const box = await svg.boundingBox()
  expect(box, 'a ilustração precisa estar na tela para o gesto').not.toBeNull()

  await pincar(page, box!)

  // O zoom subiu…
  await expect.poll(async () => parseInt((await zoomLabel.textContent()) ?? '0', 10), {
    message: 'a pinça deveria aproximar',
  }).toBeGreaterThan(100)

  // …e o gesto não virou um ponto marcado. Era o risco: o clique dispara depois
  // do último dedo sair, no lugar onde a mão estava.
  const { data } = await banco().from('injectable_maps').select('points').eq('id', mapId!).single()
  expect((data?.points as unknown[] | null) ?? []).toHaveLength(0)
  await expect(page.getByText('Nenhum ponto nesta ilustração.')).toBeVisible()
})
