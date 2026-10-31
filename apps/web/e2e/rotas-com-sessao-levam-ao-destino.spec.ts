import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { clienteComSessao, criarMembro, type ClienteDeTeste, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * J-67 das simulações, com a sessão aberta:
 * - `/admin` dava 404 para todo mundo (não havia `app/admin/page.tsx`);
 * - `/setup`, para a cliente, dava "sem acesso" com HTTP 500;
 * - `/login` abria o formulário de novo, como se ninguém tivesse entrado.
 * Cada um leva ao destino certo: a cliente ao portal dela
 * (`destinoDaCliente`), a equipe ao de sempre.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let cliente: ClienteDeTeste | null = null
let membro: MembroDeTeste | null = null
let slug = ''

async function como(browser: Browser, estado: string, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`rs${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  cliente = await clienteComSessao(`rsc${marca}`, { id: rede.branchId, slug }, { tenant: rede.tenantId })
  membro = await criarMembro(`rsm${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Recepção',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'VIEW' }],
  })
})
test.afterAll(async () => {
  await membro?.limpar(); await cliente?.limpar(); await rede?.limpar()
})

for (const rota of ['/admin', '/setup', '/login']) {
  test(`a cliente com a sessão aberta, em ${rota}, vai ao portal dela`, async ({ browser }) => {
    await como(browser, cliente!.estado, async p => {
      const r = await p.goto(rota)
      await expect(p).toHaveURL(new RegExp(`/${slug}/cliente(/home)?$`))
      expect(r?.status(), 'nada de 404 nem 500 no caminho').toBeLessThan(400)
    })
  })
}

test('a equipe da unidade, em /login e /admin, vai ao painel dela', async ({ browser }) => {
  await como(browser, membro!.estado, async p => {
    await p.goto('/login')
    await expect(p).toHaveURL(new RegExp(`/${slug}/dashboard$`))
    const r = await p.goto('/admin')
    expect(r?.status()).toBeLessThan(400)
    await expect(p).not.toHaveURL(/\/admin$/)
  })
})

// O login que não é de clínica nenhuma (sem rede nem ficha — a conta que
// sobrou, ou o e-mail do primeiro admin da plataforma usado na clínica): o
// destino pelos claims era /admin/dashboard, o portão do /admin devolvia ao
// /login, e o /login (J-67) mandava de novo ao destino — milhares de idas e
// voltas, a tela em branco (completa de 2026-10-30, plataforma-primeiro-admin).
test('um login sem clínica nenhuma entra e fica no formulário, sem dar volta', async ({ browser }) => {
  const email = `e2e-sem-clinica-${marca}@bellaris.invalid`
  const senha = `Senha-${marca}-7z`
  const { data: criado, error } = await db().auth.admin.createUser({ email, password: senha, email_confirm: true })
  expect(error).toBeNull()
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  try {
    const p = await ctx.newPage()
    let idasAoPainel = 0
    p.on('request', r => { if (new URL(r.url()).pathname === '/admin/dashboard') idasAoPainel++ })
    await p.goto('/login')
    await p.locator('#email').fill(email)
    await p.locator('#password').fill(senha)
    await p.getByRole('button', { name: 'Entrar' }).click()
    await expect(p).toHaveURL(/\/login(\?|$)/)
    await expect(p.getByRole('button', { name: 'Entrar' })).toBeVisible()
    await p.waitForTimeout(2_000)
    expect(idasAoPainel, 'nada de ida e volta entre o /login e o painel').toBeLessThan(3)
  } finally {
    await ctx.close()
    await db().auth.admin.deleteUser(criado.user!.id)
  }
})

test('sem sessão, /login continua o formulário', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  try {
    const p = await ctx.newPage()
    await p.goto('/login')
    await expect(p.getByRole('button', { name: 'Entrar' })).toBeVisible()
  } finally { await ctx.close() }
})
