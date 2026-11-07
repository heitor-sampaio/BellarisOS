import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcaoComFormulario } from './apoio/acao-direta'

/**
 * O Estoque da 2ª unidade na 9ª simulação (2026-11-07):
 * - D8: no Estoque da Menino Deus, a Carolina (da rede) criou o produto com
 *   "Adicionar estoque inicial" e só o estoque foi recusado ("Escolha a
 *   unidade que vai receber o estoque inicial.", sem seletor). O produto ficou
 *   (OUT-001, 0 un), e repetir criou o OUT-002. Agora o estoque vai para a
 *   unidade da tela, e o produto não nasce quando o estoque é recusado.
 * - A6: o nome repetido entra calado, e o seletor de insumo mostra as duas
 *   linhas iguais. Agora avisa (sem recusar — princípio 2) e o seletor diz o SKU.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let menino = ''
let slugMenino = ''
let dona: MembroDeTeste | null = null
const MANTA = `${PREFIXO} Manta eu9${marca}`

async function como(browser: Browser, estado: string, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}
const produtos = async (nome: string) => ((await db().from('products').select('id, sku').eq('tenant_id', rede!.tenantId).eq('name', nome)).data ?? []) as { id: string; sku: string }[]

async function novoProduto(p: Page, nome: string, qtd: string) {
  await p.goto(`/${slugMenino}/estoque`)
  await expect(async () => {
    await p.getByRole('button', { name: 'Novo produto' }).first().click({ timeout: 1000 })
    await expect(p.getByRole('switch', { name: /Adicionar estoque inicial/ })).toBeVisible({ timeout: 1000 })
  }).toPass()
  const modal = p.locator('dialog[open]')
  await modal.locator('input[name="name"]').fill(nome)
  await modal.locator('select[name="unit"]').selectOption({ index: 1 })
  await modal.getByRole('switch', { name: /Adicionar estoque inicial/ }).click()
  await modal.locator('input[name="initial_qty"]').fill(qtd)
  await modal.getByRole('button', { name: 'Criar produto' }).click()
  return modal
}

test.use({ storageState: { cookies: [], origins: [] } })

test.beforeAll(async () => {
  test.setTimeout(150_000)
  rede = await criarOutraRede(`es9${marca}`)
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  slugMenino = `e2e-md-es9${marca}`
  const { data: b, error } = await db().from('branches')
    .insert({ tenant_id: rede.tenantId, name: `${PREFIXO} Menino Deus es9${marca}`, slug: slugMenino }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  menino = b!.id
  dona = await criarMembro(`es9d${marca}`, { tenant: rede.tenantId, donoDaRede: true, rotulo: 'Dona', permissoes: [] })
})

test.afterAll(async () => {
  await dona?.limpar()
  await rede?.limpar()
})

test('D8: no Estoque da unidade, quem é da rede cria o produto com o estoque inicial nela', async ({ browser }) => {
  await como(browser, dona!.estado, async p => {
    const modal = await novoProduto(p, MANTA, '5')
    await expect(modal).toBeHidden()
  })
  await expect.poll(async () => (await produtos(MANTA)).length).toBe(1)
  const [manta] = await produtos(MANTA)
  await expect.poll(async () => Number((await db().from('branch_product_stock').select('current_stock')
    .eq('product_id', manta!.id).eq('branch_id', menino).maybeSingle()).data?.current_stock ?? 0), { message: 'o estoque entrou na Menino Deus' }).toBe(5)
})

test('D8: recusado o estoque inicial (sem unidade), o produto não nasce', async ({ browser }) => {
  const OLEO = `${PREFIXO} Óleo es9${marca}`
  await como(browser, dona!.estado, async p => {
    const r = await chamarAcaoComFormulario(p, 'actions/stock.ts', 'createProduct', '/admin/estoque', [undefined], {
      name: OLEO, unit: 'un', uso: 'INSUMO', initial_qty: '3',
    })
    expect(r.texto).toContain('Escolha a unidade que vai receber o estoque inicial')
  })
  expect(await produtos(OLEO), 'nada gravado pela metade').toHaveLength(0)
})

test('A6: o nome repetido pergunta antes (sem recusar) e o seletor de insumo diz o SKU', async ({ browser }) => {
  expect(await produtos(MANTA), 'a manta do teste anterior').toHaveLength(1)
  await como(browser, dona!.estado, async p => {
    const modal = await novoProduto(p, MANTA, '2')
    const pergunta = modal.locator('[data-nome-repetido]')
    await expect(pergunta).toContainText(`Já existe o produto “${MANTA}”`)
    expect(await produtos(MANTA), 'sem a resposta, não grava').toHaveLength(1)
    await pergunta.getByRole('button', { name: 'Cadastrar mesmo assim' }).click()
    await expect(modal).toBeHidden()
  })
  await expect.poll(async () => (await produtos(MANTA)).length).toBe(2)
  const skus = (await produtos(MANTA)).map(x => x.sku)
  await como(browser, dona!.estado, async p => {
    await p.goto('/admin/procedures')
    await p.getByRole('button', { name: /Novo procedimento/ }).first().click()
    const modal = p.locator('dialog[open]')
    await modal.getByRole('button', { name: 'Adicionar insumo' }).click()
    const opcoes = await modal.locator('select option').allTextContents()
    for (const sku of skus) expect(opcoes.some(o => o.includes(MANTA) && o.includes(sku)), `o insumo ${sku} se distingue`).toBe(true)
  })
})
