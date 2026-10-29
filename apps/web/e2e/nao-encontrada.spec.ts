import { test, expect } from '@playwright/test'
import { filiaisAtivas } from './apoio/banco'
import { clienteComSessao } from './apoio/sessao'

/**
 * Rota que não existe (D12 da simulação de 2026-10-27): mostrava o 404 padrão
 * do Next, em inglês, sem layout nem caminho de volta. Agora é uma tela em
 * português dentro do layout de cada lugar, com o link para o início dele.
 */
const TITULO = 'Página não encontrada'

test('na raiz: português e um caminho de volta', async ({ page }) => {
  await page.goto('/relatorios-que-nao-existe')
  await expect(page.getByRole('heading', { name: TITULO })).toBeVisible()
  await expect(page.getByText('This page could not be found')).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Ir para o início' })).toBeVisible()
})

test('no portal da rede: dentro do layout, com a barra lateral e a volta ao dashboard', async ({ page }) => {
  await page.goto('/admin/equipe-que-nao-existe')
  await expect(page.getByRole('heading', { name: TITULO })).toBeVisible()
  await expect(page.getByRole('navigation').first()).toBeVisible()
  await expect(page.getByRole('link', { name: 'Voltar ao início' })).toHaveAttribute('href', '/admin/dashboard')
})

/**
 * Frente F (2026-10-28): com o 404 de verdade (D18), o `notFound()` sai fora de
 * Suspense e o Next responde com a casca de erro — a página é desenhada pelo
 * navegador, e o `<script>` do layout raiz que dá ao navegador o endereço do
 * Supabase não roda. Na produção (imagem buildada sem NEXT_PUBLIC_*) o sino e
 * o Realtime do layout quebravam: "Algo deu errado" no lugar da tela. O
 * `next dev` embute as NEXT_PUBLIC_* e não mostra a quebra; o que dá para
 * provar aqui é a reserva no documento desenhado (as <meta> do layout), que é
 * de onde `configDoSupabaseNoNavegador` lê (tests/supabase-config-do-navegador).
 */
