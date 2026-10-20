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
  // Cada plano chama para o mesmo teste grátis (nos cartões; a calculadora tem o dela).
  await expect(precos.locator('.site-planos').getByRole('link', { name: /Começar grátis/ })).toHaveCount(ativos.length)
})

// A calculadora (pedido do Heitor, 2026-10-19): ela diz o tamanho da clínica e
// a página indica o plano — o de menor total que CABE, com os números do sistema.
test('a calculadora indica um plano que cabe no tamanho da clínica', async ({ page }) => {
  const ativos = (await planosDoBanco()).filter(p => p.ativo)
  test.skip(!ativos.length, 'sem plano ativo no sistema')
  const { data: comLimites } = await createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
    .from('platform_plans').select('nome, valor_centavos, recursos').eq('ativo', true)
  const limites = new Map((comLimites ?? []).map(p => [p.nome as string, (p.recursos as { limites: { unidades: number | null } }).limites]))

  await page.goto('/')
  const calc = page.locator('#calculadora')
  await expect(calc.getByRole('heading', { level: 3 })).toBeVisible()
  // Já nasce com uma indicação (a clínica de uma unidade), mesmo antes de mexer.
  await expect(calc.locator('[data-indicado]')).toBeVisible()

  // Mais unidades do que qualquer plano com limite: o indicado tem de caber.
  const maiorLimite = Math.max(0, ...[...limites.values()].map(l => l.unidades ?? 0))
  await calc.getByLabel('Unidades', { exact: true }).fill(String(maiorLimite + 1))
  await calc.getByLabel('Unidades', { exact: true }).blur()
  const semLimite = [...limites.entries()].filter(([, l]) => l.unidades === null).map(([nome]) => nome)
  if (!semLimite.length) {
    await expect(calc.locator('[data-nenhum]')).toBeVisible()
    return
  }
  const nome = (await calc.locator('[data-indicado] [data-plano]').textContent())?.trim()
  expect(semLimite, 'o indicado não tem limite de unidades').toContain(nome)
  const plano = (comLimites ?? []).find(p => p.nome === nome)!
  expect(semEspacoDuro(await calc.locator('[data-indicado] [data-total]').innerText())).toBe(reais(plano.valor_centavos as number))
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

test('diz o que o BellarisOS é: o sistema operacional da clínica, ERP e CRM num sistema só', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(/sistema operacional/i)
  await expect(page.locator('#inicio')).toContainText(/sistema operacional/i)
  const umSo = page.locator('#um-sistema')
  await expect(umSo.getByRole('heading', { level: 2 })).toBeVisible()
  await expect(umSo).toContainText('ERP')
  await expect(umSo).toContainText('CRM')
  // As frentes da clínica, e a cliente ligada a elas.
  for (const frente of ['Comercial', 'Atendimento', 'Financeiro', 'Marketing', 'App da cliente']) {
    await expect(umSo.getByRole('heading', { name: frente, exact: true })).toBeVisible()
  }
})

// Pedido do Heitor (2026-10-19): o sistema SUBSTITUI vários que não conversam
// entre si — e isso aparece como troca concreta, linha por linha.
test('mostra a troca: o que a clínica faz hoje em vários sistemas, e o que vira num só', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('#inicio')).toContainText(/vários sistemas/i)
  const troca = page.locator('#troca')
  await expect(troca.getByRole('heading', { level: 2 })).toBeVisible()
  await expect(troca.getByText('Hoje, em vários sistemas', { exact: true })).toBeVisible()
  await expect(troca.getByText('Com o BellarisOS', { exact: true })).toBeVisible()
  // Cada linha: o antes e o depois, lado a lado.
  const linhas = troca.locator('[data-troca]')
  await expect(linhas).toHaveCount(6)
  for (const linha of await linhas.all()) {
    await expect(linha.locator('[data-antes]')).not.toBeEmpty()
    await expect(linha.locator('[data-depois]')).not.toBeEmpty()
  }
})

test('mostra por que é fácil de usar — com o que o sistema tem de verdade', async ({ page }) => {
  await page.goto('/')
  const facil = page.locator('#facil')
  await expect(facil.getByRole('heading', { level: 2 })).toBeVisible()
  for (const item of ['Tudo a um atalho', 'Cada um vê o seu', 'Peça em português', 'No computador e no celular', 'Comece com o que já tem', 'Ajuda dentro do sistema']) {
    await expect(facil.getByRole('heading', { name: item, exact: true })).toBeVisible()
  }
})

// Pedido do Heitor (2026-10-20): "horário de silêncio" não se explica sozinho
// para quem não conhece o sistema — a explicação abre no próprio termo.
test('o horário de silêncio das automações se explica num tooltip', async ({ page }) => {
  await page.goto('/')
  const termo = page.getByRole('button', { name: 'horário de silêncio' })
  const dica = page.getByRole('tooltip')
  await expect(dica).toBeHidden()
  await termo.focus()
  await expect(dica).toBeVisible()
  await expect(dica).toContainText('21h')
  await expect(dica).toContainText('espera')
  await expect(termo).toHaveAttribute('aria-describedby', (await dica.getAttribute('id'))!)
})

test('o app da cliente tem seção própria, chamada no topo', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.site-topo').getByRole('link', { name: 'App da cliente' })).toHaveAttribute('href', '#app-da-cliente')
  const app = page.locator('#app-da-cliente')
  await expect(app.getByRole('heading', { level: 2 })).toBeVisible()
  // Mais de uma tela do portal, de verdade.
  expect(await app.locator('img').count()).toBeGreaterThanOrEqual(3)
})

