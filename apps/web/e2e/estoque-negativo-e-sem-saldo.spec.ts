import { test, expect, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * D10 da 6ª simulação (2026-11-04; princípio 3): o Gel condutor (mínimo 2)
 * ficou em −1 un depois de uma baixa — o saldo negativo existe "para a falta
 * aparecer" (§10). A linha da tela dizia "Sem estoque", mas os cartões
 * diziam ESTOQUE BAIXO 0 e SEM ESTOQUE 0, e o dashboard "Estoque Saudável":
 * `zerados` era `= 0` e `criticos` `> 0`, e o negativo não caía em nenhum. Antes
 * da baixa, com o produto ativo SEM nenhuma linha de saldo (nunca entrou nada),
 * também não contava.
 *
 * A regra: sem estoque é não ter saldo POSITIVO em nenhuma unidade do recorte
 * — o negativo e o que nunca teve linha contam.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let dona: MembroDeTeste | null = null
const produtos: string[] = []
test.describe.configure({ timeout: 180_000 })

async function produto(rotulo: string, saldo: { atual: number; minimo: number } | null) {
  const { data, error } = await db().from('products')
    .insert({ tenant_id: rede!.tenantId, name: `${PREFIXO} ${rotulo} ${marca}`, unit: 'un' })
    .select('id').single<{ id: string }>()
  expect(error, `criar ${rotulo}`).toBeNull()
  produtos.push(data!.id)
  if (saldo) {
    const r = await db().from('branch_product_stock').insert({ product_id: data!.id, branch_id: rede!.branchId, current_stock: saldo.atual, min_stock: saldo.minimo })
    expect(r.error, `saldo de ${rotulo}`).toBeNull()
  }
}

test.beforeAll(async () => {
  test.setTimeout(240_000)
  rede = await criarOutraRede(`esn${marca}`)
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  dona = await criarMembro(`esnd${marca}`, { tenant: rede.tenantId, donoDaRede: true, rotulo: 'Dona', permissoes: [] })
  await produto('Gel condutor', { atual: -1, minimo: 2 })  // negativo, abaixo do mínimo
  await produto('Luva nova', null)                          // ativo, sem nenhuma linha de saldo
  await produto('Algodão', { atual: 5, minimo: 0 })         // cheio: o controle
})

test.afterAll(async () => {
  if (produtos.length) {
    await db().from('branch_product_stock').delete().in('product_id', produtos)
    await db().from('products').delete().in('id', produtos)
  }
  await dona?.limpar(); await rede?.limpar()
})

async function comoDona<T>(browser: import('@playwright/test').Browser, fn: (p: Page) => Promise<T>) {
  const ctx = await browser.newContext({ storageState: dona!.estado })
  try { return await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test('a tela de estoque conta o negativo e o produto sem saldo como "Sem estoque"', async ({ browser }) => {
  await comoDona(browser, async p => {
    await p.goto('/admin/estoque')
    const cartao = p.locator('.card', { hasText: 'SEM ESTOQUE' }).first()
    await expect(cartao).toContainText('2')
  })
})

test('o dashboard deixa de dizer "Saudável": 2 produtos zerados', async ({ browser }) => {
  await comoDona(browser, async p => {
    await p.goto('/admin/dashboard')
    const cartao = p.locator('.card', { hasText: 'Produtos zerados' }).first()
    await expect(cartao).toBeVisible({ timeout: 30_000 })
    await expect(cartao).not.toContainText('Saudável')
    await expect(cartao.locator('div', { hasText: /^Produtos zerados/ }).last()).toContainText('2')
  })
})

test('Relatórios → Estoque: zerados = 2 (o negativo e o sem linha), na unidade também', async () => {
  const agora = new Date()
  const { data, error } = await db().rpc('metrics_relatorio', {
    p_tenant: rede!.tenantId, p_branch_ids: [rede!.branchId],
    p_from: new Date(agora.getTime() - 86_400_000).toISOString(), p_to: agora.toISOString(),
    p_prev_from: new Date(agora.getTime() - 2 * 86_400_000).toISOString(), p_prev_to: new Date(agora.getTime() - 86_400_000).toISOString(),
    p_aba: 'estoque', p_granularidade: 'day', p_professional_id: null,
  })
  expect(error).toBeNull()
  const r = data as { zerados: number; estoque_por_unidade: { branch_id: string; zerados: number }[] }
  expect(r.zerados).toBe(2)
  expect(r.estoque_por_unidade.find(u => u.branch_id === rede!.branchId)?.zerados).toBe(2)
})
