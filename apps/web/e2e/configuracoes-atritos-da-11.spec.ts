import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * Os atritos de configuração da 11ª simulação (2026-11-10, a Renata da
 * Violeta e a Marta da Azaleia), numa rede [e2e] própria:
 *
 * - A12: a embalagem não tinha "seringa" (o ácido hialurônico virou "un").
 * - A13: a calculadora do procedimento mostrava R$ 7,95/U (o último custo)
 *   sem dizer que era o último custo — o lote que sai primeiro custa 7,80.
 * - A14: o aviso "profissionais sem comissão" e a pílula "Sem comissão"
 *   incluíam a dona, que fica sem comissão de propósito (princípio 1).
 */

test.setTimeout(180_000)

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede
let dona: MembroDeTeste

async function como(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado, viewport: { width: 1440, height: 900 } })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`cfg11${marca}`)
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  dona = await criarMembro(`cfg11d${marca}`, { tenant: rede.tenantId, donoDaRede: true, rotulo: 'Dona', permissoes: [] })
})

test.afterAll(async () => {
  await dona?.limpar()
  await rede?.limpar()
})

test('A12: a embalagem do produto oferece "seringa"', async ({ browser }) => {
  await como(browser, dona, async p => {
    await p.goto('/admin/estoque')
    await p.getByRole('button', { name: 'Novo produto' }).first().click()
    await expect(p.getByLabel(/^Embalagem/).locator('option[value="seringa"]')).toHaveCount(1)
  })
})

test('A13: o insumo do procedimento diz que o custo é o último custo, e que a baixa vai pelo lote', async ({ browser }) => {
  const produto = await rede.criarProduto('Toxina A13')
  expect((await db().from('products').update({ cost_price: 795, units_per_package: 100, consumption_unit: 'U', uso: 'INSUMO' }).eq('id', produto)).error).toBeNull()
  expect((await db().from('procedure_products').insert({ procedure_id: rede.procedureId, product_id: produto, quantity: 30, unit_cost: 7.95 })).error).toBeNull()
  await como(browser, dona, async p => {
    await p.goto('/admin/procedures')
    await p.locator('tr', { hasText: `Proc cfg11${marca}` }).getByRole('button', { name: 'Editar' }).click()
    await expect(p.locator('[data-custo-do-insumo-e-o-ultimo]')).toContainText('último custo de compra')
    await expect(p.locator('[data-custo-do-insumo-e-o-ultimo]')).toContainText('custo do lote')
  })
})

// A14 da 11ª saiu em 2026-11-13 (o Heitor: "Só tira o \"de proposito\" na
// caixa tambem"): não existe mais "sem comissão, de propósito" — nem o atalho
// na linha da Equipe, nem a caixa na janela, nem a exceção no aviso.
test('A14 (revista): não há "sem comissão, de propósito" — quem atende sem comissão fica no aviso', async ({ browser }) => {
  // Uma marca antiga no banco não vale mais nada.
  expect((await db().from('users').update({ provides_services: true, atende_em: [rede.branchId], sem_comissao_de_proposito: true }).eq('id', dona.userId)).error).toBeNull()
  await como(browser, dona, async p => {
    await p.goto('/admin/settings?tab=comissoes')
    const aviso = p.locator('[data-sem-regra]')
    await expect(aviso).toContainText('Dona')
    await expect(aviso).not.toContainText('propósito')
    await p.goto('/admin/team')
    const chip = p.locator(`[data-comissao="${dona.userId}"]`)
    await expect(chip).toHaveText('Sem comissão')
    await expect(chip).toHaveClass(/chip-warning/)
    await chip.click()
    const janela = p.getByRole('dialog', { name: /Comissão de/ })
    await expect(janela.getByText('Comissão padrão', { exact: true })).toBeVisible()
    await expect(janela.locator('[data-sem-comissao-de-proposito]')).toHaveCount(0)
    await expect(janela).not.toContainText('propósito')
  })
})
