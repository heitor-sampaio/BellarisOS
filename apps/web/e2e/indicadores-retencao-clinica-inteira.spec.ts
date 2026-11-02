import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * ind-08 (revisão de 2026-11-02, "mudar"): a retenção decide "já tinha vindo"
 * pela CLÍNICA inteira, não pelas unidades do recorte. "A cliente é da
 * clínica" (H5): a Carla foi atendida na Moinhos em setembro e, em outubro,
 * na Zona Sul. Olhando só a Zona Sul, ela contava como cliente nova.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let gestor: MembroDeTeste | null = null
let zonaSul = { id: '', slug: '' }
const agora = new Date()
const de = new Date(agora.getTime() - 86_400_000).toISOString()
const ate = new Date(agora.getTime() + 86_400_000).toISOString()
const mesPassado = new Date(agora.getTime() - 40 * 86_400_000).toISOString()

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: gestor!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`rt${marca}`)
  const { data, error } = await db().from('branches')
    .insert({ tenant_id: rede.tenantId, name: `[e2e] Zona Sul ${marca}`, slug: `e2e-rtzs-${marca}` })
    .select('id, slug').single<typeof zonaSul>()
  expect(error).toBeNull()
  zonaSul = data!
  gestor = await criarMembro(`rtg${marca}`, {
    tenant: rede.tenantId, rotulo: 'Gestora',
    permissoes: [{ modulo: 'agenda', nivel: 'VIEW' }, { modulo: 'clients', nivel: 'VIEW' }, { modulo: 'reports', nivel: 'VIEW' }],
  })
  expect((await db().from('role_report_tabs').insert({ tenant_id: rede.tenantId, role_id: gestor.roleId, tab: 'clientes' })).error).toBeNull()
  const carla = await rede.criarCliente('Carla')
  const atendimento = (unidade: string, quando: string) => ({
    branch_id: unidade, client_id: carla, procedure_id: rede!.procedureId, professional_id: rede!.professionalId,
    status: 'COMPLETED', source: 'INTERNAL', duration_min: 30, price: 0, scheduled_at: quando, completed_at: quando,
  })
  expect((await db().from('appointments').insert([
    atendimento(rede.branchId, mesPassado),           // a Moinhos, antes
    atendimento(zonaSul.id, agora.toISOString()),     // a Zona Sul, agora
  ])).error).toBeNull()
})
test.afterAll(async () => {
  await gestor?.limpar()
  await db().from('appointments').delete().eq('branch_id', zonaSul.id)
  await db().from('branches').delete().eq('id', zonaSul.id)
  await rede?.limpar()
})

test('olhando só a Zona Sul, a Carla VOLTOU: a clínica já a tinha atendido na Moinhos', async ({ browser }) => {
  const { data, error } = await db().rpc('metrics_retention', {
    p_tenant: rede!.tenantId, p_branch_ids: [zonaSul.id], p_from: de, p_to: ate, p_professional_id: null,
  })
  expect(error).toBeNull()
  const r = (data as { clients_served: number; returning_clients: number; first_time_clients: number }[])[0]!
  expect([Number(r.clients_served), Number(r.returning_clients), Number(r.first_time_clients)]).toEqual([1, 1, 0])

  await como(browser, async p => {
    await p.goto(`/admin/reports?period=month&tab=clientes&unidade=${zonaSul.slug}`)
    const kpi = p.getByText('Primeira Vez', { exact: true }).first().locator('xpath=ancestor::div[contains(@class,"card")][1]')
    await expect(kpi).toContainText('0')
  })
})
