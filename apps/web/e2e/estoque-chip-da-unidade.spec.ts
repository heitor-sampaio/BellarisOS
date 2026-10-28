import { test, expect } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * D15 da simulação de 2026-10-28: o chip de estoque por unidade usava só a
 * primeira palavra do nome ("Íris · 3 frasco" nas duas unidades), e ninguém
 * sabia qual era o Centro e qual o Kobrasol. O chip leva o nome INTEIRO da
 * unidade (o CSS trunca com reticências se não couber; o title tem tudo).
 */
const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede
let gestor: MembroDeTeste
let segundaUnidade = ''
let produto = ''
const centro = `Íris Centro ${marca}`
const kobrasol = `Íris Kobrasol ${marca}`

test.beforeAll(async () => {
  rede = await criarOutraRede(`ec${marca}`)
  expect((await db().from('branches').update({ name: centro }).eq('id', rede.branchId)).error).toBeNull()
  const { data, error } = await db().from('branches')
    .insert({ tenant_id: rede.tenantId, name: kobrasol, slug: `e2e-un2-${marca}` }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  segundaUnidade = data!.id
  produto = await rede.criarProduto('Frasco', 3)
  expect((await db().from('branch_product_stock').insert({ product_id: produto, branch_id: segundaUnidade, current_stock: 1, min_stock: 0 })).error).toBeNull()
  gestor = await criarMembro(`ecg${marca}`, { tenant: rede.tenantId, rotulo: 'Estoque', permissoes: [{ modulo: 'stock', nivel: 'MANAGE' }] })
})
test.afterAll(async () => {
  await gestor?.limpar()
  await db().from('branch_product_stock').delete().eq('branch_id', segundaUnidade)
  await db().from('branches').delete().eq('id', segundaUnidade)
  await rede?.limpar()
})

test('o chip de estoque diz a unidade inteira, não só a primeira palavra', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: gestor.estado })
  try {
    const p = await ctx.newPage()
    await p.goto('/admin/estoque')
    const linha = p.getByRole('row').filter({ hasText: `Frasco ec${marca}` }).first()
    await expect(linha).toBeVisible()
    await expect.soft(linha.getByText(`${centro} · 3 un`)).toBeVisible()
    await expect.soft(linha.getByText(`${kobrasol} · 1 un`)).toBeVisible()
    // Se o CSS truncar, o title ainda diz tudo.
    await expect.soft(linha.locator(`span[title*="${kobrasol}"]`)).toHaveCount(1)
  } finally { await ctx.close() }
})
