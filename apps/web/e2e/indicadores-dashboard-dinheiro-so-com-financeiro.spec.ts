import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * D2 da 6ª simulação (2026-11-04), sobra da F7: o dashboard da rede mostrava
 * dinheiro a cargos sem o Financeiro. A Pri (CRM e Relatórios só com a aba
 * Comercial) via o gráfico de Faturamento, Custo do lucro e Lucro e o Ranking de
 * unidades com Receita e Ticket médio; a Duda (Recepcionista) via
 * "Procedimentos por receita dos atendimentos" e "por margem". É o exemplo do
 * CLAUDE.md §11: "o time comercial vê o funil sem ver o faturamento".
 *
 * A régua é a da F7 nos Relatórios e no Copilot: o dinheiro vai a quem tem o
 * Financeiro, ou a aba Financeiro dos Relatórios. E o dado nem sai do
 * servidor: o valor não está no HTML nem no payload da página.
 */

const marca = Date.now().toString(36)
const db = () => banco()
const VALOR = 7777.77
let rede: OutraRede | null = null
let dona: MembroDeTeste | null = null
let comercial: MembroDeTeste | null = null
let recepcao: MembroDeTeste | null = null
let segundaUnidade = ''
let agendamento = ''
let lancamento = ''
test.describe.configure({ timeout: 180_000 })

test.beforeAll(async () => {
  test.setTimeout(240_000)
  rede = await criarOutraRede(`ddf${marca}`)
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  // Duas unidades: o "Ranking de unidades" só existe com mais de uma (D-19).
  const b2 = await db().from('branches').insert({ tenant_id: rede.tenantId, name: `${PREFIXO} Segunda ${marca}`, slug: `e2e-ddf2-${marca}` }).select('id').single<{ id: string }>()
  expect(b2.error).toBeNull()
  segundaUnidade = b2.data!.id
  expect((await db().from('users').update({ provides_services: true }).eq('id', rede.professionalId)).error).toBeNull()

  // Uma venda paga hoje, de um atendimento concluído hoje.
  const cliente = await rede.criarCliente('Cliente')
  const agora = Date.now()
  const a = await db().from('appointments').insert({
    branch_id: rede.branchId, client_id: cliente, procedure_id: rede.procedureId, professional_id: rede.professionalId,
    source: 'INTERNAL', duration_min: 30, price: VALOR, status: 'COMPLETED',
    scheduled_at: new Date(agora - 2 * 3600_000).toISOString(), completed_at: new Date(agora - 3600_000).toISOString(),
  }).select('id').single<{ id: string }>()
  expect(a.error, 'o atendimento').toBeNull()
  agendamento = a.data!.id
  const t = await db().from('financial_transactions').insert({
    branch_id: rede.branchId, client_id: cliente, appointment_id: agendamento,
    type: 'INCOME', category: 'Procedimento', description: `${PREFIXO} venda ${marca}`, amount: VALOR,
    payment_method: 'PIX', is_paid: true, paid_at: new Date(agora - 1800_000).toISOString(), created_by: rede.professionalId,
  }).select('id').single<{ id: string }>()
  expect(t.error, 'o pagamento').toBeNull()
  lancamento = t.data!.id

  dona = await criarMembro(`ddfd${marca}`, { tenant: rede.tenantId, donoDaRede: true, rotulo: 'Dona', permissoes: [] })
  comercial = await criarMembro(`ddfc${marca}`, {
    tenant: rede.tenantId, rotulo: 'Comercial',
    permissoes: [{ modulo: 'crm', nivel: 'MANAGE' }, { modulo: 'reports', nivel: 'VIEW' }],
  })
  expect((await db().from('role_report_tabs').insert({ tenant_id: rede.tenantId, role_id: comercial.roleId, tab: 'comercial' })).error).toBeNull()
  recepcao = await criarMembro(`ddfr${marca}`, {
    tenant: rede.tenantId, rotulo: 'Recepção',
    permissoes: [
      { modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'procedures', nivel: 'VIEW' },
      { modulo: 'cashier', nivel: 'MANAGE' }, { modulo: 'crm', nivel: 'MANAGE' }, { modulo: 'team', nivel: 'VIEW' },
    ],
  })
})

test.afterAll(async () => {
  if (lancamento) await db().from('financial_transactions').delete().eq('id', lancamento)
  if (agendamento) await db().from('appointments').delete().eq('id', agendamento)
  if (comercial) await db().from('role_report_tabs').delete().eq('role_id', comercial.roleId)
  await dona?.limpar(); await comercial?.limpar(); await recepcao?.limpar()
  if (segundaUnidade) await db().from('branches').delete().eq('id', segundaUnidade)
  await rede?.limpar()
})

async function dashboardComo<T>(browser: Browser, quem: MembroDeTeste, fn: (p: Page) => Promise<T>) {
  const ctx = await browser.newContext({ storageState: quem.estado })
  try {
    const p = await ctx.newPage()
    await p.goto('/admin/dashboard')
    await expect(p.locator('main')).toBeVisible({ timeout: 30_000 })
    return await fn(p)
  } finally { await ctx.close() }
}

async function semDinheiro(p: Page) {
  for (const titulo of ['Evolução —', 'Ranking de unidades', 'Ranking — Procedimentos por receita dos atendimentos', 'Ranking — Procedimentos por margem', 'Ranking — Profissionais por receita dos atendimentos', 'Ranking — Valor gasto']) {
    await expect(p.getByText(titulo, { exact: false }), titulo).toHaveCount(0)
  }
  const html = await p.content()
  expect(html.includes('7777.77') || html.includes('7.777,77'), 'o valor não vai ao navegador').toBe(false)
}

test('a comercial (Relatórios só com a aba Comercial) não vê dinheiro no dashboard', async ({ browser }) => {
  await dashboardComo(browser, comercial!, async p => {
    // O funil, sim.
    await expect(p.getByText('Funil', { exact: false }).first()).toBeVisible()
    await semDinheiro(p)
  })
})

test('a recepção (sem Financeiro) não vê os rankings de receita nem de margem', async ({ browser }) => {
  await dashboardComo(browser, recepcao!, async p => {
    await expect(p.getByText('Ranking — Procedimentos realizados')).toBeVisible()
    await semDinheiro(p)
  })
})

test('a dona (o controle) vê o faturamento e o ranking de receita', async ({ browser }) => {
  await dashboardComo(browser, dona!, async p => {
    await expect(p.getByText('Ranking — Procedimentos por receita dos atendimentos')).toBeVisible()
    await expect(p.getByText('Ranking de unidades')).toBeVisible()
    await expect(p.getByText('R$ 7.777,77').first()).toBeVisible()
  })
})
