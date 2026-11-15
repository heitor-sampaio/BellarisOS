import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * A retenção "só os meus": "a cliente é da clínica, o atendimento é da
 * profissional" (decisão do Heitor, 2026-10-29). Na retenção dela entram as
 * clientes que ELA atendeu no período, e "voltou" é quem já tinha sido
 * atendida pela CLÍNICA antes — por qualquer profissional. Até aqui "voltou"
 * era só quem já tinha vindo a ela (migration 20261028000804).
 *
 * Numa rede `[e2e]` própria, com a Agnes (agenda "só os meus"):
 *   - Volta: atendida pela OUTRA há 60 dias e pela Agnes agora — voltou à clínica;
 *   - Antiga: atendida pela Agnes há 60 dias e agora — voltou;
 *   - Nova: só agora, com a Agnes — primeira vez;
 *   - Alheia: só agora, com a outra — não é da Agnes.
 * A Agnes: 3 atendidas, 2 voltaram (66,7%). Pela regra antiga, 1 (33,3%).
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let agnes: MembroDeTeste | null = null
const agora = new Date().toISOString()
const ha60dias = new Date(Date.now() - 60 * 86_400_000).toISOString()

async function como(browser: Browser, quem: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: quem.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

async function concluido(cliente: string, professionalId: string, quando: string) {
  const { error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: cliente, procedure_id: rede!.procedureId, professional_id: professionalId,
    status: 'COMPLETED', source: 'INTERNAL', duration_min: 30, price: 0, scheduled_at: quando, completed_at: quando,
  })
  expect(error).toBeNull()
}

test.beforeAll(async () => {
  test.setTimeout(180_000)
  rede = await criarOutraRede(`rt${marca}`)
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  agnes = await criarMembro(`rta${marca}`, {
    tenant: rede.tenantId, rotulo: 'Agnes',
    permissoes: [{ modulo: 'agenda', nivel: 'VIEW', escopo: 'OWN' }, { modulo: 'clients', nivel: 'VIEW' }, { modulo: 'reports', nivel: 'VIEW' }],
  })
  expect((await db().from('users').update({ provides_services: true }).eq('id', agnes.userId)).error).toBeNull()
  expect((await db().from('role_report_tabs').insert({ tenant_id: rede.tenantId, role_id: agnes.roleId, tab: 'clientes' })).error).toBeNull()

  const volta = await rede.criarCliente('Volta')
  const antiga = await rede.criarCliente('Antiga')
  const nova = await rede.criarCliente('Nova')
  const alheia = await rede.criarCliente('Alheia')
  await concluido(volta, rede.professionalId, ha60dias)
  await concluido(volta, agnes.userId, agora)
  await concluido(antiga, agnes.userId, ha60dias)
  await concluido(antiga, agnes.userId, agora)
  await concluido(nova, agnes.userId, agora)
  await concluido(alheia, rede.professionalId, agora)
})

test.afterAll(async () => {
  if (rede) await db().from('appointments').delete().eq('branch_id', rede.branchId)
  if (agnes) await db().from('role_report_tabs').delete().eq('role_id', agnes.roleId)
  await agnes?.limpar(); await rede?.limpar()
})

const janela = () => ({ p_from: new Date(Date.now() - 86_400_000).toISOString(), p_to: new Date(Date.now() + 86_400_000).toISOString() })

test('o banco: as clientes que ELA atendeu, e "voltou" é quem a CLÍNICA já tinha atendido (3 e 2)', async () => {
  const { data, error } = await db().rpc('metrics_retention', {
    p_tenant: rede!.tenantId, p_branch_ids: null, ...janela(), p_professional_id: agnes!.userId,
  })
  expect(error).toBeNull()
  const r = (data as Record<string, unknown>[])[0]!
  expect([Number(r.clients_served), Number(r.returning_clients), Number(r.first_time_clients)]).toEqual([3, 2, 1])

  // Controle: a clínica inteira — as 4 atendidas, 2 voltaram.
  const { data: todas } = await db().rpc('metrics_retention', { p_tenant: rede!.tenantId, p_branch_ids: null, ...janela() })
  const t = (todas as Record<string, unknown>[])[0]!
  expect([Number(t.clients_served), Number(t.returning_clients)]).toEqual([4, 2])
})

test('a tela: Relatórios → Clientes da Agnes diz 3 atendidas, 1 primeira vez e 66,7% de retenção', async ({ browser }) => {
  await como(browser, agnes!, async p => {
    await p.goto('/admin/reports?tab=clientes&period=month')
    const card = (rotulo: string) => p.locator('.card').filter({ has: p.getByText(rotulo, { exact: true }) }).first()
    await expect.poll(async () => (await card('Atendidos no Período').innerText()).match(/\d+/)?.[0], { timeout: 10_000 }).toBe('3')
    await expect.poll(async () => (await card('Primeira Vez').innerText()).match(/\d+/)?.[0], { timeout: 10_000 }).toBe('1')
    await expect.poll(async () => card('Taxa de Retenção').innerText(), { timeout: 10_000 }).toContain('66,7%')
  })
})
