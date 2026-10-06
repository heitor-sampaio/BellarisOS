import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, clienteComSessao, type MembroDeTeste, type ClienteDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * A sessão mora SÓ no servidor: os cookies do Supabase são httpOnly.
 *
 * Até 2026-10-06 eram legíveis pelo JS da página (padrão do @supabase/ssr), e
 * um script injetado levava o refresh token — 7 dias, renovável — para outra
 * máquina. O navegador agora recebe só o ACCESS token (até 1 h), e só por
 * `/api/auth/token`, para o Realtime.
 *
 * A prova é pela tela de login de verdade (equipe e cliente final) e pelo
 * caminho do app (`/api/auth/session`, o do apoio): os dois gravam cookie.
 */

const marca = Date.now().toString(36)
const db = () => banco()
const SENHA = `Senha-e2e-${marca}`

interface Fx { outra: OutraRede; membro: MembroDeTeste; emailMembro: string; cliente: ClienteDeTeste; emailCliente: string }
let f: Fx | null = null

test.beforeAll(async () => {
  const outra = await criarOutraRede(`http${marca}`)
  const membro = await criarMembro(`http${marca}`, {
    tenant: outra.tenantId, rotulo: 'Sessão', permissoes: [{ modulo: 'agenda', nivel: 'VIEW' }],
  })
  const { data: unidade } = await db().from('branches').select('slug').eq('id', outra.branchId).single()
  const cliente = await clienteComSessao(`http${marca}`, { id: outra.branchId, slug: unidade!.slug as string }, { tenant: outra.tenantId })
  const { data: m } = await db().from('users').select('auth_id, email').eq('id', membro.userId).single()
  const { data: c } = await db().from('clients').select('auth_id, email').eq('id', cliente.clientId).single()
  for (const authId of [m!.auth_id as string, c!.auth_id as string]) {
    const { error } = await db().auth.admin.updateUserById(authId, { password: SENHA })
    expect(error).toBeNull()
  }
  f = { outra, membro, emailMembro: m!.email as string, cliente, emailCliente: c!.email as string }
})

test.afterAll(async () => {
  if (!f) return
  await f.cliente.limpar()
  await f.membro.limpar()
  await f.outra.limpar()
})

async function semSessao<T>(browser: Browser, fn: (p: Page) => Promise<T>) {
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  try { return await fn(await ctx.newPage()) } finally { await ctx.close() }
}

async function entrarPelaTela(p: Page, email: string) {
  await p.goto('/login')
  await p.locator('input[name="email"]').fill(email)
  await p.locator('input[name="password"]').fill(SENHA)
  await p.getByRole('button', { name: /Entrar/ }).click()
}

/** Os cookies da sessão do Supabase (vêm em pedaços: `.0`, `.1`…). */
async function cookiesDaSessao(p: Page) {
  return (await p.context().cookies()).filter(c => /^sb-.*-auth-token/.test(c.name))
}

async function conferirSoNoServidor(p: Page) {
  const sessao = await cookiesDaSessao(p)
  expect(sessao.length).toBeGreaterThan(0)
  for (const c of sessao) expect(c.httpOnly, `${c.name} legível pelo JS`).toBe(true)
  // E o JS da página, de fato, não enxerga nada.
  expect(await p.evaluate(() => document.cookie)).not.toContain('sb-')
}