test('no 404 de cada portal, a config do Supabase está no documento mesmo sem o script', async ({ page }) => {
  const unidade = (await filiaisAtivas())[0]
  for (const url of ['/admin/equipe-que-nao-existe', ...(unidade ? [`/${unidade.slug}/cashier`] : [])]) {
    await page.goto(url)
    await expect(page.getByRole('heading', { name: TITULO })).toBeVisible()
    await expect(page.locator('meta[name="bellaris-supabase-url"]'), url).toHaveAttribute('content', /^https:\/\//)
    await expect(page.locator('meta[name="bellaris-supabase-key"]'), url).toHaveAttribute('content', /.+/)
  }
})

test('no portal da unidade: dentro do layout e a volta ao dashboard dela', async ({ page }) => {
  const unidade = (await filiaisAtivas())[0]
  test.skip(!unidade, 'nenhuma unidade ativa')
  await page.goto(`/${unidade!.slug}/cashier`)
  await expect(page.getByRole('heading', { name: TITULO })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Voltar ao início' })).toHaveAttribute('href', `/${unidade!.slug}/dashboard`)
})

/**
 * D18 da simulação de 2026-10-28 (regressão parcial de f1e8414): a tela dizia
 * "Página não encontrada" mas a resposta saía com HTTP 200 — o 404 vinha de um
 * segmento com `loading.tsx`, e com streaming o status já tinha ido. Buscador,
 * monitor e cache leem o status, não o texto: tem de ser 404 de verdade.
 */
test('a rota inexistente responde HTTP 404 (e não 200) em cada lugar', async ({ page, browser }) => {
  const unidade = (await filiaisAtivas())[0]
  test.skip(!unidade, 'nenhuma unidade ativa')
  const status = async (url: string) => (await page.goto(url))!.status()
  expect.soft(await status('/relatorios-que-nao-existe'), 'na raiz').toBe(404)
  expect.soft(await status('/admin/equipe-que-nao-existe'), 'no portal da rede').toBe(404)
  expect.soft(await status(`/${unidade!.slug}/cashier`), 'no portal da unidade').toBe(404)

  const marca = Date.now().toString(36)
  const cliente = await clienteComSessao(`nf${marca}`, unidade!)
  try {
    const ctx = await browser.newContext({ storageState: cliente.estado })
    try {
      const p = await ctx.newPage()
      const r = await p.goto(`/${unidade!.slug}/cliente/pontos`)
      await expect(p.getByRole('heading', { name: TITULO })).toBeVisible()
      expect.soft(r!.status(), 'no portal da cliente').toBe(404)
    } finally { await ctx.close() }
  } finally { await cliente.limpar() }
})

/**
 * D15 da simulação de 2026-10-29: `/lotus-batel/agenda/comissoes` mostrava "A
 * tela não conseguiu carregar" em vez do 404. O id que não é uuid ia ao banco,
 * o Postgres respondia 22P02 e `ler` lançava antes do `notFound()`. Vale para
 * toda rota `[id]` da clínica: o id é conferido ANTES da consulta (`idOu404`).
 */
test('o id que não é uuid dá a tela de não encontrada, não a de erro, em toda rota [id]', async ({ page, browser }) => {
  test.setTimeout(240_000)
  const unidade = (await filiaisAtivas())[0]
  test.skip(!unidade, 'nenhuma unidade ativa')
  const s = unidade!.slug
  const confere = async (p: typeof page, url: string) => {
    await p.goto(url)
    await expect.soft(p.getByRole('heading', { name: TITULO }), url).toBeVisible()
    await expect.soft(p.getByText('A tela não conseguiu carregar'), url).toHaveCount(0)
  }
  for (const url of [
    '/admin/agenda/comissoes', '/admin/automacoes/comissoes', '/admin/branches/comissoes',
    '/admin/clients/comissoes', '/admin/documentos/comissoes/assinar', '/admin/marketing/campanhas/comissoes',
    '/admin/notificacoes/comissoes', '/admin/notificacoes/comissoes/editar', '/admin/checkout/comissoes',
    '/admin/injetaveis/comissoes', '/admin/planejamentos/comissoes',
    `/${s}/agenda/comissoes`, `/${s}/clients/comissoes`, `/${s}/documentos/comissoes/assinar`,
    `/${s}/checkout/comissoes`, `/${s}/injetaveis/comissoes`, `/${s}/planejamentos/comissoes`,
  ]) await confere(page, url)

  const cliente = await clienteComSessao(`nu${Date.now().toString(36)}`, unidade!)
  try {
    const ctx = await browser.newContext({ storageState: cliente.estado })
    try {
      const p = await ctx.newPage()
      for (const url of [
        `/${s}/cliente/agendamentos/comissoes`, `/${s}/cliente/atendimentos/comissoes/confirmar`,
        `/${s}/cliente/documentos/comissoes`,
      ]) await confere(p, url)
    } finally { await ctx.close() }
  } finally { await cliente.limpar() }
})

/**
 * A completa de 2026-10-28: o `[slug]/[...rota]` (D12) também pega o que não
 * existe sob um endereço RESERVADO — `/api/rota-velha` é "unidade api, tela
 * rota-velha". O proxy deixa `/api/*` passar sem sessão, o layout da unidade
 * pedia a sessão e lançava "Unauthenticated": HTTP 500 no lugar do 404.
 */
test.describe('sem sessão', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('rota inexistente sob um endereço reservado (/api, /assinar) responde 404, não 500', async ({ request }) => {
    expect.soft((await request.get('/api/rota-que-nao-existe')).status(), 'GET /api/…').toBe(404)
    expect.soft((await request.post('/api/suporte/entrar', { form: { motivo: 'x' }, maxRedirects: 0 })).status(), 'POST /api/…').toBe(404)
    expect.soft((await request.get('/assinar/abc/def/ghi', { maxRedirects: 0 })).status(), 'GET /assinar/…').toBe(404)
  })
})
