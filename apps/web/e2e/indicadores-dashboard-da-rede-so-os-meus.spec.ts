import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * D7 da simulação de 2026-10-28 (o dashboard): a profissional da rede, com a
 * agenda e o financeiro "só os meus", via no dashboard da REDE a receita de
 * todas, o custo do mês (R$ 4.500), o lucro e a margem por procedimento. O
 * dashboard da unidade já recortava (`professionalOnly`); o da rede rodava
 * `getCore` sem o profissional.
 *
 * Decisão do Heitor (2026-10-28): "quem tem 'só os meus' vê 'só os meus', em
 * qualquer lugar". Com a agenda ou o financeiro em OWN, TODO número dos dois
 * dashboards é o DELA (lib/metrics, `professionalId`): a receita, os
 * rankings que só contam (procedimentos, recorrência, profissionais,
 * clientes), a demografia e o total de clientes (as clientes que ela atendeu),
 * o giro dos atendimentos dela, os planos dela aguardando checkout, as
 * clientes dela a reativar, e o gráfico do faturamento (só a receita). O que
 * não se atribui a ela — o custo, o lucro, a margem do catálogo, o ranking e
 * a ocupação por filial — segue escondido. Com o CRM "só os meus", o funil
 * conta os leads dela e os sem dono, como o quadro.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let propria: MembroDeTeste | null = null
let gestora: MembroDeTeste | null = null
let slug = ''
let nomeDela = ''
let nomeDaOutra = ''
let outroProc = ''
const agora = new Date().toISOString()
const diasAtras = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString()
const leads: string[] = []
// Muitas conferências por tela: com uma regressão, cada uma espera o seu tempo.
test.describe.configure({ timeout: 120_000 })

async function como(browser: Browser, quem: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: quem.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

async function cliente(rotulo: string, extra: Record<string, unknown> = {}) {
  const id = await rede!.criarCliente(rotulo)
  if (Object.keys(extra).length) expect((await db().from('clients').update(extra).eq('id', id)).error).toBeNull()
  return id
}

async function atendidoEPago(rotulo: string, professionalId: string, procedureId: string, valor: number, consumo: number, extra: Record<string, unknown>) {
  const c = await cliente(rotulo, extra)
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: c, procedure_id: procedureId, professional_id: professionalId,
    status: 'COMPLETED', source: 'INTERNAL', duration_min: 30, price: valor, scheduled_at: agora, completed_at: agora,
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  const { error: eT } = await db().from('financial_transactions').insert({
    branch_id: rede!.branchId, client_id: c, appointment_id: data!.id, type: 'INCOME', category: 'Serviços',
    description: `[e2e] pago ${valor} ${marca}`, amount: valor, payment_method: 'PIX', is_paid: true, paid_at: agora, created_by: 'e2e',
  })
  expect(eT).toBeNull()
  // O insumo gasto no atendimento: o giro de estoque.
  const { error: eM } = await db().from('stock_movements').insert({
    branch_id: rede!.branchId, product_id: produto, type: 'PROCEDURE_USAGE', quantity: -consumo, unit_cost: 10,
    balance_after: 0, appointment_id: data!.id, created_by: 'e2e',
  })
  expect(eM).toBeNull()
}

/** Cliente que não vem há meses: a última visita foi com `professionalId`. */
async function sumida(rotulo: string, professionalId: string, tag: string) {
  const c = await cliente(rotulo, { created_at: diasAtras(200), tags: [tag] })
  const { error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: c, procedure_id: rede!.procedureId, professional_id: professionalId,
    status: 'COMPLETED', source: 'INTERNAL', duration_min: 30, price: 0, scheduled_at: diasAtras(150), completed_at: diasAtras(150),
  })
  expect(error).toBeNull()
  // O gatilho da tag de unidade pode reescrever as tags: a da unidade fica.
  expect((await db().from('clients').update({ tags: [tag] }).eq('id', c)).error).toBeNull()
}

async function planoProposto(rotulo: string, professionalId: string) {
  const c = await cliente(rotulo)
  const { error } = await db().from('treatment_plans').insert({
    branch_id: rede!.branchId, professional_id: professionalId, client_id: c, status: 'PROPOSED', name: `${PREFIXO} ${rotulo} ${marca}`,
  })
  expect(error).toBeNull()
}

let produto = ''

