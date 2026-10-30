import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste, type Permissao } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * Cada número segue o escopo do SEU módulo (decisão do Heitor, 2026-10-29):
 * a agenda e as clientes seguem o escopo da agenda; o dinheiro, o do
 * financeiro; o funil, o do CRM. "Com a agenda ALL e o financeiro OWN, os
 * atendimentos são os da clínica e o faturamento é o dela." Até aqui QUALQUER
 * "só os meus" (agenda OU financeiro) recortava todos os números do dashboard,
 * dos Relatórios e do Copilot.
 *
 * Numa rede `[e2e]` própria, três atendimentos concluídos e pagos agora:
 *   - o da Fernanda (financeiro "só os meus", agenda de todos): R$ 120;
 *   - o da Agnes (agenda "só os meus", financeiro de todos): R$ 50;
 *   - o da outra profissional: R$ 300.
 * A clínica: 3 atendimentos, R$ 470.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let fernanda: MembroDeTeste | null = null
let agnes: MembroDeTeste | null = null
let slug = ''
const agora = new Date().toISOString()
test.describe.configure({ timeout: 120_000 })

async function como(browser: Browser, quem: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: quem.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

async function atendidoEPago(rotulo: string, professionalId: string, valor: number) {
  const c = await rede!.criarCliente(rotulo)
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: c, procedure_id: rede!.procedureId, professional_id: professionalId,
    status: 'COMPLETED', source: 'INTERNAL', duration_min: 30, price: valor, scheduled_at: agora, completed_at: agora,
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  const { error: eT } = await db().from('financial_transactions').insert({
    branch_id: rede!.branchId, client_id: c, appointment_id: data!.id, type: 'INCOME', category: 'Serviços',
    description: `[e2e] pago ${valor} ${marca}`, amount: valor, payment_method: 'PIX', is_paid: true, paid_at: agora, created_by: 'e2e',
  })
  expect(eT).toBeNull()
}

const ABAS = ['overview', 'agenda', 'clientes'] as const

async function membro(rotulo: string, agenda: 'OWN' | 'ALL', financeiro: 'OWN' | 'ALL') {
  const permissoes: Permissao[] = [
    { modulo: 'agenda', nivel: 'VIEW', escopo: agenda },
    { modulo: 'financial', nivel: 'VIEW', escopo: financeiro },
    { modulo: 'clients', nivel: 'VIEW' },
    { modulo: 'procedures', nivel: 'VIEW' },
    { modulo: 'reports', nivel: 'VIEW' },
  ]
  const m = await criarMembro(`${rotulo}${marca}`, { tenant: rede!.tenantId, rotulo, permissoes })
  expect((await db().from('users').update({ provides_services: true }).eq('id', m.userId)).error).toBeNull()
  const { error } = await db().from('role_report_tabs').insert(ABAS.map(tab => ({ tenant_id: rede!.tenantId, role_id: m.roleId, tab })))
  expect(error).toBeNull()
  return m
}

test.beforeAll(async () => {
  test.setTimeout(240_000)
  rede = await criarOutraRede(`cn${marca}`)
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  expect((await db().from('users').update({ branch_id: rede.branchId, provides_services: true }).eq('id', rede.professionalId)).error).toBeNull()
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug

  fernanda = await membro('Fernanda', 'ALL', 'OWN')
  agnes = await membro('Agnes', 'OWN', 'ALL')

  await atendidoEPago('Cliente da Fernanda', fernanda.userId, 120)
  await atendidoEPago('Cliente da Agnes', agnes.userId, 50)
  await atendidoEPago('Cliente da outra', rede.professionalId, 300)
})

test.afterAll(async () => {
  if (rede) {
    await db().from('financial_transactions').delete().eq('branch_id', rede.branchId)
    await db().from('appointments').delete().eq('branch_id', rede.branchId)
  }
  for (const m of [fernanda, agnes]) if (m) await db().from('role_report_tabs').delete().eq('role_id', m.roleId)
  await fernanda?.limpar(); await agnes?.limpar(); await rede?.limpar()
})

/** O card do dashboard (ou dos Relatórios) que tem este rótulo. */
const card = (p: Page, rotulo: string) =>
  p.locator('.card').filter({ has: p.getByText(rotulo, { exact: true }) }).first()
const dinheiro = (t: string) => Number((/R\$\s*([\d.]+(?:,\d{2})?)/.exec(t)?.[1] ?? 'NaN').replace(/\./g, '').replace(',', '.'))

test.describe('agenda de todos, financeiro "só os meus" (a Fernanda)', () => {
  test('dashboard da unidade: os agendamentos são os da clínica; o faturamento e o ticket são os dela', async ({ browser }) => {
    await como(browser, fernanda!, async p => {
      await p.goto(`/${slug}/dashboard`)
      const main = p.locator('main')
      await expect(main).toContainText(/Faturamento do mês\s*R\$\s*120(?!\d)/)
      await expect.soft(p.getByText('Agendamentos hoje', { exact: true }), 'a agenda é a da clínica').toBeVisible()
      await expect.soft(card(p, 'Agendamentos hoje')).toContainText(/hoje\s*3\s*\d+ aguardando/i)
      await expect.soft(p.getByText('Taxa de ocupação', { exact: true }), 'a ocupação da unidade aparece').toBeVisible()
      await expect.soft(p.locator('[data-etapa="Agendamentos"]'), 'Clientes no mês: os da clínica').toContainText(/3$/)
      await expect.soft(p.getByText('Meu faturamento', { exact: true }), 'o gráfico é o dinheiro dela').toBeVisible()
      await expect.poll(async () => dinheiro(await card(p, 'Ticket médio').innerText()), { timeout: 10_000 }).toBe(120)
    })
  })

  test('dashboard da rede: "Minha receita" R$ 120 e os atendimentos da clínica (3), com a ocupação por filial', async ({ browser }) => {
    await como(browser, fernanda!, async p => {
      await p.goto('/admin/dashboard?period=month')
      await expect(p.getByRole('heading', { name: /^Visão geral/ })).toBeVisible()
      await expect(card(p, 'Minha receita do mês')).toContainText(/R\$\s*120/)
      await expect.soft(card(p, 'Atendimentos')).toContainText(/atendimentos\s*3\s*concluídos/i)
      await expect.soft(p.getByText('Ocupação', { exact: true }), 'a ocupação é da agenda: de todos').toBeVisible()
      await expect.soft(p.getByText('Custo do mês'), 'o custo não se atribui a ela').toHaveCount(0)
    })
  })

  test('Relatórios → Visão geral: o faturamento dela (R$ 120) e os atendimentos da clínica (3)', async ({ browser }) => {
    await como(browser, fernanda!, async p => {
      await p.goto('/admin/reports?tab=overview&period=month')
      await expect.poll(async () => dinheiro(await card(p, 'Faturamento').innerText()), { timeout: 10_000 }).toBe(120)
      await expect.poll(async () => (await card(p, 'Atendimentos').innerText()).match(/\d+/)?.[0], { timeout: 10_000 }).toBe('3')
      await expect(p.getByText('Despesas', { exact: true })).toHaveCount(0)
    })
  })
})

test.describe('agenda "só os meus", financeiro de todos (a Agnes)', () => {
  test('dashboard da unidade: os agendamentos são os dela (1); o faturamento é o da clínica (R$ 470)', async ({ browser }) => {
    await como(browser, agnes!, async p => {
      await p.goto(`/${slug}/dashboard`)
      const main = p.locator('main')
      await expect(main).toContainText(/Faturamento do mês\s*R\$\s*470(?!\d)/)
      await expect.soft(card(p, 'Meus agendamentos hoje')).toContainText(/hoje\s*1\s*\d+ aguardando/i)
      await expect.soft(p.locator('[data-etapa="Agendamentos"]'), 'Clientes no mês: os dela').toContainText(/1$/)
      await expect.soft(p.getByText('Faturamento', { exact: true }), 'o gráfico é o da clínica').toBeVisible()
      // R$ 470 ÷ 3 clientes que pagaram.
      await expect.poll(async () => dinheiro(await card(p, 'Ticket médio').innerText()), { timeout: 10_000 }).toBeCloseTo(156.67, 0)
    })
  })

  test('dashboard da rede: a receita da clínica (R$ 470) com o custo; os atendimentos dela (1), sem a ocupação por filial', async ({ browser }) => {
    await como(browser, agnes!, async p => {
      await p.goto('/admin/dashboard?period=month')
      await expect(p.getByRole('heading', { name: /^Visão geral/ })).toBeVisible()
      await expect(card(p, 'Receita bruta do mês')).toContainText(/R\$\s*470/)
      await expect.soft(p.getByText('Custo do mês'), 'o financeiro é de todos').toBeVisible()
      await expect.soft(card(p, 'Atendimentos')).toContainText(/atendimentos\s*1\s*concluídos/i)
      await expect.soft(p.getByText('Ocupação', { exact: true }), 'a ocupação é da agenda: só a dela').toHaveCount(0)
    })
  })

  test('Relatórios → Visão geral: o faturamento da clínica (R$ 470), os atendimentos dela (1) e a despesa', async ({ browser }) => {
    await como(browser, agnes!, async p => {
      await p.goto('/admin/reports?tab=overview&period=month')
      await expect.poll(async () => dinheiro(await card(p, 'Faturamento').innerText()), { timeout: 10_000 }).toBe(470)
      await expect.poll(async () => (await card(p, 'Atendimentos').innerText()).match(/\d+/)?.[0], { timeout: 10_000 }).toBe('1')
      await expect(p.getByText('Despesas', { exact: true })).toBeVisible()
    })
  })
})
