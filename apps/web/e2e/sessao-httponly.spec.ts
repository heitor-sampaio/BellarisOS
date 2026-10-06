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

  test('/api/auth/token recusa pedido vindo de outro site', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: f!.membro.estado })
    try {
      const res = await ctx.request.get('/api/auth/token', { headers: { 'sec-fetch-site': 'cross-site' } })
      expect(res.status()).toBe(403)
    } finally { await ctx.close() }
  })

  test('na página inicial, quem tem sessão segue para o portal sem o JS ler cookie', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: f!.membro.estado })
    try {
      const p = await ctx.newPage()
      await p.goto('/')
      await expect(p).toHaveURL(/\/admin\/dashboard/)
    } finally { await ctx.close() }
  })
})