test('o rodapé leva à política de privacidade da clínica', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('link', { name: 'Política de Privacidade' })).toHaveAttribute('href', `${CLINICA}/privacidade`)
})

test('buscador e compartilhamento: robots, sitemap, imagem e dados estruturados', async ({ page, request }) => {
  const robots = await request.get('/robots.txt')
  expect(robots.status()).toBe(200)
  const textoRobots = await robots.text()
  expect(textoRobots).toContain('Sitemap:')
  // GEO (2026-10-20): os robôs das IAs liberados com todas as letras.
  for (const robo of ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended']) expect(textoRobots).toContain(robo)
  const sitemap = await request.get('/sitemap.xml')
  expect(sitemap.status()).toBe(200)
  const og = await request.get('/opengraph-image')
  expect(og.status()).toBe(200)
  expect(og.headers()['content-type']).toContain('image/')

  await page.goto('/')
  await expect(page.locator('meta[property="og:image"]')).toHaveCount(1)
  // A descrição cabe no resultado da busca (até 160) e diz o que se busca.
  const descricao = await page.locator('meta[name="description"]').getAttribute('content')
  expect(descricao!.length).toBeLessThanOrEqual(160)
  expect(descricao).toMatch(/clínica de estética/i)

  // Os dados estruturados (2026-10-20): um grafo com a organização, o site,
  // o produto (cada plano ativo como oferta MENSAL) e as perguntas — as mesmas
  // da página, palavra por palavra.
  const ld = JSON.parse(await page.locator('script[type="application/ld+json"]').first().textContent() ?? '{}')
  interface NoDoGrafo {
    '@type': string; name?: string; inLanguage?: string; featureList?: string[]
    offers?: { priceSpecification?: { referenceQuantity?: { unitCode?: string } } }[]
    mainEntity?: { name: string }[]
  }
  const tipo = (t: string) => ((ld['@graph'] ?? []) as NoDoGrafo[]).find(n => n['@type'] === t)
  expect(tipo('Organization')?.name).toBe('BellarisOS')
  expect(tipo('WebSite')?.inLanguage).toBe('pt-BR')
  const app = tipo('SoftwareApplication')!
  const ativos = (await planosDoBanco()).filter(p => p.ativo)
  expect(app.offers?.length).toBe(ativos.length)
  for (const o of app.offers ?? []) expect(o.priceSpecification?.referenceQuantity?.unitCode).toBe('MON')
  expect(app.featureList?.length).toBeGreaterThan(5)
  const faq = tipo('FAQPage')!
  const naPagina = (await page.locator('#perguntas summary').allInnerTexts()).map(t => t.trim())
  expect((faq.mainEntity ?? []).map(q => q.name)).toEqual(naPagina)
  expect(naPagina).toContain('O que é o BellarisOS?')
  expect(naPagina).toContain('Quanto custa?')
})

// GEO (2026-10-20): o resumo para as IAs, em texto, com os preços do sistema.
test('o /llms.txt resume o produto e os planos para as IAs', async ({ request }) => {
  const r = await request.get('/llms.txt')
  expect(r.status()).toBe(200)
  expect(r.headers()['content-type']).toContain('text/plain')
  const texto = semEspacoDuro(await r.text())
  expect(texto).toMatch(/^# BellarisOS/)
  expect(texto).toMatch(/clínica de estética/i)
  for (const p of (await planosDoBanco()).filter(x => x.ativo)) {
    expect(texto).toContain(p.nome)
    expect(texto).toContain(reais(p.valor_centavos))
  }
})

// Os termos que não se explicam sozinhos (pedido do Heitor, 2026-10-20): cada
// um abre a explicação, e ela cabe na tela do celular.
const TERMOS: [string, RegExp][] = [
  ['ERP e CRM', /CRM[\s\S]*cliente[\s\S]*ERP/],
  ['O WhatsApp oficial da Meta', /QR code/],
  ['Modelos aprovados pela Meta', /24h/],
  ['tarifa da Meta', /Meta cobra/],
  ['DRE', /entrou[\s\S]*saiu/],
  ['inbox', /caixa de entrada/],
  ['Funil de oportunidades', /etapas/],
  ['horário de silêncio', /21h/],
]

test('cada termo do sistema se explica, e a explicação cabe no celular', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  for (const [termo, trecho] of TERMOS) {
    const botao = page.getByRole('button', { name: termo, exact: true })
    await botao.scrollIntoViewIfNeeded()
    await botao.focus()
    const dica = page.locator(`#${await botao.getAttribute('aria-describedby')}`)
    await expect(dica, termo).toBeVisible()
    await expect(dica, termo).toContainText(trecho)
    const caixa = (await dica.boundingBox())!
    expect(caixa.x, `${termo}: não sai pela esquerda`).toBeGreaterThanOrEqual(0)
    expect(caixa.x + caixa.width, `${termo}: não sai pela direita`).toBeLessThanOrEqual(390)
    expect(caixa.y, `${termo}: não sai por cima`).toBeGreaterThanOrEqual(0)
    await botao.blur()
  }
})

test('www vai para o domínio sem www', async ({ request }) => {
  const r = await request.get('/', { headers: { host: 'www.bellarisos.com' }, maxRedirects: 0 })
  expect(r.status()).toBe(308)
  expect(r.headers().location).toBe('https://bellarisos.com/')
})
