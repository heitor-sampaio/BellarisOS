import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * D19 da 8ª simulação (2026-11-06): "Itens zerados" divergia. Relatórios →
 * Estoque da rede dizia 1 (o Hidratante × Água Verde, que nunca teve entrada
 * lá) e o Estoque da rede dizia "Sem estoque 0" (o Hidratante tem saldo no
 * Batel). Os Relatórios contavam PARES unidade × produto (D10 da 6ª, a
 * migration 20261104002102 dizia "a mesma conta"), e a tela de estoque e o
 * dashboard contavam PRODUTOS no recorte (`contarSituacoes`).
 *
 * A conta é UMA, a dos produtos (a regra D10 das telas: sem estoque é não ter
 * saldo POSITIVO em nenhuma unidade do recorte): na rede, o produto sem saldo
 * em unidade nenhuma; recortado numa unidade (a linha da unidade nos
 * Relatórios, o filtro do Estoque), os sem saldo nela. A tela diz qual é.
 *
 * Numa rede [e2e] própria, com duas unidades: o Hidratante só tem saldo no
 * Batel; a Luva não tem saldo em lugar nenhum.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let dona: MembroDeTeste | null = null
let batel = ''

async function comoDona(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: dona!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  test.setTimeout(180_000)
  rede = await criarOutraRede(`ezu${marca}`)
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  const b = await db().from('branches').insert({ tenant_id: rede.tenantId, name: `${PREFIXO} Batel ${marca}`, slug: `e2e-ezu-batel-${marca}` })
    .select('id').single<{ id: string }>()
  expect(b.error).toBeNull()
  batel = b.data!.id
  const ps = await db().from('products').insert([
    { tenant_id: rede.tenantId, name: `${PREFIXO} Hidratante ${marca}`, unit: 'un' },
    { tenant_id: rede.tenantId, name: `${PREFIXO} Luva ${marca}`, unit: 'un' },
  ]).select('id, name')
  expect(ps.error).toBeNull()
  const hidratante = ps.data!.find(p => (p.name as string).includes('Hidratante'))!.id as string
  expect((await db().from('branch_product_stock').insert({ product_id: hidratante, branch_id: batel, current_stock: 4, min_stock: 0 })).error).toBeNull()
  dona = await criarMembro(`ezud${marca}`, { tenant: rede.tenantId, donoDaRede: true, rotulo: 'Dona', permissoes: [] })
})

test.afterAll(async () => {
  await dona?.limpar(); await rede?.limpar()
})

test('D19: Relatórios, dashboard e Estoque da rede dizem o mesmo número de produtos zerados — e dizem o que contam', async ({ browser }) => {
  const agora = new Date()
  const { data, error } = await db().rpc('metrics_relatorio', {
    p_tenant: rede!.tenantId, p_branch_ids: [rede!.branchId, batel],
    p_from: new Date(agora.getTime() - 86_400_000).toISOString(), p_to: agora.toISOString(),
    p_prev_from: new Date(agora.getTime() - 2 * 86_400_000).toISOString(), p_prev_to: new Date(agora.getTime() - 86_400_000).toISOString(),
    p_aba: 'estoque', p_granularidade: 'day', p_professional_id: null,
  })
  expect(error).toBeNull()
  const r = data as { zerados: number; estoque_por_unidade: { branch_id: string; zerados: number }[] }
  // Na rede: só a Luva (o Hidratante tem saldo no Batel).
  expect(r.zerados, 'os produtos sem saldo em nenhuma unidade').toBe(1)
  // Por unidade: os sem saldo NELA.
  expect(r.estoque_por_unidade.find(u => u.branch_id === rede!.branchId)?.zerados).toBe(2)
  expect(r.estoque_por_unidade.find(u => u.branch_id === batel)?.zerados).toBe(1)

  await comoDona(browser, async p => {
    await p.goto('/admin/estoque')
    const sem = p.locator('.card', { hasText: 'SEM ESTOQUE' }).first()
    await expect(sem).toContainText('1')
    await expect(sem).toContainText('produtos sem saldo em nenhuma unidade')

    await p.goto('/admin/dashboard')
    const dash = p.locator('.card', { hasText: 'Produtos zerados' }).first()
    await expect(dash).toBeVisible({ timeout: 30_000 })
    await expect(dash.locator('div', { hasText: /^Produtos zerados/ }).last()).toContainText('1')

    await p.goto('/admin/reports?tab=estoque&period=month')
    const rel = p.locator('.card', { hasText: 'Produtos zerados' }).first()
    await expect(rel).toContainText('1', { timeout: 20_000 })
    await expect(rel).toContainText('sem saldo em nenhuma unidade')
  })
})
