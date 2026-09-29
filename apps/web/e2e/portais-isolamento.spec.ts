import { test, expect, type Browser } from '@playwright/test'
import { unidadeQueAtende, filiaisAtivas, type Filial } from './apoio/banco'
import { criarMembro, clienteComSessao, type MembroDeTeste, type ClienteDeTeste } from './apoio/sessao'

/**
 * Cada pessoa fica no portal dela (CLAUDE.md §6).
 *
 * Até 2026-09-27 a suíte entrava só como admin da rede — que abre tudo —, então
 * nada disto tinha prova: rota privada sem sessão, gente de unidade tentando a
 * rede ou outra unidade, cliente final tentando a tela da equipe, cargo sem um
 * módulo abrindo a tela dele pela URL.
 *
 * "Barrado" aqui tem três formas legítimas, e o teste aceita a que o sistema
 * usa em cada caso: ir para `/login`, ser mandado para o próprio portal, ou a
 * tela "Você não tem acesso a esta área" (`app/error.tsx`, de
 * `assertPermission`). O que NÃO pode é a tela abrir com o conteúdo.
 */

const marca = Date.now().toString(36)
const SEM_ACESSO = 'Você não tem acesso a esta área'

async function abrir(browser: Browser, estado: string | undefined, url: string) {
  const ctx  = await browser.newContext(estado ? { storageState: estado } : { storageState: { cookies: [], origins: [] } })
  const page = await ctx.newPage()
  await page.goto(url)
  await page.waitForLoadState('networkidle')
  return { ctx, page }
}

/** Barrado: saiu da URL pedida, ou ficou nela mostrando "sem acesso". */
async function esperarBarrado(browser: Browser, estado: string | undefined, url: string, motivo: string) {
  const { ctx, page } = await abrir(browser, estado, url)
  try {
    const caminho = new URL(page.url()).pathname
    if (caminho === url.split('?')[0]) {
      await expect(page.getByText(SEM_ACESSO), `${motivo} — ficou em ${url} sem a tela de sem acesso`).toBeVisible()
    }
    return caminho
  } finally {
    await ctx.close()
  }
}

test.describe('sem sessão', () => {
  for (const url of ['/admin/dashboard', '/admin/financeiro', '/admin/clients']) {
    test(`${url} manda para o login`, async ({ browser }) => {
      const { ctx, page } = await abrir(browser, undefined, url)
      try {
        await expect(page, 'rota privada aberta sem sessão').toHaveURL(/\/login/)
      } finally { await ctx.close() }
    })
  }

  test('portal da unidade e do cliente também', async ({ browser }) => {
    const unidade = (await filiaisAtivas())[0]
    test.skip(!unidade, 'nenhuma unidade ativa')
    for (const url of [`/${unidade!.slug}/dashboard`, `/${unidade!.slug}/cliente/home`]) {
      const { ctx, page } = await abrir(browser, undefined, url)
      try {
        await expect(page, `${url} aberta sem sessão`).toHaveURL(/\/login/)
      } finally { await ctx.close() }
    }
  })
})

test.describe.serial('gente de unidade', () => {
  let unidade: Filial | null = null
  let membro: MembroDeTeste | null = null

  test.beforeAll(async () => {
    unidade = await unidadeQueAtende()
    if (!unidade) return
    membro = await criarMembro(`un${marca}`, {
      rotulo: 'Recepção',
      branchId: unidade.id,
      permissoes: [{ modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'VIEW' }],
    })
  })
  test.afterAll(async () => { await membro?.limpar() })

  test('entra no portal da própria unidade', async ({ browser }) => {
    test.skip(!membro, 'nenhuma unidade com profissional')
    expect(membro!.destino, 'o login manda para a própria unidade').toBe(`/${unidade!.slug}/dashboard`)
    const { ctx, page } = await abrir(browser, membro!.estado, `/${unidade!.slug}/agenda`)
    try {
      await expect(page).toHaveURL(new RegExp(`/${unidade!.slug}/agenda`))
      await expect(page.getByText(SEM_ACESSO), 'a agenda é liberada para este cargo').toHaveCount(0)
    } finally { await ctx.close() }
  })

  test('não entra no portal da rede', async ({ browser }) => {
    test.skip(!membro, 'nenhuma unidade com profissional')
    const foi = await esperarBarrado(browser, membro!.estado, '/admin/dashboard', 'gente de unidade abriu /admin')
    expect(foi.startsWith('/admin'), 'gente de unidade não pode ficar no /admin').toBe(false)
  })

  test('não entra em outra unidade', async ({ browser }) => {
    test.skip(!membro, 'nenhuma unidade com profissional')
    const outra = (await filiaisAtivas()).find(f => f.id !== unidade!.id)
    test.skip(!outra, 'a rede de dev tem uma unidade só')
    const { ctx, page } = await abrir(browser, membro!.estado, `/${outra!.slug}/agenda`)
    try {
      await expect(page, 'foi mandado para a própria unidade').toHaveURL(new RegExp(`/${unidade!.slug}/`))
    } finally { await ctx.close() }
  })

  test('módulo fora do cargo não abre pela URL', async ({ browser }) => {
    test.skip(!membro, 'nenhuma unidade com profissional')
    // O cargo tem agenda e clientes — financeiro e estoque, não.
    for (const tela of ['financeiro', 'estoque']) {
      await esperarBarrado(browser, membro!.estado, `/${unidade!.slug}/${tela}`, `${tela} abriu sem o módulo`)
    }
  })
})

