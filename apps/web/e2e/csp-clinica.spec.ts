import { test, expect } from '@playwright/test'

/**
 * O CSP da clínica em REPORT-ONLY (2026-10-08): toda página leva a política
 * (com o nonce da requisição, que o Next põe nos scripts dele) e o navegador
 * AVISA o que seria bloqueado em /api/csp-relatorio — que só registra no log.
 * Nada é bloqueado ainda: o cabeçalho é o -Report-Only.
 */

test('a página leva o CSP em modo de aviso, com o nonce que os scripts do Next usam', async ({ page }) => {
  const resposta = await page.goto('/admin/dashboard')
  const h = resposta!.headers()
  expect(h['content-security-policy'], 'ainda não bloqueia').toBeUndefined()
  const politica = h['content-security-policy-report-only'] ?? ''
  const nonce = politica.match(/'nonce-([^']+)'/)?.[1]
  expect(nonce, 'a política tem o nonce').toBeTruthy()
  expect(politica).toContain('report-uri /api/csp-relatorio')
  // O Next pôs o nonce nos scripts da página — senão, ao bloquear, nada rodaria.
  const comNonce = await page.locator(`script[nonce]`).count()
  expect(comNonce).toBeGreaterThan(0)
  // E os NOSSOS scripts embutidos (o layout raiz) também — o primeiro aviso que
  // o modo de aviso deu: os quatro do layout, em toda tela.
  expect(await page.locator('script:not([src]):not([nonce])').count(), 'script embutido sem nonce').toBe(0)
})

test.describe('a rota dos avisos', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('aceita o relatório do navegador (sem sessão) e responde 204', async ({ request }) => {
    const r = await request.post('/api/csp-relatorio', {
      headers: { 'content-type': 'application/csp-report' },
      data: JSON.stringify({ 'csp-report': { 'document-uri': 'http://x/admin', 'effective-directive': 'img-src', 'blocked-uri': 'https://exemplo.invalid/a.png' } }),
    })
    expect(r.status()).toBe(204)
  })

  test('recusa o que não é relatório e o corpo grande demais', async ({ request }) => {
    expect((await request.post('/api/csp-relatorio', { headers: { 'content-type': 'text/plain' }, data: 'oi' })).status()).toBe(415)
    expect((await request.post('/api/csp-relatorio', {
      headers: { 'content-type': 'application/csp-report' }, data: 'x'.repeat(40_000),
    })).status()).toBe(413)
  })
})