test.describe.serial('sessão só no servidor', () => {
  test('equipe: o login pela tela grava a sessão em cookie httpOnly', async ({ browser }) => {
    await semSessao(browser, async p => {
      await entrarPelaTela(p, f!.emailMembro)
      await expect(p).toHaveURL(/\/admin\/dashboard/)
      await conferirSoNoServidor(p)
    })
  })

  test('cliente final: o login pela tela também', async ({ browser }) => {
    await semSessao(browser, async p => {
      await entrarPelaTela(p, f!.emailCliente)
      await expect(p).toHaveURL(new RegExp(`/${f!.cliente.slug}/cliente`))
      await conferirSoNoServidor(p)
    })
  })

  test('o caminho do app (/api/auth/session) também grava httpOnly', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: f!.membro.estado })
    try {
      const p = await ctx.newPage()
      await p.goto('/admin/dashboard')
      await conferirSoNoServidor(p)
    } finally { await ctx.close() }
  })

  test('/api/auth/token: só o access token, para quem tem sessão; nada para quem não tem', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: f!.membro.estado })
    try {
      const p = await ctx.newPage()
      await p.goto('/admin/dashboard')
      const r = await p.evaluate(async () => {
        const res = await fetch('/api/auth/token', { cache: 'no-store' })
        return { status: res.status, corpo: await res.json() as Record<string, unknown> }
      })
      expect(r.status).toBe(200)
      expect(typeof r.corpo.access_token).toBe('string')
      expect(String(r.corpo.access_token).split('.')).toHaveLength(3)   // um JWT
      expect(typeof r.corpo.expires_at).toBe('number')
      expect(r.corpo).not.toHaveProperty('refresh_token')
      expect(Object.keys(r.corpo).sort()).toEqual(['access_token', 'expires_at'])
    } finally { await ctx.close() }

    await semSessao(browser, async p => {
      const res = await p.request.get('/api/auth/token')
      expect(res.status()).toBe(401)
    })
  })

  test('/api/auth/token recusa pedido vindo de outro site — inclusive de um subdomínio irmão — e não guarda cache', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: f!.membro.estado })
    try {
      for (const site of ['cross-site', 'same-site']) {
        const res = await ctx.request.get('/api/auth/token', { headers: { 'sec-fetch-site': site } })
        expect(res.status(), site).toBe(403)
      }
      const ok = await ctx.request.get('/api/auth/token', { headers: { 'sec-fetch-site': 'same-origin' } })
      expect(ok.status()).toBe(200)
      expect(ok.headers()['cache-control']).toContain('no-store')
    } finally { await ctx.close() }
  })

  test('/api/auth/session não aceita sessão plantada por outro site (login CSRF)', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    try {
      const corpo = JSON.stringify({ access_token: 'x', refresh_token: 'y' })
      // Um <form enctype="text/plain"> de outro site consegue mandar este corpo.
      const texto = await ctx.request.post('/api/auth/session', { headers: { 'content-type': 'text/plain' }, data: corpo })
      expect(texto.status()).toBe(415)
      // A essência continua text/plain — um fetch no-cors de outro site manda isto.
      const disfarce = await ctx.request.post('/api/auth/session', { headers: { 'content-type': 'text/plain; x=application/json' }, data: corpo })
      expect(disfarce.status()).toBe(415)
      const deFora = await ctx.request.post('/api/auth/session', {
        headers: { 'content-type': 'application/json', 'sec-fetch-site': 'cross-site' }, data: corpo,
      })
      expect(deFora.status()).toBe(403)
    } finally { await ctx.close() }
  })

  test('cold start do app: a landing chega sem cookie, pergunta ao servidor e segue para o portal', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: f!.membro.estado })
    try {
      const p = await ctx.newPage()
      // O WebView ainda inicializando: o PRIMEIRO pedido da página sai sem os
      // cookies. A landing renderiza; quem leva adiante é o AuthRedirect, que
      // pergunta a /api/auth/token depois da hidratação (o JS não lê cookie).
      let primeiro = true
      await p.route(/\/$/, async rota => {
        if (primeiro && rota.request().resourceType() === 'document') {
          primeiro = false
          const h = { ...rota.request().headers() }
          delete h.cookie
          return rota.continue({ headers: h })
        }
        return rota.continue()
      })
      await p.goto('/')
      await expect(p).toHaveURL(/\/admin\/dashboard/)
      expect(primeiro).toBe(false)
    } finally { await ctx.close() }
  })
})
