import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, sessaoDeTeste, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import {
  criarAtendente, gravarSessaoNoHost, plataformaNoAr, urlDaPlataforma, type AtendenteDeTeste,
} from './apoio/plataforma'

/**
 * A plataforma em DOIS apps, cada um no seu host (2026-10-06):
 *  - o SISTEMA (admin.bellarisos.com) — a administração do negócio, só ADMIN;
 *  - o SUPORTE (suporte.bellarisos.com) — o atendimento, SUPORTE e ADMIN.
 * E a clínica (app.bellarisos.com) sem nada da plataforma: nem as telas, nem
 * o webhook do Asaas, nem a sessão de quem é da plataforma.
 *
 * Cada host recusa na PORTA quem não é dele: o login não abre, e a sessão
 * que alguém trouxer não chega a tela nenhuma.
 */
test.skip(!plataformaNoAr(), 'a plataforma roda em apps próprios: só contra o build (playwright.build.config.ts)')

const marca = Date.now().toString(36)
const db = () => banco()
const SENHA = `Senha-e2e-${marca}`
const CLINICA = () => process.env.E2E_BASE_URL!

interface Fx {
  admin: AtendenteDeTeste; suporte: AtendenteDeTeste
  outra: OutraRede; membro: MembroDeTeste; emailMembro: string
}
let f: Fx | null = null

test.beforeAll(async () => {
  test.setTimeout(240_000)
  const admin   = await criarAtendente(`hs-adm-${marca}`, { papel: 'ADMIN' })
  const suporte = await criarAtendente(`hs-sup-${marca}`, { papel: 'SUPORTE' })
  const outra   = await criarOutraRede(`hs${marca}`)
  const membro  = await criarMembro(`hs${marca}`, { tenant: outra.tenantId, rotulo: 'Hosts', permissoes: [{ modulo: 'agenda', nivel: 'VIEW' }] })
  const { data: m } = await db().from('users').select('auth_id, email').eq('id', membro.userId).single()
  for (const authId of [admin.authId, suporte.authId, m!.auth_id as string]) {
    const { error } = await db().auth.admin.updateUserById(authId, { password: SENHA })
    expect(error).toBeNull()
  }
  f = { admin, suporte, outra, membro, emailMembro: m!.email as string }
})

test.afterAll(async () => {
  if (!f) return
  await f.membro.limpar()
  await f.outra.limpar()
  await f.suporte.limpar()
  await f.admin.limpar()
})

async function com<T>(browser: Browser, estado: string | null, fn: (p: Page) => Promise<T>) {
  const ctx = await browser.newContext({ storageState: estado ?? { cookies: [], origins: [] } })
  try { return await fn(await ctx.newPage()) } finally { await ctx.close() }
}

async function entrarPelaTela(p: Page, base: string, email: string) {
  await p.goto(`${base}/login`)
  await p.locator('input[name="email"]').fill(email)
  await p.locator('input[name="password"]').fill(SENHA)
  await p.getByRole('button', { name: /Entrar/ }).click()
}

