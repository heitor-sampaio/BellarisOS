import { test, expect } from '@playwright/test'

/**
 * A política de privacidade abre SEM SESSÃO.
 *
 * É o requisito que define a página: ela é lida por quem ainda não entrou, por
 * quem nunca vai entrar (o cliente da clínica), e por quem avalia o app na
 * loja — loja de aplicativo exige uma URL pública para publicar.
 *
 * Neste projeto não há middleware: quem protege a rota é a própria página
 * (§6). Então "ser pública" é uma propriedade frágil — basta alguém acrescentar
 * um `getTenantContext` para ela virar privada sem ninguém notar. Daí o teste.
 */

// Sem o estado de autenticação da suíte: este teste é de quem não tem conta.
test.use({ storageState: { cookies: [], origins: [] } })

test('abre sem login e não redireciona', async ({ page }) => {
  const resposta = await page.goto('/privacidade')

  expect(resposta?.status(), 'a página tem de responder 200').toBe(200)
  expect(new URL(page.url()).pathname, 'não pode cair no login').toBe('/privacidade')

  await expect(page.getByRole('heading', { name: 'Política de Privacidade', level: 1 })).toBeVisible()
})

test('diz o essencial: papel, dado sensível, direitos e retenção', async ({ page }) => {
  await page.goto('/privacidade')

  // O que a página não pode deixar de responder.
  for (const assunto of [
    /controlador/i,
    /operador/i,
    /sens[íi]ve/i,          // dado de saúde
    /transfer[êe]ncia internacional/i,
    /ANPD/,
  ]) {
    await expect(page.locator('main'), `faltou falar de ${assunto}`).toContainText(assunto)
  }
})

test('é alcançável de fora, pelos dois caminhos de quem não tem conta', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('link', { name: 'Política de Privacidade' })).toBeVisible()

  await page.goto('/login')
  await expect(page.getByRole('link', { name: 'Política de Privacidade' })).toBeVisible()
})

test('cabe no celular sem rolagem lateral', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 })
  await page.goto('/privacidade')
  await page.waitForLoadState('networkidle')

  const estoura = await page.evaluate(() =>
    document.documentElement.scrollWidth > window.innerWidth + 1)
  expect(estoura, 'a página rolou para o lado em 360px').toBe(false)
})
