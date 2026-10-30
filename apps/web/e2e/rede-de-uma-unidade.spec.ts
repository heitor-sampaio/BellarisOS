import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcaoComFormulario } from './apoio/acao-direta'

/**
 * D-19 (decisão do Heitor, 2026-10-29): "Com UMA unidade ativa, somem os termos
 * e gráficos de rede ('TOTAL REDE', 'por filial', os rankings de filial,
 * 'Voltar para a rede') e o seletor de unidade. O modelo não muda: tudo volta
 * quando nascer a segunda unidade."
 *
 * O cliente típico tem UMA clínica (CLAUDE.md §1). Rede `[e2e]` própria, com a
 * dona; a segunda unidade nasce pela action da tela (createBranch), que é o que
 * expira o cache das unidades.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let dona: MembroDeTeste | null = null
let slug = ''
let segunda: string | null = null

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: dona!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`uu${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  // O portal da rede manda ao /setup a rede sem onboarding.
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  dona = await criarMembro(`uud${marca}`, { tenant: rede.tenantId, donoDaRede: true, permissoes: [] })
})

test.afterAll(async () => {
  if (segunda) {
    const { error } = await db().from('branches').delete().eq('id', segunda)
    expect(error).toBeNull()
  }
  await dona?.limpar()
  await rede?.limpar()
})

test.describe.serial('a clínica de uma unidade só', () => {
  test('com UMA unidade, os termos e quadros de rede somem', async ({ browser }) => {
    await como(browser, async p => {
      await p.goto('/admin/dashboard')
      await expect(p.getByRole('heading', { name: 'Visão geral', exact: true })).toBeVisible()
      await expect(p.getByText('Visão geral da rede')).toHaveCount(0)
      await expect(p.getByText('Ranking de filiais')).toHaveCount(0)
      await expect(p.getByText('Hoje na rede')).toHaveCount(0)
      await expect(p.getByText(/por filial/i)).toHaveCount(0)

      await p.goto('/admin/financeiro')
      await expect(p.getByText('Movimentações').first()).toBeVisible()
      await expect(p.getByText('Por filial', { exact: true })).toHaveCount(0)
      await expect(p.getByText(/total rede/i)).toHaveCount(0)
      await expect(p.getByText('Todas as filiais')).toHaveCount(0)

      await p.goto('/admin/reports')
      await expect(p.getByText('Evolução do Período')).toBeVisible()
      await expect(p.getByText('Faturamento por Unidade')).toHaveCount(0)
      await expect(p.getByText('✦ Rede', { exact: true })).toHaveCount(0)

      await p.goto(`/${slug}/dashboard`)
      await expect(p.getByRole('navigation').first()).toBeVisible()
      await expect(p.getByText('Voltar para a rede')).toHaveCount(0)
    })
  })

  test('nasce a segunda unidade: tudo volta', async ({ browser }) => {
    await como(browser, async p => {
      const r = await chamarAcaoComFormulario(p, 'actions/branches.ts', 'createBranch', '/admin/branches',
        ['$undefined'], { name: `${PREFIXO} Segunda ${marca}` })
      expect(r.texto).not.toContain('"error"')
      const { data } = await db().from('branches').select('id').eq('tenant_id', rede!.tenantId).neq('id', rede!.branchId)
      expect(data ?? []).toHaveLength(1)
      segunda = data![0]!.id as string

      await p.goto('/admin/dashboard')
      await expect(p.getByText('Visão geral da rede')).toBeVisible()
      await expect(p.getByText('Ranking de filiais')).toBeVisible()

      await p.goto('/admin/financeiro')
      await expect(p.getByText('Por filial', { exact: true })).toBeVisible()

      await p.goto(`/${slug}/dashboard`)
      await expect(p.getByText('Voltar para a rede')).toBeVisible()
    })
  })
})
