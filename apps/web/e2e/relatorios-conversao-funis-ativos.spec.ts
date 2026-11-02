import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * ind-07 (revisão de 2026-11-02, "mudar"): a conversão que junta os funis
 * (Relatórios → Comercial) olha só os funis ATIVOS. O único funil com etapa de
 * ganho foi arquivado; os ativos não têm — e a tela mostrava "0%" (com o
 * ganho do arquivado no "tem ganho") em vez de "—". "Funil arquivado não
 * devia decidir o número de hoje."
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let gestor: MembroDeTeste | null = null
const de = new Date(Date.now() - 86_400_000).toISOString()
const ate = new Date(Date.now() + 86_400_000).toISOString()

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: gestor!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

async function funil(nome: string, arquivado: boolean, etapas: { name: string; outcome: string | null }[]) {
  const f = await db().from('crm_funnels').insert({
    tenant_id: rede!.tenantId, name: `[e2e] ${nome} ${marca}`, is_default: !arquivado,
    archived_at: arquivado ? new Date().toISOString() : null,
  }).select('id').single<{ id: string }>()
  expect(f.error).toBeNull()
  const e = await db().from('crm_stages').insert(etapas.map((x, i) => ({
    tenant_id: rede!.tenantId, funnel_id: f.data!.id, name: x.name, position: i, outcome: x.outcome,
  }))).select('id, outcome')
  expect(e.error).toBeNull()
  return e.data! as { id: string; outcome: string | null }[]
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`cv${marca}`)
  gestor = await criarMembro(`cvg${marca}`, {
    tenant: rede.tenantId, rotulo: 'Gestora', permissoes: [{ modulo: 'crm', nivel: 'VIEW' }, { modulo: 'reports', nivel: 'VIEW' }],
  })
  expect((await db().from('role_report_tabs').insert({ tenant_id: rede.tenantId, role_id: gestor.roleId, tab: 'comercial' })).error).toBeNull()
  const arquivado = await funil('Antigo', true, [{ name: 'Novo', outcome: 'OPEN' }, { name: 'Ganho', outcome: 'WON' }])
  const ativo = await funil('Pós-venda', false, [{ name: 'Contato', outcome: 'OPEN' }, { name: 'Retorno', outcome: 'OPEN' }])
  const lead = (nome: string, etapa: string) => ({ tenant_id: rede!.tenantId, name: `[e2e] ${nome} ${marca}`, phone: `55119${Math.floor(Math.random() * 1e8)}`, crm_stage_id: etapa })
  const r = await db().from('leads').insert([
    lead('Ganha no arquivado', arquivado.find(e => e.outcome === 'WON')!.id),
    lead('Ativa 1', ativo[0]!.id),
    lead('Ativa 2', ativo[1]!.id),
  ])
  expect(r.error, 'leads').toBeNull()
})
test.afterAll(async () => {
  await db().from('leads').delete().eq('tenant_id', rede!.tenantId)
  await db().from('crm_stages').delete().eq('tenant_id', rede!.tenantId)
  await db().from('crm_funnels').delete().eq('tenant_id', rede!.tenantId)
  await gestor?.limpar(); await rede?.limpar()
})

test('a conversão junta só os funis ativos: sem etapa de ganho neles, "—"', async ({ browser }) => {
  const { data, error } = await db().rpc('metrics_comercial', {
    p_tenant: rede!.tenantId, p_branch_ids: [rede!.branchId], p_from: de, p_to: ate, p_owner: null,
  })
  expect(error).toBeNull()
  const c = data as { total_leads: number; ganhos: number; tem_ganho: boolean }
  expect([c.tem_ganho, Number(c.total_leads), Number(c.ganhos)]).toEqual([false, 2, 0])

  await como(browser, async p => {
    await p.goto('/admin/reports?period=month&tab=comercial')
    const kpi = p.getByText('Conversão', { exact: true }).first().locator('xpath=ancestor::div[contains(@class,"card")][1]')
    await expect(kpi).toContainText('—')
  })
})
