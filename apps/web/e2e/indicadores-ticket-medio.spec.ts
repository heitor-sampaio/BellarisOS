import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * O ticket médio é dos atendimentos COBRADOS, e o gasto da cliente é UMA
 * conta (simulação de 2026-10-27, decisões do Heitor).
 *
 * A simulação achou "Ticket médio R$ 90" numa clínica que só tinha limpezas
 * de R$ 180: a avaliação de R$ 0 entrava no denominador. E a ficha da
 * Mariana dizia "ticket médio R$ 0,00" ao lado de "LTV R$ 600", enquanto
 * Relatórios → Clientes dizia "Gasto médio R$ 390" (A26) — cada número de uma
 * conta.
 *
 * Agora: ticket = receita de serviço ÷ concluídos com preço > 0, em toda tela;
 * sem atendimento cobrado, "—". O gasto de cada cliente (o que pagou, a
 * receita de serviço, os cobrados) sai de metrics_gasto_por_cliente — a ficha
 * e os relatórios.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let gestor: MembroDeTeste | null = null
let slug = ''
let limpeza = ''
const cli: Record<string, string> = {}
const agendamentos: string[] = []
const agora = new Date().toISOString()

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: gestor!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}
const brl = (t: string) => Number((/R\$\s*(-?[\d.]+,\d{2})/.exec(t)?.[1] ?? 'NaN').replace(/\./g, '').replace(',', '.'))

async function concluido(cliente: string, procedimento: string, preco: number) {
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: cliente, procedure_id: procedimento, professional_id: rede!.professionalId,
    status: 'COMPLETED', source: 'INTERNAL', duration_min: 30, price: preco, scheduled_at: agora, completed_at: agora,
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  agendamentos.push(data!.id)
  return data!.id
}
async function pago(cliente: string, valor: number, agendamento: string | null) {
  const { error } = await db().from('financial_transactions').insert({
    branch_id: rede!.branchId, client_id: cliente, appointment_id: agendamento, type: 'INCOME', category: 'Serviços',
    description: `[e2e] pago ${valor} ${marca}`, amount: valor, payment_method: 'PIX', is_paid: true, paid_at: agora, created_by: 'e2e',
  })
  expect(error).toBeNull()
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`tk${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  const { data: pr, error } = await db().from('procedures')
    .insert({ tenant_id: rede.tenantId, name: `[e2e] Limpeza ${marca}`, category: 'e2e', duration_min: 30, price: 180 })
    .select('id').single<{ id: string }>()
  expect(error).toBeNull()
  limpeza = pr!.id
  gestor = await criarMembro(`tkg${marca}`, {
    tenant: rede.tenantId, rotulo: 'Gestora',
    permissoes: [{ modulo: 'clients', nivel: 'VIEW' }, { modulo: 'financial', nivel: 'VIEW' }, { modulo: 'reports', nivel: 'VIEW' }],
  })
  const { error: eA } = await db().from('role_report_tabs').insert([
    { tenant_id: rede.tenantId, role_id: gestor.roleId, tab: 'overview' },
    { tenant_id: rede.tenantId, role_id: gestor.roleId, tab: 'clientes' },
  ])
  expect(eA).toBeNull()

  // Joana: a limpeza de R$ 180, paga. Mariana: a avaliação de R$ 0 e R$ 600
  // pagos sem atendimento (o pacote). Sofia: só a avaliação de R$ 0.
  cli.joana = await rede.criarCliente('Joana')
  cli.mariana = await rede.criarCliente('Mariana')
  cli.sofia = await rede.criarCliente('Sofia')
  await pago(cli.joana, 180, await concluido(cli.joana, limpeza, 180))
  await concluido(cli.mariana, rede.procedureId, 0)
  await pago(cli.mariana, 600, null)
  await concluido(cli.sofia, rede.procedureId, 0)
})
test.afterAll(async () => {
  await db().from('financial_transactions').delete().eq('branch_id', rede!.branchId)
  await gestor?.limpar(); await rede?.limpar()
})

test.describe.serial('o ticket médio e o gasto da cliente', () => {
  test('o núcleo conta os atendimentos COBRADOS', async () => {
    const de = new Date(Date.now() - 86_400_000).toISOString(), ate = new Date(Date.now() + 86_400_000).toISOString()
    const { data, error } = await db().rpc('metrics_core', {
      p_tenant: rede!.tenantId, p_branch_ids: null, p_from: de, p_to: ate, p_professional_id: null,
    })
    expect(error).toBeNull()
    const r = data![0]!
    expect([Number(r.service_revenue), Number(r.appointments_completed), Number(r.appointments_charged)]).toEqual([180, 3, 1])
  })

  test('o ticket da tela é R$ 180 (não R$ 60): o de R$ 0 não puxa a média', async ({ browser }) => {
    await como(browser, async p => {
      await p.goto('/admin/reports?period=month')
      const cartao = p.getByText('Ticket Médio', { exact: true }).first().locator('xpath=ancestor::div[contains(@class,"card")][1]')
      await expect.poll(async () => brl(await cartao.innerText()), { timeout: 10_000 }).toBe(180)

      await p.goto(`/${slug}/financeiro`)
      const doFinanceiro = p.getByText('Ticket médio', { exact: true }).first().locator('xpath=ancestor::div[contains(@class,"card")][1]')
      await expect(doFinanceiro).toContainText('180,00')
    })
  })

  test('A26: a ficha e os relatórios saem da mesma conta do gasto da cliente', async ({ browser }) => {
    await como(browser, async p => {
      // Mariana: pagou R$ 600, nenhum atendimento cobrado — ticket "—", não R$ 0,00.
      await p.goto(`/${slug}/clients/${cli.mariana}`)
      const ticket = p.getByText('TICKET MÉDIO', { exact: true }).locator('xpath=ancestor::div[contains(@class,"card")][1]')
      await expect(ticket).toContainText('—')
      await expect(ticket).not.toContainText('R$')
      await expect(p.getByText('INVESTIDO TOTAL — LTV').locator('xpath=ancestor::div[contains(@class,"card")][1]')).toContainText('600,00')

      // Joana: R$ 180 num atendimento de R$ 180.
      await p.goto(`/${slug}/clients/${cli.joana}`)
      await expect(p.getByText('TICKET MÉDIO', { exact: true }).locator('xpath=ancestor::div[contains(@class,"card")][1]')).toContainText('180,00')

      // Gasto médio: (180 + 600) ÷ as 2 que pagaram — o mesmo "pago" da ficha.
      await p.goto('/admin/reports?period=month&tab=clientes')
      const gasto = p.getByText('Gasto Médio', { exact: true }).first().locator('xpath=ancestor::div[contains(@class,"card")][1]')
      await expect.poll(async () => brl(await gasto.innerText()), { timeout: 10_000 }).toBe(390)
    })
    // A conta única, pelo banco: a mesma função, a cliente e a janela inteira.
    const { data, error } = await db().rpc('metrics_gasto_por_cliente', {
      p_tenant: rede!.tenantId, p_branch_ids: null, p_from: '2000-01-01T00:00:00Z', p_to: 'infinity', p_cliente: cli.mariana,
    })
    expect(error).toBeNull()
    expect(data).toEqual([expect.objectContaining({ pago: 600, receita_servico: 0, atendimentos: 1, atendimentos_cobrados: 0 })])
  })
})
