import { test, expect } from '@playwright/test'

/**
 * O CSP da clínica (2026-10-08 em modo de aviso; BLOQUEIA desde 2026-10-22).
 * Toda página leva a política com o nonce da requisição, que o Next põe nos
 * scripts dele, e o navegador relata o que barrou em /api/csp-relatorio, que
 * registra no log. No BUILD (a completa, a produção) o cabeçalho é o que
 * bloqueia; no `next dev` segue o que só avisa (o painel de erros do Next
 * injeta script sem nonce).
 */

const NO_BUILD = !!process.env.E2E_BUILD

test('a página leva o CSP — bloqueando no build —, com o nonce que os scripts do Next usam', async ({ page }) => {
  const resposta = await page.goto('/admin/dashboard')
  const h = resposta!.headers()
  const [vale, sobra] = NO_BUILD
    ? ['content-security-policy', 'content-security-policy-report-only']
    : ['content-security-policy-report-only', 'content-security-policy']
  expect(h[sobra], `só um cabeçalho de CSP (${vale})`).toBeUndefined()
  const politica = h[vale] ?? ''
  const nonce = politica.match(/'nonce-([^']+)'/)?.[1]
  expect(nonce, 'a política tem o nonce').toBeTruthy()
  expect(politica).toContain('report-uri /api/csp-relatorio')
  // O Next pôs o nonce nos scripts da página — senão, ao bloquear, nada rodaria.
  const comNonce = await page.locator(`script[nonce]`).count()
  expect(comNonce).toBeGreaterThan(0)
  // E os NOSSOS scripts embutidos (o layout raiz) também — o primeiro aviso que
  // o modo de aviso deu: os quatro do layout, em toda tela.
  // (O painel do Next no `next dev` é um <script> sem nonce; não existe no build.)
  expect(await page.locator('script:not([src]):not([nonce]):not([data-nextjs-dev-overlay])').count(), 'script embutido sem nonce').toBe(0)
})

// A rede de proteção do bloqueio: as telas principais abertas de ponta a ponta
// sem NENHUMA violação. O evento `securitypolicyviolation` dispara nos dois
// modos, então isto também vale no `next dev` (lá, menos o script embutido e o
// eval do próprio Next).
test('as telas principais não esbarram no CSP', async ({ page }) => {
  test.setTimeout(240_000)
  await page.addInitScript(() => {
    const w = window as unknown as { __csp: string[] }
    w.__csp = []
    document.addEventListener('securitypolicyviolation', e => {
      w.__csp.push(`${e.effectiveDirective} ${e.blockedURI || '?'} (${location.pathname})`)
    })
  })
  const telas = [
    '/admin/dashboard', '/admin/agenda', '/admin/inbox', '/admin/clients',
    '/admin/oportunidades', '/admin/financeiro', '/admin/estoque',
    '/admin/documentos', '/admin/marketing', '/admin/reports',
    '/admin/automacoes', '/admin/settings', '/admin/team',
  ]
  const violacoes: string[] = []
  for (const tela of telas) {
    await page.goto(tela)
    // O que a tela busca depois de abrir (o mapa, o tempo real, as imagens).
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
    const desta = await page.evaluate(() => (window as unknown as { __csp: string[] }).__csp)
    violacoes.push(...desta.filter(v => NO_BUILD || !/^script-src(-elem)? (inline|eval) /.test(v)))
  }
  expect(violacoes, 'violações do CSP').toEqual([])
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