test.describe.serial('a plataforma em hosts próprios', () => {
  test('o sistema abre para o ADMIN, na raiz do host, com os links do próprio host', async ({ browser }) => {
    await com(browser, f!.admin.estado, async p => {
      await p.goto(`${urlDaPlataforma('sistema')}/`)
      await expect(p.getByRole('heading', { name: 'Painel' })).toBeVisible()
      // Nada mais vive sob /sistema: os links são do host.
      await expect(p.locator('a[href^="/sistema"]')).toHaveCount(0)
      await p.getByRole('link', { name: 'Redes', exact: true }).first().click()
      await expect(p).toHaveURL(`${urlDaPlataforma('sistema')}/redes`)
    })
  })

  test('o suporte abre para o SUPORTE e para o ADMIN (cada um com a sua sessão no host)', async ({ browser }) => {
    await com(browser, f!.suporte.estado, async p => {
      await p.goto(`${urlDaPlataforma('suporte')}/`)
      await expect(p).toHaveURL(`${urlDaPlataforma('suporte')}/chamados`)
      await expect(p.getByRole('heading', { name: 'Chamados' })).toBeVisible()
      await expect(p.locator('a[href^="/suporte"]')).toHaveCount(0)
    })
    await com(browser, await f!.admin.estadoNo('suporte'), async p => {
      await p.goto(`${urlDaPlataforma('suporte')}/redes`)
      await expect(p.getByRole('heading', { name: 'Redes' })).toBeVisible()
    })
  })

  test('o SUPORTE não entra no sistema: o login recusa, e a sessão que ele trouxer não abre nada', async ({ browser }) => {
    await com(browser, null, async p => {
      await entrarPelaTela(p, urlDaPlataforma('sistema'), f!.suporte.email)
      await expect(p.getByText(/só da administração/i)).toBeVisible()
      await expect(p).toHaveURL(/\/login/)
    })
    // Sessão do SUPORTE gravada no host do sistema (como se ele tivesse o cookie).
    const { sessao } = await sessaoDeTeste(f!.suporte.authId, f!.suporte.email)
    const arq = `${f!.suporte.estado}.no-sistema.json`
    await gravarSessaoNoHost(sessao, urlDaPlataforma('sistema'), arq)
    await com(browser, arq, async p => {
      const r = await p.goto(`${urlDaPlataforma('sistema')}/redes`)
      expect(r?.status()).toBeLessThan(500)
      await expect(p).toHaveURL(/\/login/)
      await expect(p.getByRole('heading', { name: 'Redes' })).toHaveCount(0)
    })
  })

  test('membro de rede não entra no sistema nem no suporte', async ({ browser }) => {
    for (const host of ['sistema', 'suporte'] as const) {
      await com(browser, null, async p => {
        await entrarPelaTela(p, urlDaPlataforma(host), f!.emailMembro)
        await expect(p.getByText(/só da equipe do BellarisOS/i), host).toBeVisible()
        await expect(p, host).toHaveURL(/\/login/)
      })
    }
  })

  test('sem a verificação em duas etapas, o suporte manda para /verificacao', async ({ browser }) => {
    const sem = await criarAtendente(`hs-semv-${marca}`, { papel: 'SUPORTE', semVerificacao: true })
    try {
      await com(browser, sem.estado, async p => {
        await p.goto(`${urlDaPlataforma('suporte')}/chamados`)
        await expect(p).toHaveURL(`${urlDaPlataforma('suporte')}/verificacao`)
        await expect(p.getByRole('heading', { name: 'Verificação em duas etapas' })).toBeVisible()
      })
    } finally { await sem.limpar() }
  })

  test('a clínica não tem mais nada da plataforma (telas, webhook do Asaas, entrada do suporte)', async ({ browser }) => {
    // Com a sessão de um membro: sem sessão, o proxy manda QUALQUER caminho ao
    // login (inclusive o que não existe), e o 404 nem chegaria a aparecer.
    await com(browser, f!.membro.estado, async p => {
      for (const caminho of ['/sistema', '/sistema/redes', '/suporte', '/suporte/chamados']) {
        const r = await p.request.get(`${CLINICA()}${caminho}`, { maxRedirects: 0 })
        expect(r.status(), caminho).toBe(404)
      }
      for (const caminho of ['/api/webhooks/asaas', '/api/suporte/entrar', '/api/cron/assinaturas']) {
        const r = await p.request.post(`${CLINICA()}${caminho}`, { data: {}, maxRedirects: 0 })
        expect(r.status(), caminho).toBe(404)
      }
    })
  })

  test('os dois hosts mandam CSP com nonce, sem moldura e fora de buscador — e script injetado não roda', async ({ browser }) => {
    for (const host of ['sistema', 'suporte'] as const) {
      const estado = host === 'sistema' ? f!.admin.estado : f!.suporte.estado
      await com(browser, estado, async p => {
        const r = await p.goto(`${urlDaPlataforma(host)}/`)
        const csp = r?.headers()['content-security-policy'] ?? ''
        expect(csp, host).toMatch(/script-src [^;]*'nonce-[A-Za-z0-9+/=]+'/)
        expect(csp, host).toContain("frame-ancestors 'none'")
        expect(csp, host).not.toMatch(/script-src[^;]*'unsafe-inline'/)
        expect(r?.headers()['x-robots-tag'] ?? '', host).toContain('noindex')
        // A página funciona (os scripts do Next levam o nonce)...
        await expect(p.getByRole('heading', { level: 1 })).toBeVisible()
        // ...e o HTML injetado na página (o XSS: conteúdo de fora desenhado
        // como HTML) não roda script. Injeta por innerHTML, que é o caminho do
        // XSS armazenado; um <script> criado por createElement não serve de
        // prova: com 'strict-dynamic', script criado por script confiável roda
        // — e quem chega a criar um já está executando código.
        const rodou = await p.evaluate(async () => {
          const w = window as unknown as { __injetado?: number }
          const d = document.createElement('div')
          d.innerHTML = '<img src="data:," onerror="window.__injetado = 1"><a id="xss-link" href="javascript:window.__injetado=1">x</a>'
          document.body.appendChild(d)
          ;(document.getElementById('xss-link') as HTMLAnchorElement).click()
          await new Promise(ok => setTimeout(ok, 200))
          return w.__injetado === 1
        })
        expect(rodou, host).toBe(false)
      })
    }
  })

  test('quem é da plataforma não entra na clínica — nem pela tela, nem com a sessão no bolso', async ({ browser }) => {
    // `sessaoDeTeste` (teste anterior) troca a senha por uma aleatória.
    const { error } = await db().auth.admin.updateUserById(f!.suporte.authId, { password: SENHA })
    expect(error).toBeNull()
    await com(browser, null, async p => {
      await entrarPelaTela(p, CLINICA(), f!.suporte.email)
      await expect(p.getByText(/equipe da plataforma entra por/i)).toBeVisible()
      await expect(p).toHaveURL(/\/login/)
    })
    const { sessao } = await sessaoDeTeste(f!.suporte.authId, f!.suporte.email)
    const arq = `${f!.suporte.estado}.na-clinica.json`
    await gravarSessaoNoHost(sessao, CLINICA(), arq)
    await com(browser, arq, async p => {
      await p.goto(`${CLINICA()}/admin/dashboard`)
      await expect(p).toHaveURL(/\/login\?acesso=plataforma/)
      await expect(p.getByText(/equipe da plataforma entra por/i)).toBeVisible()
    })
  })
})