test.beforeAll(async () => {
  test.setTimeout(240_000)
  rede = await criarOutraRede(`dr${marca}`)
  expect((await db().from('users').update({ branch_id: rede.branchId, provides_services: true }).eq('id', rede.professionalId)).error).toBeNull()
  expect((await db().from('procedures').update({ price: 100 }).eq('id', rede.procedureId)).error).toBeNull()
  outroProc = `${PREFIXO} Outro proc ${marca}`
  const { data: pr, error: ePr } = await db().from('procedures')
    .insert({ tenant_id: rede.tenantId, name: outroProc, category: 'e2e', duration_min: 30, price: 300 })
    .select('id').single<{ id: string }>()
  expect(ePr).toBeNull()
  produto = await rede.criarProduto('Insumo', 100)

  const modulos = (escopo: 'OWN' | 'ALL') => [
    { modulo: 'agenda' as const, nivel: 'MANAGE' as const, escopo },
    { modulo: 'financial' as const, nivel: 'VIEW' as const, escopo },
    { modulo: 'crm' as const, nivel: 'VIEW' as const, escopo },
    { modulo: 'procedures' as const, nivel: 'VIEW' as const },
    { modulo: 'clients' as const, nivel: 'VIEW' as const },
    { modulo: 'team' as const, nivel: 'VIEW' as const },
    { modulo: 'stock' as const, nivel: 'VIEW' as const },
  ]
  // Como a Renata: da rede, "só os meus" na agenda, no financeiro e no CRM.
  propria = await criarMembro(`drp${marca}`, { tenant: rede.tenantId, rotulo: 'Profissional', permissoes: modulos('OWN') })
  expect((await db().from('users').update({ provides_services: true }).eq('id', propria.userId)).error).toBeNull()
  gestora = await criarMembro(`drg${marca}`, { tenant: rede.tenantId, rotulo: 'Gestora', permissoes: modulos('ALL') })
  nomeDela = (await db().from('users').select('name').eq('id', propria.userId).single<{ name: string }>()).data!.name
  nomeDaOutra = (await db().from('users').select('name').eq('id', rede.professionalId).single<{ name: string }>()).data!.name

  const b = await db().from('branches').select('slug, name').eq('id', rede.branchId).single<{ slug: string; name: string }>()
  slug = b.data!.slug
  const tag = `Unidade: ${b.data!.name}`

  await atendidoEPago('Dela', propria.userId, rede.procedureId, 120, 2, { city: `Cidadela ${marca}`, birth_date: '1990-05-01' })
  await atendidoEPago('Da outra', rede.professionalId, pr!.id, 300, 5, { city: `Cidoutra ${marca}`, birth_date: '1950-05-01' })
  await sumida('Sumida dela', propria.userId, tag)
  await sumida('Sumida da outra', rede.professionalId, tag)
  await planoProposto('Plano dela', propria.userId)
  await planoProposto('Plano alheio', rede.professionalId)
  const { error } = await db().from('financial_transactions').insert({
    branch_id: rede.branchId, type: 'EXPENSE', category: 'Aluguel', description: `[e2e] aluguel ${marca}`,
    amount: 777, payment_method: 'PIX', is_paid: true, paid_at: agora, created_by: 'e2e',
  })
  expect(error).toBeNull()

  // O funil: um lead dela, um da outra e um sem dono.
  const f = await db().from('crm_funnels').insert({ tenant_id: rede.tenantId, name: `${PREFIXO} Funil ${marca}`, is_default: true }).select('id').single<{ id: string }>()
  expect(f.error).toBeNull()
  const e = await db().from('crm_stages').insert({ tenant_id: rede.tenantId, funnel_id: f.data!.id, name: 'Primeiro contato', position: 0 }).select('id').single<{ id: string }>()
  expect(e.error).toBeNull()
  for (const [nome, dono] of [['Lead dela', propria.userId], ['Lead da outra', rede.professionalId], ['Lead sem dono', null]] as const) {
    const { data, error: eL } = await db().from('leads').insert({
      tenant_id: rede.tenantId, name: `${PREFIXO} ${nome} ${marca}`, phone: '5548' + String(Date.now() + leads.length).slice(-9),
      crm_stage_id: e.data!.id, owner_id: dono, source: 'Instagram',
    }).select('id').single<{ id: string }>()
    expect(eL).toBeNull()
    leads.push(data!.id)
  }
})
test.afterAll(async () => {
  if (rede) {
    if (leads.length) {
      await db().from('lead_events').delete().in('lead_id', leads)
      await db().from('leads').delete().in('id', leads)
    }
    await db().from('contacts').delete().eq('tenant_id', rede.tenantId)
    await db().from('crm_stages').delete().eq('tenant_id', rede.tenantId)
    await db().from('crm_funnels').delete().eq('tenant_id', rede.tenantId)
    await db().from('crm_quadro_sinais').delete().eq('tenant_id', rede.tenantId)
    await db().from('stock_movements').delete().eq('branch_id', rede.branchId)
    await db().from('financial_transactions').delete().eq('branch_id', rede.branchId)
    await db().from('treatment_plans').delete().eq('branch_id', rede.branchId)
    await db().from('appointments').delete().eq('branch_id', rede.branchId)
  }
  await propria?.limpar(); await gestora?.limpar(); await rede?.limpar()
})