test.describe.serial('cargo de rede sem um módulo', () => {
  let membro: MembroDeTeste | null = null
  test.beforeAll(async () => {
    membro = await criarMembro(`rd${marca}`, {
      rotulo: 'Agenda só',
      permissoes: [{ modulo: 'agenda', nivel: 'MANAGE' }],
    })
  })
  test.afterAll(async () => { await membro?.limpar() })

  test('abre o que tem, e não abre pela URL o que não tem', async ({ browser }) => {
    expect(membro!.destino).toBe('/admin/dashboard')
    const { ctx, page } = await abrir(browser, membro!.estado, '/admin/agenda')
    try {
      await expect(page.getByText(SEM_ACESSO), 'a agenda é do cargo').toHaveCount(0)
    } finally { await ctx.close() }

    for (const url of ['/admin/financeiro', '/admin/estoque', '/admin/clients', '/admin/settings', '/admin/team', '/admin/inbox']) {
      await esperarBarrado(browser, membro!.estado, url, `${url} abriu para cargo sem o módulo`)
    }
  })
})

test.describe.serial('cliente final', () => {
  let unidade: Filial | null = null
  let cliente: ClienteDeTeste | null = null

  test.beforeAll(async () => {
    unidade = (await filiaisAtivas())[0] ?? null
    if (unidade) cliente = await clienteComSessao(marca, unidade)
  })
  test.afterAll(async () => { await cliente?.limpar() })

  test('entra no portal do cliente', async ({ browser }) => {
    test.skip(!cliente, 'nenhuma unidade ativa')
    expect(cliente!.destino, 'o login manda o cliente para o portal dele').toBe(`/${unidade!.slug}/cliente`)
    const { ctx, page } = await abrir(browser, cliente!.estado, `/${unidade!.slug}/cliente/home`)
    try {
      await expect(page).toHaveURL(new RegExp(`/${unidade!.slug}/cliente`))
      await expect(page.getByText(SEM_ACESSO)).toHaveCount(0)
    } finally { await ctx.close() }
  })

  test('não entra nas telas da equipe, nem da rede nem da unidade', async ({ browser }) => {
    test.skip(!cliente, 'nenhuma unidade ativa')
    const urls = [
      '/admin/dashboard', '/admin/clients',
      `/${unidade!.slug}/dashboard`, `/${unidade!.slug}/agenda`, `/${unidade!.slug}/clients`,
      `/${unidade!.slug}/financeiro`, `/${unidade!.slug}/inbox`,
      `/${unidade!.slug}/financeiro/comissoes`, `/${unidade!.slug}/pacotes`,
    ]
    for (const url of urls) {
      const foi = await esperarBarrado(browser, cliente!.estado, url, `cliente abriu ${url}`)
      expect(foi.startsWith('/admin'), `cliente não pode ficar no /admin (${url})`).toBe(false)
    }
  })

  test('não entra no portal de cliente de outra unidade', async ({ browser }) => {
    test.skip(!cliente, 'nenhuma unidade ativa')
    const outra = (await filiaisAtivas()).find(f => f.id !== unidade!.id)
    test.skip(!outra, 'a rede de dev tem uma unidade só')
    await esperarBarrado(browser, cliente!.estado, `/${outra!.slug}/cliente/home`, 'cliente abriu o portal de outra unidade')
  })
})
