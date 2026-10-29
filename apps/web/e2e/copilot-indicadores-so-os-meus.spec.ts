import { test, expect, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { subirOpenaiFalsa, type OpenaiFalsa } from './apoio/openai-falsa'
import { redeDoCopilot, contraAFalsa, comSessao, falarComOCopilot, esperarResposta, type RedeDoCopilot } from './apoio/copilot'
import type { MembroDeTeste, Permissao } from './apoio/sessao'

/**
 * O Copilot com "só os meus" (decisão do Heitor, 2026-10-28: "quem tem 'só os
 * meus' vê 'só os meus', em qualquer lugar").
 *
 * A frente G achou: a ferramenta `indicadores` chamava `getCore`, o funil, as
 * vendas e `getRelatorio` sem o profissional — quem tem a agenda "só os meus"
 * perguntava "quanto faturamos" e recebia a rede. O recorte é o do dashboard:
 * agenda ou financeiro OWN → os números DELA (`p_professional_id`, os
 * predicados de metrics_core); CRM OWN → o funil dos leads dela e dos sem
 * dono (`p_owner`). O que não se atribui a ela (despesa, valor em estoque,
 * itens críticos) não vai.
 */
test.skip(!contraAFalsa(), 'só contra o build: o servidor precisa da OpenAI falsa')
test.describe.configure({ mode: 'serial' })

const marca = Date.now().toString(36)
let falsa: OpenaiFalsa
let rede: RedeDoCopilot
let ela: MembroDeTeste
let gestora: MembroDeTeste
let nomeDela = ''
let nomeDaOutra = ''
const leads: string[] = []
const agora = new Date().toISOString()
const ABAS = ['overview', 'vendas', 'profissionais', 'clientes', 'comercial', 'estoque']

async function chamar(p: Page, args: Record<string, unknown>) {
  falsa.zerar()
  falsa.roteiro.push({ chamar: [{ nome: 'indicadores', args }] }, { texto: 'Pronto.' })
  await falarComOCopilot(p, `teste indicadores ${JSON.stringify(args)}`)
  await esperarResposta(p)
  const saida = falsa.saidasDeFerramenta().filter(s => s.nome === 'indicadores').at(-1)
  return (saida?.saida ?? {}) as Record<string, unknown>
}

test.beforeAll(async () => {
  test.setTimeout(240_000)
  falsa = await subirOpenaiFalsa()
  rede = await redeDoCopilot(`ind${marca}`)
  const db = banco()
  const o = rede.outra
  expect((await db.from('users').update({ branch_id: o.branchId, provides_services: true }).eq('id', o.professionalId)).error).toBeNull()
  const produto = await o.criarProduto('Insumo', 100)

  const matriz = (escopo: 'OWN' | 'ALL'): Permissao[] => [
    { modulo: 'agenda', nivel: 'VIEW', escopo },
    { modulo: 'crm', nivel: 'VIEW', escopo },
    { modulo: 'reports', nivel: 'VIEW' },
  ]
  ela = await rede.membro('own', matriz('OWN'))
  gestora = await rede.membro('all', matriz('ALL'))
  for (const m of [ela, gestora]) {
    const { error } = await db.from('role_report_tabs').insert(ABAS.map(tab => ({ tenant_id: o.tenantId, role_id: m.roleId, tab })))
    expect(error, 'as abas do relatório').toBeNull()
  }
  expect((await db.from('users').update({ provides_services: true }).eq('id', ela.userId)).error).toBeNull()
  nomeDela = (await db.from('users').select('name').eq('id', ela.userId).single<{ name: string }>()).data!.name
  nomeDaOutra = (await db.from('users').select('name').eq('id', o.professionalId).single<{ name: string }>()).data!.name

  // Um atendimento pago de cada uma, com o insumo gasto.
  for (const [rotulo, prof, valor, consumo] of [['Dela', ela.userId, 120, 2], ['Da outra', o.professionalId, 300, 5]] as const) {
    const c = await o.criarCliente(`Cliente ${rotulo}`)
    const { data, error } = await db.from('appointments').insert({
      branch_id: o.branchId, client_id: c, procedure_id: o.procedureId, professional_id: prof,
      status: 'COMPLETED', source: 'INTERNAL', duration_min: 30, price: valor, scheduled_at: agora, completed_at: agora,
    }).select('id').single<{ id: string }>()
    expect(error).toBeNull()
    expect((await db.from('financial_transactions').insert({
      branch_id: o.branchId, client_id: c, appointment_id: data!.id, type: 'INCOME', category: 'Serviços',
      description: `[e2e] pago ${valor} ${marca}`, amount: valor, payment_method: 'PIX', is_paid: true, paid_at: agora, created_by: 'e2e',
    })).error).toBeNull()
    expect((await db.from('stock_movements').insert({
      branch_id: o.branchId, product_id: produto, type: 'PROCEDURE_USAGE', quantity: -consumo, unit_cost: 10,
      balance_after: 0, appointment_id: data!.id, created_by: 'e2e',
    })).error).toBeNull()
  }
  expect((await db.from('financial_transactions').insert({
    branch_id: o.branchId, type: 'EXPENSE', category: 'Aluguel', description: `[e2e] aluguel ${marca}`,
    amount: 777, payment_method: 'PIX', is_paid: true, paid_at: agora, created_by: 'e2e',
  })).error).toBeNull()

  // O funil: um lead dela, um da outra e um sem dono.
  const f = await db.from('crm_funnels').insert({ tenant_id: o.tenantId, name: `${PREFIXO} Funil ${marca}`, is_default: true }).select('id').single<{ id: string }>()
  expect(f.error).toBeNull()
  const e = await db.from('crm_stages').insert({ tenant_id: o.tenantId, funnel_id: f.data!.id, name: 'Primeiro contato', position: 0 }).select('id').single<{ id: string }>()
  expect(e.error).toBeNull()
  for (const [nome, dono] of [['Lead dela', ela.userId], ['Lead da outra', o.professionalId], ['Lead sem dono', null]] as const) {
    const { data, error } = await db.from('leads').insert({
      tenant_id: o.tenantId, name: `${PREFIXO} ${nome} ${marca}`, phone: '5548' + String(Date.now() + leads.length).slice(-9),
      crm_stage_id: e.data!.id, owner_id: dono, source: 'Instagram',
    }).select('id').single<{ id: string }>()
    expect(error).toBeNull()
    leads.push(data!.id)
  }
})

test.afterAll(async () => {
  const db = banco()
  if (rede) {
    const o = rede.outra
    if (leads.length) {
      await db.from('lead_events').delete().in('lead_id', leads)
      await db.from('leads').delete().in('id', leads)
    }
    await db.from('contacts').delete().eq('tenant_id', o.tenantId)
    await db.from('crm_stages').delete().eq('tenant_id', o.tenantId)
    await db.from('crm_funnels').delete().eq('tenant_id', o.tenantId)
    await db.from('crm_quadro_sinais').delete().eq('tenant_id', o.tenantId)
    await db.from('stock_movements').delete().eq('branch_id', o.branchId)
    await db.from('financial_transactions').delete().eq('branch_id', o.branchId)
    await db.from('appointments').delete().eq('branch_id', o.branchId)
    for (const m of [ela, gestora]) if (m) await db.from('role_report_tabs').delete().eq('role_id', m.roleId)
  }
  await rede?.limpar()
  await falsa?.fechar()
})

const reais = (v: string) => new RegExp(`R\\$\\s${v.replace('.', '\\.')}`)

test('"só os meus": a visão geral, as vendas, os profissionais e as clientes são os DELA', async ({ browser }) => {
  await comSessao(browser, ela.estado, async p => {
    await p.goto('/admin/dashboard')
    const geral = await chamar(p, { aba: 'overview', periodo: 'month' })
    expect(String(geral.faturamento), 'a receita dela').toMatch(reais('120,00'))
    expect(geral.atendimentosConcluidos).toBe(1)
    expect(geral, 'a despesa não se atribui a ela').not.toHaveProperty('despesas')

    const vendas = await chamar(p, { aba: 'vendas', periodo: 'month' })
    expect(String(vendas.total)).toMatch(reais('120,00'))
    expect(vendas.vendas).toBe(1)

    const prof = await chamar(p, { aba: 'profissionais', periodo: 'month' })
    expect((prof.porProfissional as { nome: string }[]).map(x => x.nome)).toEqual([nomeDela])

    const cli = await chamar(p, { aba: 'clientes', periodo: 'month' })
    expect(cli.ativos, 'as clientes que ela atende').toBe(1)
    expect(JSON.stringify(cli.quemMaisGasta)).not.toContain('Da outra')

    const est = await chamar(p, { aba: 'estoque', periodo: 'month' })
    expect(String(est.consumoNoPeriodo), 'o insumo dos atendimentos dela').toMatch(reais('20,00'))
    expect(est, 'o valor em estoque não se atribui a ela').not.toHaveProperty('valorEmEstoque')
  })
  // Controle: a gestora (tudo ALL) vê a rede.
  await comSessao(browser, gestora.estado, async p => {
    await p.goto('/admin/dashboard')
    const geral = await chamar(p, { aba: 'overview', periodo: 'month' })
    expect(String(geral.faturamento)).toMatch(reais('420,00'))
    expect(geral).toHaveProperty('despesas')
    const prof = await chamar(p, { aba: 'profissionais', periodo: 'month' })
    expect((prof.porProfissional as { nome: string }[]).map(x => x.nome).sort()).toEqual([nomeDaOutra, nomeDela].sort())
    const est = await chamar(p, { aba: 'estoque', periodo: 'month' })
    expect(String(est.consumoNoPeriodo)).toMatch(reais('70,00'))
  })
})

test('"só os meus" no CRM: o funil conta os leads dela e os sem dono', async ({ browser }) => {
  const total = (s: Record<string, unknown>) => (s.funil as { oportunidades: number }[]).reduce((t, e) => t + e.oportunidades, 0)
  await comSessao(browser, ela.estado, async p => {
    await p.goto('/admin/dashboard')
    expect(total(await chamar(p, { aba: 'comercial', periodo: 'month' }))).toBe(2)
  })
  await comSessao(browser, gestora.estado, async p => {
    await p.goto('/admin/dashboard')
    expect(total(await chamar(p, { aba: 'comercial', periodo: 'month' }))).toBe(3)
  })
})
