import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { responderAnamnese } from './apoio/anamnese'
import { apagarAgendamentos } from './apoio/limpeza'

/**
 * F68 — os indicadores na TELA (as contas no banco estão em
 * `indicadores-f68-contas.spec.ts`), numa rede própria com duas unidades
 * ativas e uma desativada com movimento.
 *
 * - D10 da 13ª simulação: o dashboard da unidade diz "Minhas comissões R$ 0" e
 *   "Meus atendimentos 0" à profissional que atende também na outra unidade.
 *   O "Meus…" conta o que é DELA nas duas, e diz "nas 2 unidades"; a agenda
 *   do dia diz em qual unidade é o horário de fora.
 * - D12: o total de clientes do cabeçalho da vendedora ("só os meus" na
 *   agenda, não atende) é o da clínica — era "0 clientes".
 * - C48: o ticket sem cliente que pagou é "—", não R$ 0,00.
 * - C45: a receita da rede inteira conta a unidade desativada que teve
 *   movimento (o "Por filial" a mostra; o total não fechava com as linhas).
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let dela: MembroDeTeste | null = null
let vendedora: MembroDeTeste | null = null
let dona: MembroDeTeste | null = null
let slugA = ''
let unidadeB = '', nomeB = ''
let unidadeC = ''
const agendamentos: string[] = []

async function comSessao(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado, viewport: { width: 1440, height: 900 } })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  test.setTimeout(150_000)
  rede = await criarOutraRede(`f68t${marca}`)
  const b = db()
  expect((await b.from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  slugA = (await b.from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  nomeB = `[e2e] Água Verde ${marca}`
  const { data: ub, error: eB } = await b.from('branches')
    .insert({ tenant_id: rede.tenantId, name: nomeB, slug: `e2e-f68-av-${marca}` }).select('id').single<{ id: string }>()
  expect(eB).toBeNull()
  unidadeB = ub!.id
  // A unidade desativada que ainda recebeu hoje (C45).
  const { data: uc, error: eC } = await b.from('branches')
    .insert({ tenant_id: rede.tenantId, name: `[e2e] Fechada ${marca}`, slug: `e2e-f68-fe-${marca}`, is_active: false }).select('id').single<{ id: string }>()
  expect(eC).toBeNull()
  unidadeC = uc!.id
  expect((await b.from('commission_configs').upsert({ tenant_id: rede.tenantId, periodo: 'MENSAL' }, { onConflict: 'tenant_id' })).error).toBeNull()

  dela = await criarMembro(`f68d${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Profissional',
    permissoes: [{ modulo: 'financial', nivel: 'VIEW', escopo: 'OWN' }, { modulo: 'agenda', nivel: 'MANAGE', escopo: 'OWN' }],
  })
  // Ela atende nas duas unidades (decisão 2 da 8ª: o "Atende" é por unidade).
  expect((await b.from('users').update({ atende_em: [rede.branchId, unidadeB] }).eq('id', dela.userId)).error).toBeNull()
  vendedora = await criarMembro(`f68v${marca}`, {
    tenant: rede.tenantId, branchId: null, rotulo: 'Vendedora',
    permissoes: [{ modulo: 'agenda', nivel: 'VIEW', escopo: 'OWN' }, { modulo: 'clients', nivel: 'VIEW' }, { modulo: 'crm', nivel: 'MANAGE' }],
  })
  dona = await criarMembro(`f68o${marca}`, { tenant: rede.tenantId, donoDaRede: true, permissoes: [] })

  // O atendimento DELA na Água Verde, concluído e pago: 10% de R$ 300 = R$ 30.
  const cliente = await rede.criarCliente('Na Água Verde')
  const { data: ap, error } = await b.from('appointments').insert({
    branch_id: unidadeB, client_id: cliente, professional_id: dela.userId, procedure_id: rede.procedureId,
    scheduled_at: new Date(Date.now() - 60 * 60_000).toISOString(), duration_min: 30, price: 300, status: 'IN_PROGRESS', source: 'INTERNAL',
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  agendamentos.push(ap!.id)
  await responderAnamnese(cliente, rede.tenantId)
  expect((await b.rpc('concluir_atendimento', {
    p_agendamento: ap!.id, p_tenant: rede.tenantId, p_ator: null, p_ator_nome: null,
    p_dados: { insumos: [], comissoes: [{ procedure_id: rede.procedureId, origem: 'AVULSO', treatment_plan_id: null, regra_tipo: 'PERCENTAGE', regra_valor: 10, preco: 300 }] },
  })).error).toBeNull()
  expect((await b.rpc('confirmar_pagamento_do_atendimento', {
    p_agendamento: ap!.id, p_tenant: rede.tenantId, p_ator: null, p_ator_nome: null,
    p_dados: { metodo: 'PIX', pontos: 0, desconto: 0, valor_final: 300 },
  })).error).toBeNull()
  // E um horário dela no Batel, mais tarde hoje.
  const outra = await rede.criarCliente('No Batel')
  const { data: ap2, error: e2 } = await b.from('appointments').insert({
    branch_id: rede.branchId, client_id: outra, professional_id: dela.userId, procedure_id: rede.procedureId,
    scheduled_at: new Date(Date.now() + 30 * 60_000).toISOString(), duration_min: 30, price: 200, status: 'SCHEDULED', source: 'INTERNAL',
  }).select('id').single<{ id: string }>()
  expect(e2).toBeNull()
  agendamentos.push(ap2!.id)
  // A unidade desativada recebeu R$ 50 hoje.
  expect((await b.from('financial_transactions').insert({
    branch_id: unidadeC, type: 'INCOME', category: 'Serviços', description: `[e2e] fechada ${marca}`,
    amount: 50, is_paid: true, paid_at: new Date().toISOString(), payment_method: 'PIX', created_by: 'e2e',
  })).error).toBeNull()
})

test.afterAll(async () => {
  if (agendamentos.length) {
    await db().from('commissions').delete().in('appointment_id', agendamentos)
    await db().from('commission_lines').delete().in('appointment_id', agendamentos)
    await db().from('financial_transactions').delete().in('appointment_id', agendamentos)
    expect(await apagarAgendamentos(agendamentos)).toEqual([])
  }
  await dela?.limpar(); await vendedora?.limpar(); await dona?.limpar(); await rede?.limpar()
})

test('D10: o "Meus…" do dashboard conta o que é dela nas duas unidades, e diz', async ({ browser }) => {
  await comSessao(browser, dela!, async p => {
    await p.goto(`/${slugA}/dashboard`)
    const comissoes = p.locator('[data-minhas-comissoes]')
    await expect(comissoes).toContainText('R$ 30', { timeout: 20_000 })
    await expect(comissoes).toContainText('nas 2 unidades')
    const atendimentos = p.locator('.card').filter({ has: p.getByText('Meus atendimentos', { exact: true }) })
    await expect(atendimentos).toContainText('1')
    await expect(atendimentos).toContainText('nas 2 unidades')
    const hoje = p.locator('.card').filter({ has: p.getByText('Meus agendamentos hoje', { exact: true }) })
    await expect(hoje).toContainText('2')
    // O horário da Água Verde diz onde é.
    await expect(p.locator('[data-outra-unidade]')).toContainText(nomeB)
  })
})

test('D12: o total de clientes do cabeçalho da vendedora é o da clínica', async ({ browser }) => {
  const { count } = await db().from('clients').select('id', { count: 'exact', head: true }).eq('tenant_id', rede!.tenantId).eq('is_active', true)
  expect(count).toBeGreaterThan(0)
  await comSessao(browser, vendedora!, async p => {
    await p.goto('/admin/dashboard')
    await expect(p.getByText(new RegExp(`· ${count} clientes? da clínica`))).toBeVisible({ timeout: 20_000 })
  })
})

test('C48 e C45: o ticket sem cliente pagante é "—"; a receita da rede conta a unidade desativada', async ({ browser }) => {
  await comSessao(browser, dona!, async p => {
    await p.goto('/admin/dashboard?period=custom&from=2025-01-01&to=2025-01-31')
    await expect(p.locator('[data-kpi="Ticket médio"]')).toContainText('—', { timeout: 20_000 })
    await expect(p.locator('[data-kpi="Ticket médio"]')).not.toContainText('R$')

    // Hoje: R$ 300 do atendimento + R$ 50 da unidade desativada.
    await p.goto('/admin/dashboard?period=today')
    await expect(p.locator('[data-kpi^="Receita bruta"]')).toContainText('350', { timeout: 20_000 })
  })
})
