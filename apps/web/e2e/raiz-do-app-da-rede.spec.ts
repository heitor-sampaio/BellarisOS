import { test, expect } from '@playwright/test'

/**
 * O `/` da CLÍNICA (app.bellarisos.com) deixou de ser a landing (2026-10-17):
 * a página de quem ainda não conhece o BellarisOS mora em bellarisos.com
 * (`apps/site`). Aqui o `/` só decide a porta:
 *  - com sessão, o portal (como sempre);
 *  - sem sessão, o login — é o que o app Android abre.
 *
 * O cold start do app (o primeiro pedido sem os cookies do WebView) continua
 * em `sessao-httponly.spec.ts`: quem leva adiante é o `AuthRedirect`.
 */

test.describe('sem sessão', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('o / vai para o login, sem landing no caminho', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/login$/)
    await expect(page.getByRole('heading', { name: 'Entrar', level: 1 })).toBeVisible()
    // A landing antiga não aparece nem de passagem.
    await expect(page.getByText('Tudo que sua rede de clínicas precisa')).toHaveCount(0)
  })
})

test.describe('com sessão', () => {
  test('o / vai para o portal', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/admin\/dashboard/)
  })
})
