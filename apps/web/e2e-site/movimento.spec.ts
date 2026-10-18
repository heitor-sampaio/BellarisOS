import { test, expect, type Page } from '@playwright/test'

/**
 * O movimento do site (2026-10-18): as seções entram quando chegam na tela, o
 * hero conta a história sozinho e as demonstrações conversam. A regra que o
 * design system aprendeu com o fade-up que prendia a opacidade vale aqui: o
 * conteúdo NASCE visível. Só se esconde para animar quem vai animar — sem
 * JavaScript, com o script da página bloqueado ou pedindo menos movimento, a
 * página é a mesma, inteira e parada.
 */

const opacidades = (page: Page) => page.evaluate(() =>
  [...document.querySelectorAll('[data-revelar]')].map(e => getComputedStyle(e).opacity))

async function rolarAteOFim(page: Page) {
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 40)) }
  })
}

test('com movimento, a seção aparece quando chega na tela', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-movimento', 'vivo')
  const precos = page.locator('#precos [data-revelar]').first()
  await expect.poll(() => precos.evaluate(e => getComputedStyle(e).opacity)).toBe('0')
  await precos.scrollIntoViewIfNeeded()
  await expect.poll(() => precos.evaluate(e => getComputedStyle(e).opacity)).toBe('1')
})

test('sem JavaScript, nada fica escondido', async ({ browser }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false })
  const page = await ctx.newPage()
  await page.goto('/')
  const ops = await opacidades(page)
  expect(ops.length, 'as seções marcadas para entrar').toBeGreaterThan(10)
  expect(ops.filter(o => o !== '1')).toEqual([])
  // As demonstrações mostram a conversa inteira, já no fim.
  await expect(page.locator('[data-demo="copilot"]')).toContainText('Confirmar')
  await expect(page.locator('[data-demo="conversa"]')).toContainText('Agendado')
  await ctx.close()
})

test('quem pede menos movimento vê tudo visível e parado', async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: 'reduce' })
  const page = await ctx.newPage()
  await page.goto('/')
  await rolarAteOFim(page)
  await expect(page.locator('html')).not.toHaveAttribute('data-movimento', 'vivo')
  const ops = await opacidades(page)
  expect(ops.length).toBeGreaterThan(10)
  expect(ops.filter(o => o !== '1')).toEqual([])
  const semFim = await page.evaluate(() =>
    document.getAnimations().filter(a => a.effect?.getComputedTiming().iterations === Infinity).length)
  expect(semFim, 'animação que nunca para').toBe(0)
  await expect(page.locator('[data-demo="copilot"]')).toContainText('Confirmar')
  await ctx.close()
})

test('se o script da página não carregar, nada fica preso invisível', async ({ page }) => {
  await page.route('**/_next/static/chunks/**', r => r.abort())
  await page.goto('/')
  expect((await opacidades(page)).length).toBeGreaterThan(10)
  await expect.poll(async () => (await opacidades(page)).filter(o => o !== '1').length, { timeout: 8_000 }).toBe(0)
})

test('o hero conta a história sozinho, um aviso depois do outro', async ({ page }) => {
  await page.goto('/')
  const avisos = page.locator('[data-avisos]')
  // Só anda quando está na tela: numa tela baixa, fica logo abaixo da dobra.
  await avisos.scrollIntoViewIfNeeded()
  const primeiro = await avisos.getAttribute('data-passo')
  expect(primeiro).not.toBeNull()
  await expect(avisos).not.toHaveAttribute('data-passo', primeiro!, { timeout: 8_000 })
})

test('as demonstrações conversam quando chegam na tela', async ({ page }) => {
  await page.goto('/')
  for (const nome of ['conversa', 'copilot']) {
    const demo = page.locator(`[data-demo="${nome}"]`)
    await demo.scrollIntoViewIfNeeded()
    const vistos = new Set<string | null>()
    await expect.poll(async () => { vistos.add(await demo.getAttribute('data-passo')); return vistos.size },
      { timeout: 15_000, message: `a demonstração ${nome} não andou` }).toBeGreaterThan(2)
  }
})
