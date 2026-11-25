import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * BU1 (Bloco Busca do plano de adaptação, 2026-11-16 — a revisão do Heitor de
 * 2026-11-13: "Ok"): o "Vender" na linha da cliente achada pela busca
 * universal leva ao PDV, com ela escolhida (`…/pdv?nova=1&cliente=<id>`), nos
 * dois portais. Aparece a quem vende no PDV — a mesma regra da tela do PDV
 * (`podeReceber`: o PDV em Gerenciar; PV-04, 24/11) — e a quem não vende,
 * não. A página do PDV confere o id da URL: uuid de verdade e da rede da
 * sessão; o resto abre a venda sem cliente, sem a tela de erro.
 *
 * Numa rede `[e2e]` própria (isolado).
 */

const marca = Date.now().toString(36)
const db = () => banco()
let outra: OutraRede
let estranha: OutraRede
let slug: string
let vendedora: MembroDeTeste
let semVenda: MembroDeTeste
let clienteId: string
let nomeDaCliente: string
let clienteDeFora: string
const criados: MembroDeTeste[] = []

test.beforeAll(async () => {
  test.setTimeout(300_000)
  outra = await criarOutraRede(`bv${marca}`)
  estranha = await criarOutraRede(`bvx${marca}`)
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).in('id', [outra.tenantId, estranha.tenantId])).error).toBeNull()
  const { data: un, error: eUn } = await db().from('branches').select('slug').eq('id', outra.branchId).single<{ slug: string }>()
  expect(eUn).toBeNull()
  slug = un!.slug
  // Quem vende: só o PDV em Gerenciar (e os clientes, para achá-la), numa unidade.
  vendedora = await criarMembro(`bvvende${marca}`, { tenant: outra.tenantId, branchId: outra.branchId, rotulo: 'Vende no PDV', permissoes: [
    { modulo: 'cashier', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'VIEW' },
  ] })
  // Quem não vende: agenda e clientes em Gerenciar, o financeiro só vendo, sem o PDV.
  semVenda = await criarMembro(`bvsem${marca}`, { tenant: outra.tenantId, rotulo: 'Não vende', permissoes: [
    { modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'financial', nivel: 'VIEW' },
  ] })
  criados.push(vendedora, semVenda)
  clienteId = await outra.criarCliente('Vender Celina')
  nomeDaCliente = (await db().from('clients').select('name').eq('id', clienteId).single()).data!.name as string
  clienteDeFora = await estranha.criarCliente('Vender Forasteira')
  // Um procedimento à venda na unidade (a venda abre o catálogo dela).
  const { error } = await db().from('procedures').insert({ tenant_id: outra.tenantId, name: `${PREFIXO} Limpeza bv${marca}`, category: 'e2e', duration_min: 30, price: 120 })
  expect(error).toBeNull()
})
test.afterAll(async () => {
  for (const m of criados) await m.limpar()
  await db().from('procedures').delete().eq('tenant_id', outra.tenantId)
  await outra?.limpar()
  await estranha?.limpar()
})

async function como(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}
async function buscar(p: Page, termo: string) {
  const campo = p.getByRole('combobox', { name: 'Busca universal' })
  await campo.click()
  await campo.fill(termo)
  return p.getByRole('listbox', { name: 'Resultados da busca' })
}

test('no portal da unidade, quem vende no PDV acha a cliente e o "Vender" abre a venda no PDV da unidade, com ela', async ({ browser }) => {
  await como(browser, vendedora, async p => {
    await p.goto(`/${slug}/dashboard`)
    const lista = await buscar(p, 'Vender Celina')
    await lista.getByRole('option', { name: `Vender para ${nomeDaCliente}` }).click()
    await expect(p).toHaveURL(new RegExp(`/${slug}/pdv\\?nova=1&cliente=${clienteId}`))
    const venda = p.getByRole('region', { name: 'Vender' })
    await expect(venda.locator('[data-cliente-da-venda]')).toContainText(nomeDaCliente)
  })
})

test('quem não vende no PDV (sem o PDV, o Financeiro só vendo) ganha o "Agendar", não o "Vender"', async ({ browser }) => {
  await como(browser, semVenda, async p => {
    await p.goto('/admin/dashboard')
    const lista = await buscar(p, 'Vender Celina')
    await expect(lista.getByRole('option', { name: `Agendar para ${nomeDaCliente}` })).toBeVisible()
    await expect(lista.getByRole('option', { name: `Vender para ${nomeDaCliente}` })).toHaveCount(0)
  })
})

test('o PDV confere o id da URL: o que não é uuid abre a venda sem cliente, sem a tela de erro', async ({ browser }) => {
  await como(browser, vendedora, async p => {
    // 36 caracteres que passavam pelo /^[0-9a-f-]{36}$/ — e o Postgres respondia 22P02.
    await p.goto(`/${slug}/pdv?nova=1&cliente=${'-'.repeat(36)}`)
    const venda = p.getByRole('region', { name: 'Vender' })
    await expect(venda).toBeVisible()
    await expect(venda.getByLabel('Cliente da venda')).toBeVisible()
    await expect(venda.locator('[data-cliente-da-venda]')).toHaveCount(0)
  })
})

test('o PDV confere o id da URL: a cliente de outra rede não entra na venda', async ({ browser }) => {
  await como(browser, vendedora, async p => {
    await p.goto(`/${slug}/pdv?nova=1&cliente=${clienteDeFora}`)
    const venda = p.getByRole('region', { name: 'Vender' })
    await expect(venda.getByLabel('Cliente da venda')).toBeVisible()
    await expect(venda.locator('[data-cliente-da-venda]')).toHaveCount(0)
    await expect(p.getByText('Vender Forasteira')).toHaveCount(0)
  })
})
