import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste, type Permissao } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * Os Relatórios com "só os meus" (decisão do Heitor, 2026-10-28: "quem tem
 * 'só os meus' vê 'só os meus', em qualquer lugar").
 *
 * A frente G achou: a tela de Relatórios (`reports-bi-section`) chamava
 * getRelatorio, getRetention, getNewClientsSeries, getCore, getSeries, as
 * vendas, o funil, o painel comercial e os motivos de perda sem o
 * profissional nem o dono — a profissional com a agenda "só os meus" via o
 * faturamento, as clientes e os profissionais da rede inteira.
 *
 * O recorte é o do dashboard: agenda ou financeiro OWN → os números DELA;
 * CRM OWN → o comercial dos leads dela (e dos sem dono, como o quadro). O que
 * não se atribui a ela (a despesa, o lucro, a margem, o saldo e o valor do
 * estoque, as parcelas a receber) fica escondido.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let ela: MembroDeTeste | null = null
let gestora: MembroDeTeste | null = null
let nomeDela = ''
let nomeDaOutra = ''
const leads: string[] = []
const agora = new Date().toISOString()
const ABAS = ['overview', 'financeiro', 'vendas', 'agenda', 'clientes', 'procedimentos', 'profissionais', 'estoque', 'comercial']
test.describe.configure({ timeout: 120_000 })

async function como(browser: Browser, quem: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: quem.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}
async function aba(p: Page, tab: string) {
  await p.goto(`/admin/reports?tab=${tab}&period=month`)
  const corpo = p.locator('main')
  await expect(corpo).toBeVisible()
  return corpo
}
const kpi = (p: Page, rotulo: string) => p.locator('.card').filter({ has: p.getByText(rotulo, { exact: true }) }).first()

test.beforeAll(async () => {
  test.setTimeout(240_000)
  rede = await criarOutraRede(`rso${marca}`)
  const o = rede
  expect((await db().from('users').update({ branch_id: o.branchId, provides_services: true }).eq('id', o.professionalId)).error).toBeNull()
  const produto = await o.criarProduto('Insumo', 100)

  const matriz = (escopo: 'OWN' | 'ALL'): Permissao[] => [
    { modulo: 'agenda', nivel: 'VIEW', escopo },
    { modulo: 'financial', nivel: 'VIEW', escopo },
    { modulo: 'crm', nivel: 'VIEW', escopo },
    { modulo: 'reports', nivel: 'VIEW' },
  ]
  ela = await criarMembro(`rsp${marca}`, { tenant: o.tenantId, rotulo: 'Profissional', permissoes: matriz('OWN') })
  gestora = await criarMembro(`rsg${marca}`, { tenant: o.tenantId, rotulo: 'Gestora', permissoes: matriz('ALL') })
  for (const m of [ela, gestora]) {
    const { error } = await db().from('role_report_tabs').insert(ABAS.map(tab => ({ tenant_id: o.tenantId, role_id: m.roleId, tab })))
    expect(error, 'as abas do relatório').toBeNull()
  }
  expect((await db().from('users').update({ provides_services: true }).eq('id', ela.userId)).error).toBeNull()
  nomeDela = (await db().from('users').select('name').eq('id', ela.userId).single<{ name: string }>()).data!.name
  nomeDaOutra = (await db().from('users').select('name').eq('id', o.professionalId).single<{ name: string }>()).data!.name

  for (const [rotulo, prof, valor, consumo] of [['Dela', ela.userId, 120, 2], ['Da outra', o.professionalId, 300, 5]] as const) {
    const c = await o.criarCliente(`Cliente ${rotulo}`)
    const { data, error } = await db().from('appointments').insert({
      branch_id: o.branchId, client_id: c, procedure_id: o.procedureId, professional_id: prof,
      status: 'COMPLETED', source: 'INTERNAL', duration_min: 30, price: valor, scheduled_at: agora, completed_at: agora,
    }).select('id').single<{ id: string }>()
    expect(error).toBeNull()
    expect((await db().from('financial_transactions').insert({
      branch_id: o.branchId, client_id: c, appointment_id: data!.id, type: 'INCOME', category: 'Serviços',
      description: `[e2e] pago ${valor} ${marca}`, amount: valor, payment_method: 'PIX', is_paid: true, paid_at: agora, created_by: 'e2e',
    })).error).toBeNull()
    expect((await db().from('stock_movements').insert({
      branch_id: o.branchId, product_id: produto, type: 'PROCEDURE_USAGE', quantity: -consumo, unit_cost: 10,
      balance_after: 0, appointment_id: data!.id, created_by: 'e2e',
    })).error).toBeNull()
  }
  expect((await db().from('financial_transactions').insert({
    branch_id: o.branchId, type: 'EXPENSE', category: 'Aluguel', description: `[e2e] aluguel ${marca}`,
    amount: 777, payment_method: 'PIX', is_paid: true, paid_at: agora, created_by: 'e2e',
  })).error).toBeNull()

  const f = await db().from('crm_funnels').insert({ tenant_id: o.tenantId, name: `${PREFIXO} Funil ${marca}`, is_default: true }).select('id').single<{ id: string }>()
  expect(f.error).toBeNull()
  const e = await db().from('crm_stages').insert({ tenant_id: o.tenantId, funnel_id: f.data!.id, name: 'Primeiro contato', position: 0 }).select('id').single<{ id: string }>()
  expect(e.error).toBeNull()
  for (const [nome, dono] of [['Lead dela', ela.userId], ['Lead da outra', o.professionalId], ['Lead sem dono', null]] as const) {
    const { data, error } = await db().from('leads').insert({
      tenant_id: o.tenantId, name: `${PREFIXO} ${nome} ${marca}`, phone: '5548' + String(Date.now() + leads.length).slice(-9),
      crm_stage_id: e.data!.id, owner_id: dono, source: 'Instagram',
    }).select('id').single<{ id: string }>()
    expect(error).toBeNull()
    leads.push(data!.id)
  }
})

test.afterAll(async () => {
  const falhas: string[] = []
  const olhar = (o: string, r: { error: { message: string } | null }) => { if (r.error) falhas.push(`${o}: ${r.error.message}`) }
  if (rede) {
    if (leads.length) {
      olhar('eventos', await db().from('lead_events').delete().in('lead_id', leads))
      olhar('leads', await db().from('leads').delete().in('id', leads))
    }
    olhar('contatos', await db().from('contacts').delete().eq('tenant_id', rede.tenantId))
    olhar('etapas', await db().from('crm_stages').delete().eq('tenant_id', rede.tenantId))
    olhar('funis', await db().from('crm_funnels').delete().eq('tenant_id', rede.tenantId))
    olhar('sinais', await db().from('crm_quadro_sinais').delete().eq('tenant_id', rede.tenantId))
    olhar('movimentos', await db().from('stock_movements').delete().eq('branch_id', rede.branchId))
    olhar('lançamentos', await db().from('financial_transactions').delete().eq('branch_id', rede.branchId))
    olhar('agendamentos', await db().from('appointments').delete().eq('branch_id', rede.branchId))
    for (const m of [ela, gestora]) if (m) olhar('abas', await db().from('role_report_tabs').delete().eq('role_id', m.roleId))
  }
  await ela?.limpar(); await gestora?.limpar(); await rede?.limpar()
  expect(falhas).toEqual([])
})

test('"só os meus": a visão geral e o financeiro são o dinheiro DELA, sem despesa, lucro nem margem', async ({ browser }) => {
  await como(browser, ela!, async p => {
    const geral = await aba(p, 'overview')
    await expect.soft(kpi(p, 'Faturamento'), 'a receita dela').toContainText('R$ 120,00')
    await expect.soft(geral, 'não a da rede').not.toContainText('R$ 420,00')
    await expect.soft(geral, 'nem a despesa').not.toContainText('777,00')
    for (const r of ['Despesas', 'Lucro']) await expect.soft(p.getByText(r, { exact: true }), r).toHaveCount(0)

    const fin = await aba(p, 'financeiro')
    await expect.soft(kpi(p, 'Receita Bruta')).toContainText('R$ 120,00')
    await expect.soft(fin).not.toContainText('777,00')
    for (const r of ['Despesas pagas', 'Lucro', 'Margem', 'DRE Simplificado', 'Parcelas Pendentes']) {
      await expect.soft(p.getByText(r, { exact: true }), r).toHaveCount(0)
    }
  })
  // Controle: a gestora vê a rede.
  await como(browser, gestora!, async p => {
    await aba(p, 'overview')
    await expect(kpi(p, 'Faturamento')).toContainText('R$ 420,00')
    await expect(p.getByText('Lucro', { exact: true }).first()).toBeVisible()
  })
})

test('"só os meus": vendas, agenda, clientes, procedimentos e profissionais são os DELA', async ({ browser }) => {
  await como(browser, ela!, async p => {
    await aba(p, 'vendas')
    await expect.soft(p.locator('[data-total-vendas]'), 'as vendas dela').toContainText(/1 venda\b.*R\$\s120,00/)
    // A exportação leva o mesmo recorte: não abre o que a tela fecha.
    const csv = await (await p.request.get('/api/relatorios/vendas?period=month')).text()
    expect.soft(csv, 'o CSV traz a venda dela').toContain('120,00')
    expect.soft(csv, 'e não a da outra').not.toContain('Cliente Da outra')

    await aba(p, 'agenda')
    await expect.soft(kpi(p, 'Total Agendamentos')).toContainText(/^\D*1\D*$/)

    const cli = await aba(p, 'clientes')
    await expect.soft(kpi(p, 'Total Ativos'), 'as clientes que ela atende').toContainText(/^\D*1\D*$/)
    await expect.soft(kpi(p, 'Novos no Período')).toContainText(/^\D*1\D*$/)
    await expect.soft(kpi(p, 'Atendidos no Período')).toContainText(/^\D*1\D*$/)
    await expect.soft(cli).not.toContainText('Cliente Da outra')

    const proc = await aba(p, 'procedimentos')
    await expect.soft(kpi(p, 'Receita Total')).toContainText('R$ 120,00')
    await expect.soft(p.getByText('Top 3 por Faixa de Idade — Margem', { exact: true }), 'a margem é do catálogo').toHaveCount(0)
    await expect.soft(proc).not.toContainText('R$ 420,00')

    const prof = await aba(p, 'profissionais')
    await expect.soft(prof).toContainText(nomeDela)
    await expect.soft(prof, 'nem a outra profissional').not.toContainText(nomeDaOutra)
  })
  await como(browser, gestora!, async p => {
    const prof = await aba(p, 'profissionais')
    await expect(prof).toContainText(nomeDaOutra)
    await aba(p, 'clientes')
    await expect(kpi(p, 'Total Ativos')).toContainText(/^\D*2\D*$/)
  })
})

test('"só os meus": o estoque mostra só o insumo dela; o saldo não se atribui a ela', async ({ browser }) => {
  await como(browser, ela!, async p => {
    await aba(p, 'estoque')
    await expect.soft(kpi(p, 'Consumo no Período'), 'o insumo dos atendimentos dela').toContainText('R$ 20,00')
    for (const r of ['Valor em Estoque', 'Itens Críticos', 'Itens Zerados', 'Valor em Estoque por Categoria', 'Saúde do Estoque por Unidade']) {
      await expect.soft(p.getByText(r, { exact: true }), r).toHaveCount(0)
    }
  })
  await como(browser, gestora!, async p => {
    await aba(p, 'estoque')
    await expect(kpi(p, 'Consumo no Período')).toContainText('R$ 70,00')
    await expect(p.getByText('Valor em Estoque', { exact: true }).first()).toBeVisible()
  })
})

test('"só os meus" no CRM: o comercial é o dos leads dela e dos sem dono', async ({ browser }) => {
  await como(browser, ela!, async p => {
    const com = await aba(p, 'comercial')
    await expect.soft(kpi(p, 'Leads recebidos')).toContainText(/^\D*2\D*$/)
    await expect.soft(com, 'o ranking não traz a outra').not.toContainText(nomeDaOutra)
  })
  await como(browser, gestora!, async p => {
    await aba(p, 'comercial')
    await expect(kpi(p, 'Leads recebidos')).toContainText(/^\D*3\D*$/)
  })
})
