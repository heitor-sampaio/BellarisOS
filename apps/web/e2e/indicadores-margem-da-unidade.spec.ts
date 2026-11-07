import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * Sobra da F40 (a 2ª unidade da 9ª simulação, 2026-11-07): o preço da unidade
 * passou a valer em todo caminho de preço (D2), mas a margem do procedimento
 * (`metrics_margem_procedimentos`) seguia com o preço e a mão de obra da REDE.
 * Recortado a uma unidade, o ranking de margem usa o preço DELA e a mão de
 * obra dela (`procedure_branch_pricing`); a rede inteira segue o catálogo.
 * Numa rede [e2e] própria, com duas unidades.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let dona: MembroDeTeste | null = null
let menino = ''
const nome = `${PREFIXO} Crio margem ${marca}`

async function como(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  test.setTimeout(120_000)
  rede = await criarOutraRede(`mg${marca}`)
  const b = db()
  expect((await b.from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  const { data: u, error } = await b.from('branches')
    .insert({ tenant_id: rede.tenantId, name: `${PREFIXO} Menino ${marca}`, slug: `e2e-mg2-${marca}` }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  menino = u!.id
  // Rede: R$ 650 com R$ 100 de mão de obra; Menino Deus: R$ 590 com R$ 120.
  expect((await b.from('procedures').update({ name: nome, price: 650, labor_cost: 100, is_active: true }).eq('id', rede.procedureId)).error).toBeNull()
  expect((await b.from('procedure_branch_pricing').insert({ procedure_id: rede.procedureId, branch_id: menino, price: 590, labor_cost: 120 })).error).toBeNull()
  dona = await criarMembro(`mgd${marca}`, { tenant: rede.tenantId, donoDaRede: true, rotulo: 'Dona', permissoes: [] })
})

test.afterAll(async () => {
  await dona?.limpar()
  await rede?.limpar()
})

test('sobra da F40: recortada à unidade, a margem usa o preço e a mão de obra dela; a rede, o catálogo', async ({ browser }) => {
  await como(browser, dona!, async p => {
    await p.goto(`/admin/dashboard?unidade=${menino}`)
    const naUnidade = p.locator('tr', { hasText: nome })
    await expect(naUnidade).toContainText(/R\$\s590,00/)
    await expect(naUnidade).toContainText('79,7%')
    await p.goto('/admin/dashboard')
    const naRede = p.locator('tr', { hasText: nome })
    await expect(naRede).toContainText(/R\$\s650,00/)
    await expect(naRede).toContainText('84,6%')
  })
})
