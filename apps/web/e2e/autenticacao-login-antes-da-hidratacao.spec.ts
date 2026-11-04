import { test, expect } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, sessaoDeTeste, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * D17 da 6ª simulação (2026-11-04): "Internal Server Error" (POST 500) no
 * primeiro login do Bruno, em /update-password?primeiro=1, às 06:37:25Z. O log
 * do Railway mostra a cadeia: `POST /login 307` → `POST /camelia-boa-viagem/
 * cliente 307` → `POST /update-password 500`, com "Failed to find Server
 * Action" — o Supabase respondeu normal a noite toda (nenhum 5xx).
 *
 * O formulário foi enviado ANTES de o React hidratar: o navegador mandou o
 * POST nativo da action, o Next rodou o login e, ao desenhar /login já com a
 * sessão, redirecionou com 307 — que REPETE o POST. O 307 do proxy (a senha
 * provisória) repetiu de novo, e /update-password recebeu a action do login,
 * que não existe lá. Na segunda tentativa, já hidratado, passou.
 *
 * - o "Entrar" fica desligado até a tela hidratar (sem o POST nativo);
 * - o redirecionamento do proxy de um pedido que não é GET é 303 (o navegador
 *   segue com GET), nunca 307.
 */

const marca = Date.now().toString(36)
let rede: OutraRede | null = null
let membro: MembroDeTeste | null = null
let slug = ''
let authId = ''
test.describe.configure({ timeout: 120_000 })

test.beforeAll(async () => {
  rede = await criarOutraRede(`lah${marca}`)
  slug = (await banco().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  membro = await criarMembro(`lahm${marca}`, { tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Bruno', permissoes: [{ modulo: 'agenda', nivel: 'VIEW' }] })
  // A senha dada por outra pessoa: o proxy leva toda tela a /update-password.
  const { data: u } = await banco().from('users').select('auth_id').eq('id', membro.userId).single<{ auth_id: string }>()
  authId = u!.auth_id
  const atual = (await banco().auth.admin.getUserById(authId)).data.user!.app_metadata
  expect((await banco().auth.admin.updateUserById(authId, { app_metadata: { ...atual, senha_provisoria: true } })).error).toBeNull()
})

test.afterAll(async () => { await membro?.limpar(); await rede?.limpar() })

test('sem o React hidratado, o "Entrar" não envia o formulário', async ({ browser }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false, storageState: { cookies: [], origins: [] } })
  try {
    const p = await ctx.newPage()
    await p.goto('/login')
    await expect(p.getByRole('button', { name: 'Entrar' })).toBeDisabled()
  } finally { await ctx.close() }
})

test('o redirecionamento do proxy de um POST é 303, não 307 (o POST não se repete)', async ({ browser }) => {
  // Uma sessão NOVA: a marca vem no token (o proxy lê as claims).
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  try {
    const { sessao } = await sessaoDeTeste(authId, `e2e-membro-lahm${marca}@bellaris.invalid`)
    expect((await ctx.request.post('/api/auth/session', { data: { access_token: sessao.access_token, refresh_token: sessao.refresh_token } })).ok()).toBe(true)
    const r = await ctx.request.post(`/${slug}/dashboard`, { maxRedirects: 0, form: { qualquer: '1' } })
    expect(r.status()).toBe(303)
    expect(r.headers()['location']).toContain('/update-password?primeiro=1')
    // O GET segue com 307, como sempre.
    const g = await ctx.request.get(`/${slug}/dashboard`, { maxRedirects: 0 })
    expect([307, 308]).toContain(g.status())
  } finally { await ctx.close() }
})