/** O card "Reativar clientes" (o título leva um ✦ junto). */
const reativar = (p: Page) => p.locator('.card').filter({ hasText: 'Sem visita há mais de 90 dias' }).first()

/** O card do dashboard que tem este título. */
const card = (p: Page, titulo: string, qual: 'first' | 'last' = 'first') =>
  p.locator('.card').filter({ has: p.getByText(titulo, { exact: true }) })[qual]()

test('"só os meus": o dashboard da rede mostra a receita DELA, sem custo, lucro, margem nem o dinheiro das outras', async ({ browser }) => {
  await como(browser, propria!, async p => {
    await p.goto('/admin/dashboard?period=month')
    await expect(p.getByRole('heading', { name: 'Visão geral da rede' })).toBeVisible()
    const corpo = p.locator('main')
    await expect.soft(corpo, 'a receita dela').toContainText('R$ 120,00')
    await expect.soft(corpo, 'não a da rede').not.toContainText('R$ 420,00')
    await expect.soft(corpo, 'nem o custo').not.toContainText('777,00')
    await expect.soft(p.getByText('Custo do mês')).toHaveCount(0)
    for (const r of ['Ranking de filiais', 'Ranking — Procedimentos por margem', 'Ocupação por filial']) {
      await expect.soft(p.getByText(r, { exact: true }), r).toHaveCount(0)
    }
    // A evolução é a da receita DELA, sem custo nem lucro.
    const evolucao = p.locator('.card').filter({ hasText: /Evolução —/ }).first()
    await expect.soft(evolucao, 'a evolução da receita dela').toContainText(/Faturamento\s*R\$\s*120,00/)
    await expect.soft(evolucao, 'sem o lucro da rede').not.toContainText('Lucro')
  })
})

test('"só os meus": os rankings, a demografia, o giro, os planos e o funil são os DELA', async ({ browser }) => {
  await como(browser, propria!, async p => {
    await p.goto('/admin/dashboard?period=month')
    await expect(p.getByRole('heading', { name: 'Visão geral da rede' })).toBeVisible()
    const corpo = p.locator('main')
    await expect.soft(corpo, 'o total: as clientes que ela atendeu').toContainText(/unidade · 2 clientes/)
    await expect.soft(card(p, 'Ranking — Procedimentos realizados'), 'o procedimento dela').toContainText(`Proc dr${marca}`)
    await expect.soft(card(p, 'Ranking — Procedimentos realizados'), 'não o da outra').not.toContainText(outroProc)
    await expect.soft(card(p, 'Ranking — Procedimentos por receita bruta'), 'a receita por procedimento dela').toContainText('R$ 120,00')
    await expect.soft(card(p, 'Ranking — Procedimentos por receita bruta')).not.toContainText(outroProc)
    await expect.soft(card(p, 'Ranking — Mais solicitados'), 'só a linha dela').toContainText(nomeDela)
    await expect.soft(card(p, 'Ranking — Mais solicitados')).not.toContainText(nomeDaOutra)
    await expect.soft(card(p, 'Ranking — Vendas'), 'as vendas dela').toContainText('R$ 120,00')
    await expect.soft(card(p, 'Ranking — Vendas')).not.toContainText(nomeDaOutra)
    await expect.soft(card(p, 'Ranking — Valor gasto'), 'as clientes dela').toContainText(`Dela dr${marca}`)
    await expect.soft(card(p, 'Ranking — Valor gasto')).not.toContainText('Da outra')
    await expect.soft(card(p, 'Ranking — Recorrência', 'last'), 'a recorrência das clientes dela').not.toContainText('Da outra')
    await expect.soft(card(p, 'Ranking — Localização'), 'a cidade dela').toContainText(`Cidadela ${marca}`)
    await expect.soft(card(p, 'Ranking — Localização'), 'não a da outra').not.toContainText(`Cidoutra ${marca}`)
    await expect.soft(card(p, 'Faixa etária'), 'a faixa da cliente dela').toContainText('35–44')
    await expect.soft(card(p, 'Faixa etária'), 'não a da outra').not.toContainText('65+')
    await expect.soft(p.getByText('Ranking — Comissão', { exact: true }), 'comissão é de todos').toHaveCount(0)
    await expect.soft(card(p, 'Estoque'), 'o giro dos atendimentos dela').toContainText('R$ 20,00')
    await expect.soft(corpo, 'o plano dela aguardando checkout').toContainText(`Plano dela dr${marca}`)
    await expect.soft(corpo, 'não o da outra').not.toContainText('Plano alheio')
    await expect.soft(corpo, 'o funil: os leads dela e os sem dono').toContainText('de 2 leads convertidos')
  })
})

