import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { apagarAgendamentos } from './apoio/limpeza'
import { unitTag } from '@estetica-os/utils'

/**
 * J-54 (ajustes J, 2026-10-30): o drill-down da rede é `?unidade=<id|slug>` na
 * tela da rede (CLAUDE.md §6) — e o dashboard e Clientes do /admin o
 * ignoravam: `/admin/dashboard?unidade=b` mostrava a rede inteira.
 *
 * Agora o dashboard recorta a unidade (o título é ela, os números são os dela,
 * os quadros "por filial" saem e há "Ver a rede inteira"), e a lista de
 * Clientes abre com o filtro de unidade já escolhido.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let dona: MembroDeTeste | null = null
let unidadeB: { id: string; slug: string; name: string } | null = null
let nomeA = ''

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: dona!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  test.setTimeout(180_000)
  rede = await criarOutraRede(`un${marca}`)
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  nomeA = (await db().from('branches').select('name').eq('id', rede.branchId).single<{ name: string }>()).data!.name
  const { data: b, error } = await db().from('branches')
    .insert({ tenant_id: rede.tenantId, name: `${PREFIXO} Unidade B ${marca}`, slug: `e2e-unb-${marca}` })
    .select('id, slug, name').single<{ id: string; slug: string; name: string }>()
  expect(error).toBeNull()
  unidadeB = b!
  dona = await criarMembro(`und${marca}`, { tenant: rede.tenantId, donoDaRede: true, permissoes: [] })
  // Um atendimento concluído na unidade A; nada na B.
  const clienteA = await rede.criarCliente('Cliente da A')
  const clienteB = await rede.criarCliente('Cliente da B')
  expect((await db().from('clients').update({ tags: [unitTag(nomeA)] }).eq('id', clienteA)).error).toBeNull()
  expect((await db().from('clients').update({ tags: [unitTag(unidadeB.name)] }).eq('id', clienteB)).error).toBeNull()
  expect((await db().from('appointments').insert({
    branch_id: rede.branchId, client_id: clienteA, procedure_id: rede.procedureId, professional_id: rede.professionalId,
    status: 'COMPLETED', source: 'INTERNAL', duration_min: 30, price: 0,
    scheduled_at: new Date(Date.now() - 5 * 60_000).toISOString(), completed_at: new Date().toISOString(),
  })).error).toBeNull()
})

test.afterAll(async () => {
  if (rede) {
    const { data: ags } = await db().from('appointments').select('id').eq('branch_id', rede.branchId)
    expect(await apagarAgendamentos((ags ?? []).map(a => a.id as string))).toEqual([])
  }
  await dona?.limpar()
  if (unidadeB) await db().from('branches').delete().eq('id', unidadeB.id)
  await rede?.limpar()
})

test('o dashboard da rede recorta a unidade do ?unidade=', async ({ browser }) => {
  await como(browser, async p => {
    await p.goto('/admin/dashboard')
    await expect(p.getByRole('heading', { name: 'Visão geral da rede' })).toBeVisible()
    await expect(p.locator('[data-kpi="Atendimentos"]')).toContainText('1')

    await p.goto(`/admin/dashboard?unidade=${unidadeB!.slug}`)
    await expect(p.getByRole('heading', { level: 1 }), 'o título é a unidade').toHaveText(unidadeB!.name)
    await expect(p.locator('[data-kpi="Atendimentos"]'), 'os números são os da unidade B').toContainText('0')
    await expect(p.getByText('Ranking de filiais')).toHaveCount(0)
    await expect(p.getByRole('link', { name: 'Ver a rede inteira' })).toHaveAttribute('href', '/admin/dashboard')

    // Pelo id também, como no resto do portal da rede.
    await p.goto(`/admin/dashboard?unidade=${rede!.branchId}`)
    await expect(p.getByRole('heading', { level: 1 })).toHaveText(nomeA)
    await expect(p.locator('[data-kpi="Atendimentos"]')).toContainText('1')
  })
})

test('Clientes do /admin abre com a unidade do ?unidade= escolhida', async ({ browser }) => {
  await como(browser, async p => {
    await p.goto(`/admin/clients?unidade=${unidadeB!.slug}`)
    const lista = p.locator('.clients-master-list')
    await expect(lista.getByText(`Cliente da B`, { exact: false })).toBeVisible()
    await expect(lista.getByText(`Cliente da A`, { exact: false }), 'só as da unidade B').toHaveCount(0)
    await expect(lista.getByRole('button', { name: unidadeB!.name })).toBeVisible()
  })
})
