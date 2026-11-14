import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * Os atritos de estoque da 11ª simulação (2026-11-10, a Gisele da Azaleia),
 * numa rede [e2e] própria:
 * - A49: "o un aberto conta pela fração que sobra nele (0,7 un = 700 g)" e
 *   "Operação crítica… inconsistência" assustavam numa contagem de rotina.
 * - A50: o Histórico destacava "+50.000 g" para 50 refis, e "Atual: 11 refil"
 *   valia 10,84 (as embalagens com a aberta).
 * - A51: a entrada com a validade já vencida era aceita calada.
 * - A52: nenhuma confirmação ao registrar a entrada, a perda e o ajuste.
 * - A53: "Aplicado em" parecia um rótulo vazio no lote ainda sem uso.
 * - A54: a nota com 3 produtos repetia a nota 3 vezes.
 */

test.setTimeout(180_000)

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede
let slug = ''
let dona: MembroDeTeste
let cera = ''
const nomeCera = `${PREFIXO} Cera ${marca}`
const nomeGel = `${PREFIXO} Gel ${marca}`

async function como(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado, viewport: { width: 1440, height: 900 } })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}
async function abrirGerenciar(p: Page, nome: string) {
  await p.goto(`/${slug}/estoque`)
  await p.getByRole('row').filter({ hasText: nome }).first().getByTitle('Gerenciar estoque').click()
  return p.locator('dialog[open]').filter({ hasText: 'Gerenciar estoque' })
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`es11${marca}`)
  const b = db()
  expect((await b.from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  slug = (await b.from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  dona = await criarMembro(`es11d${marca}`, { tenant: rede.tenantId, donoDaRede: true, rotulo: 'Dona', permissoes: [] })
  const produtos = await b.from('products').insert([
    { tenant_id: rede.tenantId, name: nomeCera, unit: 'refil', consumption_unit: 'g', units_per_package: 1000, cost_price: 39.5, uso: 'INSUMO' },
    { tenant_id: rede.tenantId, name: nomeGel, unit: 'frasco', uso: 'INSUMO', cost_price: 20 },
  ]).select('id, name')
  expect(produtos.error).toBeNull()
  cera = produtos.data!.find(p => p.name === nomeCera)!.id as string
  // 10,84 refis: 10 fechados e um aberto com 840 g.
  expect((await b.rpc('estoque_entrada', {
    p_produto: cera, p_unidade: rede.branchId, p_quantidade: 11, p_custo: 39.5, p_observacao: null,
    p_lote: `CE-${marca}`, p_validade: '2027-12-31', p_autor: 'e2e',
  })).error).toBeNull()
  expect((await b.from('branch_product_stock').update({ current_rendimento: 10840 }).eq('product_id', cera).eq('branch_id', rede.branchId)).error).toBeNull()
})

test.afterAll(async () => {
  await dona?.limpar(); await rede?.limpar()
})

test('A50: o mínimo diz "10 refis fechados + 1 aberto com 840 g", não "Atual: 11 refil"', async ({ browser }) => {
  await como(browser, dona, async p => {
    const modal = await abrirGerenciar(p, nomeCera)
    await modal.getByRole('button', { name: 'Estoque mínimo' }).click()
    await expect(modal.getByText(/10 refis fechados \+ 1 aberto com 840 g/)).toBeVisible()
  })
})

test('A49: o ajuste fala da contagem sem assustar, e diz o aberto em palavras simples', async ({ browser }) => {
  await como(browser, dona, async p => {
    const modal = await abrirGerenciar(p, nomeCera)
    await modal.getByRole('button', { name: 'Ajuste', exact: true }).click()
    await expect(modal).not.toContainText('Operação crítica')
    await expect(modal).not.toContainText('inconsistência')
    await modal.getByLabel(/Contagem|Nova quantidade|Quantidade contada/).first().fill('10,5')
    const eq = modal.locator('[data-ajuste-equivale]')
    await expect(eq).toContainText('10,5 refis = 10.500 g')
    await expect(eq).not.toContainText('fração')
    await expect(eq).toContainText('metade')
  })
})

test('A51, A52 e A54: a validade vencida avisa, a entrada confirma, e a próxima entrada traz a mesma nota', async ({ browser }) => {
  await como(browser, dona, async p => {
    const modal = await abrirGerenciar(p, nomeGel)
    await modal.getByLabel('Quantidade *').fill('3')
    await modal.getByLabel('Validade').fill('2025-01-01')
    await expect(modal.locator('[data-validade-vencida]')).toContainText('já passou')
    await modal.getByLabel('Nota fiscal').fill(`NF-${marca}`)
    // C76 + E6 (Bloco Estoque): o fornecedor é da lista da rede, com busca; o novo se cadastra ali mesmo.
    await modal.getByRole('combobox', { name: 'Fornecedor', exact: true }).fill('Distribuidora Sul')
    await modal.getByRole('option', { name: /Novo fornecedor/ }).click()
    await expect(modal.locator('[data-campo-escolhido="Fornecedor"]')).toContainText('Distribuidora Sul')
    await modal.getByRole('button', { name: 'Registrar entrada' }).click()
    await expect(p.getByText(/Entrada registrada: \+3 frasco/)).toBeVisible({ timeout: 15_000 })
    // A54: a próxima entrada (outro produto da mesma nota) já vem com ela.
    const outro = await abrirGerenciar(p, nomeCera)
    await expect(outro.getByLabel('Nota fiscal')).toHaveValue(`NF-${marca}`)
    await expect(outro.locator('[data-nota-da-entrada-anterior]')).toContainText('apague')
  })
})

test('A50: o Histórico destaca a entrada na embalagem ("+2 refil"), com os gramas embaixo', async ({ browser }) => {
  expect((await db().rpc('estoque_entrada', {
    p_produto: cera, p_unidade: rede.branchId, p_quantidade: 2, p_custo: 39.5, p_observacao: null,
    p_lote: null, p_validade: null, p_autor: 'e2e',
  })).error).toBeNull()
  await como(browser, dona, async p => {
    const modal = await abrirGerenciar(p, nomeCera)
    await modal.getByRole('button', { name: 'Histórico' }).click()
    const primeira = modal.locator('[data-movimento]').first()
    await expect(primeira.locator('[data-quantidade-principal]')).toHaveText('+2 refis')
    await expect(primeira).toContainText('2.000 g')
  })
})

test('A53: o "Aplicado em" do lote diz que é para ver em quem foi aplicado', async ({ browser }) => {
  await como(browser, dona, async p => {
    await p.goto(`/${slug}/estoque`)
    await p.getByRole('row').filter({ hasText: nomeCera }).first().click()
    await expect(p.getByRole('button', { name: /Aplicado em: ver clientes/ }).first()).toBeVisible()
  })
})
