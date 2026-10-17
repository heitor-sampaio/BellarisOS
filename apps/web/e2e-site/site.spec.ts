import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

/**
 * O site do BellarisOS (bellarisos.com, apps/site — 2026-10-17). Quem lê é a
 * dona da clínica que ainda não conhece o sistema: a página tem de abrir
 * rápida, sem nada de fora, levar ao teste grátis e mostrar o preço VERDADEIRO
 * — o dos planos do sistema, não um número escrito na página.
 */

const CLINICA = process.env.CLINICA_URL!
const reais = (centavos: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(centavos / 100).replace(/\s/g, ' ')
const semEspacoDuro = (s: string) => s.replace(/\s/g, ' ')

interface Plano { nome: string; valor_centavos: number; ativo: boolean; ordem: number }

async function planosDoBanco(): Promise<Plano[]> {
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  const { data, error } = await admin.from('platform_plans').select('nome, valor_centavos, ativo, ordem').order('ordem')
  if (error) throw error
  return data as Plano[]
}

test('o topo leva ao teste grátis e ao login da clínica', async ({ page }) => {
  const resposta = await page.goto('/')
  expect(resposta?.status()).toBe(200)
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

  const comecar = page.getByRole('link', { name: /Começar grátis/ }).first()
  await expect(comecar).toHaveAttribute('href', `${CLINICA}/register`)
  await expect(page.getByRole('link', { name: 'Entrar' }).first()).toHaveAttribute('href', `${CLINICA}/login`)
  // O teste grátis é dito com o prazo: é a promessa da chamada.
  await expect(page.getByText(/14 dias/).first()).toBeVisible()
})

test('os preços são os dos planos ATIVOS do sistema', async ({ page }) => {
  const planos = await planosDoBanco()
  const ativos = planos.filter(p => p.ativo)
  expect(ativos.length, 'o banco de teste precisa de plano ativo').toBeGreaterThan(0)

  await page.goto('/')
  const precos = page.locator('#precos')
  await expect(precos).toBeVisible()
  const texto = semEspacoDuro(await precos.innerText())
  for (const p of ativos) {
    expect(texto, `faltou o plano ${p.nome}`).toContain(p.nome)
    expect(texto, `faltou o preço de ${p.nome}`).toContain(reais(p.valor_centavos))
  }
  for (const p of planos.filter(x => !x.ativo)) {
    await expect(precos.getByRole('heading', { name: p.nome, exact: true })).toHaveCount(0)
  }
  // Cada plano chama para o mesmo teste grátis.
  await expect(precos.getByRole('link', { name: /Começar grátis/ })).toHaveCount(ativos.length)
})

test('os planos saem por uma função pública que só mostra o que é público', async () => {
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } })
  const { data, error } = await anon.rpc('planos_do_site')
  expect(error).toBeNull()
  const linhas = data as Record<string, unknown>[]
  const ativos = (await planosDoBanco()).filter(p => p.ativo)
  expect(linhas.map(l => l.nome)).toEqual(ativos.map(p => p.nome))
  for (const l of linhas) {
    expect(Object.keys(l).sort()).toEqual(['descricao', 'nome', 'ordem', 'recursos', 'valor_centavos'])
    // A cota do Copilot é conta interna, não vitrine.
    expect(l.recursos).not.toHaveProperty('cotas')
  }
  // A tabela continua fechada para a chave pública.
  const direto = await anon.from('platform_plans').select('id')
  expect(direto.data ?? []).toEqual([])
})

test('não carrega nada de fora: nem script, nem a Meta', async ({ page }) => {
  const deFora: string[] = []
  page.on('request', r => {
    const u = new URL(r.url())
    const proprio = u.origin === new URL(process.env.E2E_SITE_URL!).origin
    const fonte = /^(fonts\.googleapis\.com|fonts\.gstatic\.com)$/.test(u.hostname)
    if (!proprio && !fonte && !u.protocol.startsWith('data')) deFora.push(r.url())
  })
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  expect(deFora).toEqual([])
})

test('cabe no celular, e toda imagem carrega', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 })
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  // As imagens de baixo carregam quando chegam à tela.
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 60)) }
  })
  await page.waitForLoadState('networkidle')
  const estoura = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
  expect(estoura, 'a página rolou para o lado em 360px').toBe(false)
  const quebradas = await page.evaluate(() =>
    [...document.images].filter(i => i.complete && i.naturalWidth === 0).map(i => i.currentSrc || i.src))
  expect(quebradas).toEqual([])
  expect(await page.locator('img').count(), 'a página mostra as telas do sistema').toBeGreaterThan(3)
})

test('o rodapé leva à política de privacidade da clínica', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('link', { name: 'Política de Privacidade' })).toHaveAttribute('href', `${CLINICA}/privacidade`)
})

test('buscador e compartilhamento: robots, sitemap, imagem e dados estruturados', async ({ page, request }) => {
  const robots = await request.get('/robots.txt')
  expect(robots.status()).toBe(200)
  expect(await robots.text()).toContain('Sitemap:')
  const sitemap = await request.get('/sitemap.xml')
  expect(sitemap.status()).toBe(200)
  const og = await request.get('/opengraph-image')
  expect(og.status()).toBe(200)
  expect(og.headers()['content-type']).toContain('image/')

  await page.goto('/')
  await expect(page.locator('meta[property="og:image"]')).toHaveCount(1)
  const ld = JSON.parse(await page.locator('script[type="application/ld+json"]').first().textContent() ?? '{}')
  expect(ld['@type']).toBe('SoftwareApplication')
  const ativos = (await planosDoBanco()).filter(p => p.ativo)
  expect(ld.offers?.length).toBe(ativos.length)
})

test('www vai para o domínio sem www', async ({ request }) => {
  const r = await request.get('/', { headers: { host: 'www.bellarisos.com' }, maxRedirects: 0 })
  expect(r.status()).toBe(308)
  expect(r.headers().location).toBe('https://bellarisos.com/')
})