test('"só os meus": o dashboard da UNIDADE mostra o faturamento DELA nos 6 meses, e os números dela', async ({ browser }) => {
  await como(browser, propria!, async p => {
    await p.goto(`/${slug}/dashboard`)
    await expect(p.getByText('Meus agendamentos hoje')).toBeVisible()
    const main = p.locator('main')
    await expect.soft(p.getByText('Últimos 6 meses'), 'o gráfico do faturamento DELA').toBeVisible()
    await expect.soft(main, 'a receita dela no semestre').toContainText(/▲\s*R\$\s*120 no semestre/)
    await expect.soft(main, 'a receita dela').toContainText(/Faturamento do mês\s*R\$\s*120(?!\d)/)
    await expect.soft(main, 'nem a da unidade no semestre').not.toContainText('R$ 420')
    await expect.soft(card(p, 'Procedimentos mais procurados'), 'o procedimento dela').toContainText(`Proc dr${marca}`)
    await expect.soft(card(p, 'Procedimentos mais procurados')).not.toContainText(outroProc)
    await expect.soft(p.locator('[data-etapa="Novos clientes"]'), 'as novas clientes dela').toContainText(/1$/)
    await expect.soft(p.locator('[data-etapa="Agendamentos"]'), 'os agendamentos dela').toContainText(/1$/)
    await expect.soft(reativar(p), 'a cliente dela a reativar').toContainText('Sumida dela')
    await expect.soft(reativar(p), 'não a da outra').not.toContainText('Sumida da outra')
    await expect.soft(main, 'o plano dela aguardando checkout').toContainText('1 paciente aguardando checkout')
  })
  await como(browser, gestora!, async p => {
    await p.goto(`/${slug}/dashboard`)
    await expect(p.getByText('Últimos 6 meses'), 'controle').toBeVisible()
    await expect(p.locator('main')).toContainText(/Faturamento do mês\s*R\$\s*420/)
    await expect(p.locator('main')).toContainText(/▲\s*R\$\s*420 no semestre/)
    await expect(card(p, 'Procedimentos mais procurados')).toContainText(outroProc)
    await expect(p.locator('[data-etapa="Novos clientes"]')).toContainText(/4$/)
    await expect(reativar(p)).toContainText('Sumida da outra')
    await expect(p.locator('main')).toContainText('2 pacientes aguardando checkout')
  })
})

test('quem tem ALL segue vendo o dinheiro e os números da rede (controle)', async ({ browser }) => {
  await como(browser, gestora!, async p => {
    await p.goto('/admin/dashboard?period=month')
    const corpo = p.locator('main')
    await expect(corpo).toContainText('R$ 420,00')
    await expect(corpo).toContainText('777,00')
    await expect(p.getByText('Custo do mês')).toBeVisible()
    for (const r of ['Ranking de filiais', 'Ranking — Procedimentos por receita bruta', 'Ranking — Procedimentos por margem', 'Ranking — Vendas', 'Ranking — Valor gasto']) {
      await expect(p.getByText(r, { exact: true }).first(), r).toBeVisible()
    }
    await expect(corpo).toContainText(/unidade · 6 clientes/)
    await expect(card(p, 'Ranking — Procedimentos realizados')).toContainText(outroProc)
    await expect(card(p, 'Ranking — Mais solicitados')).toContainText(nomeDaOutra)
    await expect(card(p, 'Ranking — Localização')).toContainText(`Cidoutra ${marca}`)
    await expect(card(p, 'Estoque')).toContainText('R$ 70,00')
    await expect(corpo).toContainText('Plano alheio')
    await expect(corpo).toContainText('de 3 leads convertidos')
  })
})
