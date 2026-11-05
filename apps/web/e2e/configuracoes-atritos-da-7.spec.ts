import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcaoComFormulario } from './apoio/acao-direta'

/**
 * Os atritos de Configurações e cargos da 7ª simulação (2026-11-05), pelas
 * regras de sempre — a tela passa a dizer a regra:
 * - A3: "Preencher pela taxa por parcela" multiplica (a regra do Heitor); a
 *   tabela real da operadora não é assim, e os dois times digitaram linha a
 *   linha. A tela deixa COLAR a tabela e mostra antes o que vai preencher;
 * - A5: a recompensa "Procedimento grátis" pede o procedimento cadastrado, e a
 *   tela não dizia quanto os pontos valem pelo valor do ponto;
 * - A6: o produto de revenda sem categoria ganhava o SKU na sequência dos
 *   insumos ("OUT-004");
 * - A7: o resumo do cargo Financeiro dizia "Configurações", sem dizer que é só
 *   a aba Comissões;
 * - A8: o resumo do SDR contava Relatórios "só a própria unidade" como "só os
 *   próprios";
 * - A9: "1 clientes" no dashboard, e "Admin" por último no seletor de cargo.
 * Numa rede [e2e] própria.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede
let dona: MembroDeTeste
let financeiro: MembroDeTeste
let sdr: MembroDeTeste

async function como(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  test.setTimeout(180_000)
  rede = await criarOutraRede(`cf7${marca}`)
  // Sem o /setup concluído, o portal da rede leva a dona para lá.
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  dona = await criarMembro(`cf7d${marca}`, { tenant: rede.tenantId, donoDaRede: true, permissoes: [] })
  financeiro = await criarMembro(`cf7f${marca}`, {
    tenant: rede.tenantId, rotulo: `Financeiro cf7${marca}`,
    permissoes: [{ modulo: 'financial', nivel: 'MANAGE', escopo: 'ALL' }, { modulo: 'cashier', nivel: 'MANAGE' }],
  })
  sdr = await criarMembro(`cf7s${marca}`, {
    tenant: rede.tenantId, rotulo: `SDR cf7${marca}`,
    permissoes: [
      { modulo: 'crm', nivel: 'MANAGE', escopo: 'OWN' }, { modulo: 'clients', nivel: 'VIEW' },
      { modulo: 'reports', nivel: 'VIEW', escopo: 'OWN' },
    ],
  })
  // A fidelidade ligada, com o ponto a R$ 0,01 (A5).
  expect((await db().from('loyalty_configs').upsert({ tenant_id: rede.tenantId, enabled: true, redeem_points_value: 0.01 }, { onConflict: 'tenant_id' })).error).toBeNull()
  expect((await db().from('procedures').update({ price: 150 }).eq('id', rede.procedureId)).error).toBeNull()
})

test.afterAll(async () => {
  test.setTimeout(120_000)
  await sdr?.limpar()
  await financeiro?.limpar()
  await dona?.limpar()
  await rede?.limpar()
})

test('A3: colar a tabela da operadora preenche cada vez com a taxa dela — e diz antes o que vai preencher', async ({ browser }) => {
  await como(browser, dona, async p => {
    await p.goto('/admin/settings?tab=comissoes')
    const card = p.getByLabel('Taxas da maquininha')
    await card.getByRole('button', { name: 'Colar a tabela da operadora' }).click()
    await card.getByLabel('Tabela da operadora').fill('1x\t2,99%\n2x\t4,09%\n3x\t4,79%\n4x\t5,39%\n5x\t5,99%\n6x\t6,50%')
    await expect(card.locator('[data-tabela-colada]')).toContainText('6x 6,50%')
    await expect(card.locator('[data-tabela-colada]')).toContainText('1x 2,99%')
    await card.getByRole('button', { name: 'Preencher com a tabela' }).click()
    await expect(card.getByLabel('Taxa 6x', { exact: true })).toHaveValue('6,50')
    await expect(card.getByLabel('Taxa 2x', { exact: true })).toHaveValue('4,09')
  })
  // Só preenche: grava no "Salvar taxas" de sempre.
  const { data } = await db().from('payment_fees').select('parcelas').eq('tenant_id', rede.tenantId).eq('metodo', 'CREDIT_CARD').eq('parcelas', 6)
  expect(data ?? []).toEqual([])
})

test('A5: "Procedimento grátis" diz que o procedimento vem do catálogo e quanto os pontos valem', async ({ browser }) => {
  await como(browser, dona, async p => {
    await p.goto('/admin/settings?tab=fidelidade')
    await p.getByRole('button', { name: 'Nova recompensa' }).click()
    const form = p.getByTestId('formulario-de-recompensa')
    await expect(form.locator('[data-procedimento-da-recompensa]')).toContainText('cadastrado em Procedimentos')
    await expect(form.locator('[data-procedimento-da-recompensa]').getByRole('link', { name: 'Procedimentos' })).toHaveAttribute('href', /procedures/)
    await form.locator('select[name="procedimento"]').selectOption(rede.procedureId)
    await form.locator('input[name="custo"]').fill('2000')
    const valor = form.locator('[data-valor-dos-pontos]')
    await expect(valor).toContainText('2.000 pontos valem R$ 20,00')
    await expect(valor).toContainText('R$ 0,01')
    await expect(valor).toContainText('R$ 150,00')
  })
})

test('A6: o produto de revenda sem categoria não entra na sequência dos insumos', async ({ browser }) => {
  await como(browser, dona, async p => {
    await p.goto('/admin/estoque')
    const criar = (nome: string, uso: string) => chamarAcaoComFormulario(p, 'actions/stock.ts', 'createProduct', '/admin/estoque', [undefined], {
      name: `${PREFIXO} ${nome} ${marca}`, unit: 'un', uso, ...(uso === 'INSUMO' ? {} : { sale_price: '50,00' }),
    })
    expect((await criar('Insumo A6', 'INSUMO')).status).toBe(200)
    expect((await criar('Revenda A6', 'REVENDA')).status).toBe(200)
  })
  const sku = async (nome: string) => (await db().from('products').select('sku').eq('tenant_id', rede.tenantId)
    .eq('name', `${PREFIXO} ${nome} ${marca}`).single<{ sku: string }>()).data?.sku
  expect(await sku('Insumo A6')).toMatch(/^OUT-\d{3}$/)
  expect(await sku('Revenda A6')).toBe('REV-001')
})

test('A7/A8: o resumo do cargo diz a aba de Configurações e não conta "só a unidade" como "só os próprios"', async ({ browser }) => {
  await como(browser, dona, async p => {
    await p.goto('/admin/settings?tab=permissions')
    // A8: o cartão do SDR.
    const cartaoSdr = p.getByText(`SDR cf7${marca}`).first().locator('xpath=ancestor::div[2]')
    await expect(cartaoSdr).toContainText('1 só os próprios')
    await expect(cartaoSdr).toContainText('Relatórios só da unidade')
    await expect(cartaoSdr).not.toContainText('2 só os próprios')

    // A7: o Financeiro alcança só a aba Comissões (com as taxas).
    await p.getByText(`Financeiro cf7${marca}`).first().click()
    await expect(p.getByRole('heading', { name: new RegExp(`Financeiro cf7${marca}`) })).toBeVisible()
    await expect(p.locator('[data-resumo-na-rede]')).toContainText('Configurações (só Comissões e taxas)')
  })
})

test('A9: o dashboard diz "1 cliente", e o seletor de cargo põe a Admin primeiro', async ({ browser }) => {
  await rede.criarCliente('Única A9')
  await como(browser, dona, async p => {
    await p.goto('/admin/dashboard')
    await expect(p.getByText(/· 1 cliente(\b| da clínica)/).first()).toBeVisible()
    await expect(p.getByText('1 clientes')).toHaveCount(0)

    await p.goto('/admin/team')
    await p.getByRole('button', { name: 'Adicionar membro' }).click()
    const opcoes = await p.locator('#tm-role option').allTextContents()
    expect(opcoes[0]).toBe('Selecione…')
    expect(opcoes[1], 'a Admin vem primeiro').toBe('Admin')
  })
})
