import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { criarAtendente, plataformaNoAr, urlDaPlataforma, type AtendenteDeTeste } from './apoio/plataforma'
import { FUNCIONALIDADES } from '@estetica-os/nucleo/lib/planos/recursos'

/**
 * O COMPARATIVO dos planos na tela de Planos do sistema (2026-10-07, pedido
 * do Heitor): tudo o que cada plano inclui, numa tabela — uma coluna por plano.
 * O Gerente também vê. No celular, sem rolagem lateral: cada linha vira um
 * bloco, com o valor de cada plano rotulado.
 */
test.skip(!plataformaNoAr(), 'a plataforma roda em apps próprios: só contra o build (playwright.build.config.ts)')

const marca = Date.now().toString(36)
const db = () => banco()
const SIS = () => urlDaPlataforma('sistema')
const A = `[e2e] Comparar A ${marca}`
const B = `[e2e] Comparar B ${marca}`

let admin: AtendenteDeTeste
let gerente: AtendenteDeTeste
// Exigida pelo grupo dos isolados (cria a própria rede); o comparativo não a usa.
let outra: OutraRede

test.beforeAll(async () => {
  test.setTimeout(240_000)
  admin = await criarAtendente(`cpad${marca}`, { papel: 'ADMIN' })
  gerente = await criarAtendente(`cpge${marca}`, { papel: 'GERENTE' })
  outra = await criarOutraRede(`cp${marca}`)
  const todas = FUNCIONALIDADES.map(f => f.chave)
  const { error } = await db().from('platform_plans').insert([
    { nome: A, valor_centavos: 19900, ordem: 9001, recursos: {
      funcionalidades: todas.filter(c => c !== 'pacotes' && c !== 'copilot'),
      limites: { unidades: 1, membros: null, whatsapp: 2 },
      adicionais: { whatsapp: { valor_centavos: 4900 } },
    } },
    { nome: B, valor_centavos: 49900, ordem: 9002, recursos: {
      funcionalidades: todas, limites: { unidades: null, membros: null, whatsapp: null }, adicionais: {},
    } },
  ])
  expect(error).toBeNull()
})

test.afterAll(async () => {
  await db().from('platform_plans').delete().like('nome', `[e2e]%${marca}%`)
  if (outra) await outra.limpar()
  for (const a of [gerente, admin]) if (a) await a.limpar()
})

async function com(browser: Browser, estado: string, fn: (p: Page) => Promise<void>, viewport?: { width: number; height: number }) {
  const ctx = await browser.newContext({ storageState: estado, ...(viewport ? { viewport } : {}) })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

/** O texto da célula do plano `plano` na linha `rotulo`. */
async function celula(p: Page, rotulo: string, plano: string): Promise<string> {
  const tabela = p.getByRole('table', { name: 'Comparativo dos planos' })
  const cabecalho = await tabela.getByRole('columnheader').allTextContents()
  const i = cabecalho.findIndex(t => t.includes(plano))
  expect(i, `coluna de ${plano}`).toBeGreaterThan(0)
  const linha = tabela.getByRole('row').filter({ has: p.getByRole('rowheader', { name: rotulo, exact: true }) })
  return (await linha.getByRole('cell').nth(i - 1).innerText()).replace(/\s+/g, ' ').trim()
}

test('o comparativo mostra, plano a plano, preço, funcionalidades, limites e adicionais', async ({ browser }) => {
  await com(browser, admin.estado, async p => {
    await p.goto(`${SIS()}/planos`)
    await expect(p.getByRole('table', { name: 'Comparativo dos planos' })).toBeVisible({ timeout: 20_000 })
    expect(await celula(p, 'Valor mensal', A)).toBe('R$ 199,00')
    expect(await celula(p, 'Pacotes', A)).toBe('Não incluído')
    expect(await celula(p, 'Pacotes', B)).toBe('Incluído')
    expect(await celula(p, 'Unidades', A)).toBe('1')
    expect(await celula(p, 'Unidades', B)).toBe('Ilimitado')
    expect(await celula(p, 'Conexão de WhatsApp adicional', A)).toBe('R$ 49,00 por conexão')
    expect(await celula(p, 'Conexão de WhatsApp adicional', B)).toBe('Ilimitado no plano')
  })
})

test('o Gerente vê o comparativo', async ({ browser }) => {
  await com(browser, gerente.estado, async p => {
    await p.goto(`${SIS()}/planos`)
    await expect(p.getByRole('table', { name: 'Comparativo dos planos' })).toBeVisible({ timeout: 20_000 })
    expect(await celula(p, 'Pacotes', B)).toBe('Incluído')
  })
})

test('no celular, sem rolagem lateral: cada linha vira um bloco com o valor de cada plano rotulado', async ({ browser }) => {
  await com(browser, admin.estado, async p => {
    await p.goto(`${SIS()}/planos`)
    const tabela = p.getByRole('table', { name: 'Comparativo dos planos' })
    await expect(tabela).toBeVisible({ timeout: 20_000 })
    const larguras = await p.evaluate(() => ({ doc: document.documentElement.scrollWidth, tela: window.innerWidth }))
    expect(larguras.doc, 'a página não rola de lado').toBeLessThanOrEqual(larguras.tela)
    const caixa = await tabela.boundingBox()
    expect(caixa!.width, 'a tabela cabe na tela').toBeLessThanOrEqual(390)
    // O rótulo do plano acompanha o valor no bloco (data-label).
    const linha = tabela.getByRole('row').filter({ has: p.getByRole('rowheader', { name: 'Pacotes', exact: true }) })
    await expect(linha.locator(`[data-label="${B}"]`)).toBeVisible()
  }, { width: 390, height: 844 })
})
