import { test, expect, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { subirOpenaiFalsa, type OpenaiFalsa } from './apoio/openai-falsa'
import { redeDoCopilot, contraAFalsa, comSessao, falarComOCopilot, esperarResposta, type RedeDoCopilot } from './apoio/copilot'
import type { MembroDeTeste, Permissao } from './apoio/sessao'

/**
 * O Copilot sem o "só os meus" (SM1/SM5, o Heitor, 2026-11-23: "pode tirar, as
 * vistas pessoais resolvem").
 *
 * Era o recorte do "só os meus" na ferramenta `indicadores` (2026-10-28). O
 * escopo saiu: quem tem a Agenda, o Financeiro e o CRM em Ver vê os números
 * de todos, nas unidades ao alcance — mesmo quem atende. A ferramenta fala
 * pelos módulos da pessoa; a vista pessoal é dos dashboards, não do Copilot.
 */
test.skip(!contraAFalsa(), 'só contra o build: o servidor precisa da OpenAI falsa')
test.describe.configure({ mode: 'serial' })

const marca = Date.now().toString(36)
let falsa: OpenaiFalsa
let rede: RedeDoCopilot
let ela: MembroDeTeste
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

  // Ela atende e tem os módulos em Ver: sem escopo, vê os números de todos.
  const matriz: Permissao[] = [
    { modulo: 'agenda', nivel: 'VIEW' },
    { modulo: 'financial', nivel: 'VIEW' },
    { modulo: 'crm', nivel: 'VIEW' },
    { modulo: 'reports', nivel: 'VIEW' },
  ]
  ela = await rede.membro('own', matriz)
  {
    const { error } = await db.from('role_report_tabs').insert(ABAS.map(tab => ({ tenant_id: o.tenantId, role_id: ela.roleId, tab })))
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
    if (ela) await db.from('role_report_tabs').delete().eq('role_id', ela.roleId)
  }
  await rede?.limpar()
  await falsa?.fechar()
})

const reais = (v: string) => new RegExp(`R\\$\\s${v.replace('.', '\\.')}`)

// Sem o "só os meus" (SM1/SM5, o Heitor, 2026-11-23): com os módulos em Ver, os números de todos.
test('quem atende e tem os módulos em Ver: a visão geral, os profissionais e o estoque são os da rede', async ({ browser }) => {
  await comSessao(browser, ela.estado, async p => {
    await p.goto('/admin/dashboard')
    const geral = await chamar(p, { aba: 'overview', periodo: 'month' })
    expect(String(geral.faturamento), 'a receita de todas').toMatch(reais('420,00'))
    expect(geral).toHaveProperty('despesas')
    const prof = await chamar(p, { aba: 'profissionais', periodo: 'month' })
    expect((prof.porProfissional as { nome: string }[]).map(x => x.nome).sort()).toEqual([nomeDaOutra, nomeDela].sort())
    const est = await chamar(p, { aba: 'estoque', periodo: 'month' })
    expect(String(est.consumoNoPeriodo), 'o insumo de todos os atendimentos').toMatch(reais('70,00'))
  })
})

// Sem o "só os meus" no CRM (SM3/SM5, o Heitor, 2026-11-23): o funil conta as oportunidades de todos.
test('com o CRM em Ver: o funil conta as oportunidades de todos', async ({ browser }) => {
  // C5 da F68: o comercial é o painel da tela — as etapas do funil padrão e o
  // total dos funis ativos (`oportunidades`), o mesmo número da aba Comercial.
  const total = (s: Record<string, unknown>) => {
    const etapas = (s.funil as { etapas: { oportunidades: number }[] }).etapas.reduce((t, e) => t + e.oportunidades, 0)
    expect(s.oportunidades).toBe(etapas)
    return s.oportunidades as number
  }
  await comSessao(browser, ela.estado, async p => {
    await p.goto('/admin/dashboard')
    expect(total(await chamar(p, { aba: 'comercial', periodo: 'month' }))).toBe(3)
  })
})
