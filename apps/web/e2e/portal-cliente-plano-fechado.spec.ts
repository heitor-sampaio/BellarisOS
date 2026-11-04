import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { clienteComSessao, type ClienteDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * A45 da 6ª simulação (2026-11-04): o cartão do plano FECHADO no app não
 * abria — "Plano de tratamento · Ativo" e os nomes de dois procedimentos, sem
 * as sessões feitas e as que faltam, nem o pago e o a pagar. A Paula não sabia
 * quanto ainda devia nem quantas sessões tinha. Agora o cartão abre: cada
 * sessão com a situação (feita, agendada, a agendar) e o dinheiro de
 * `getFinanceiroDoPlano` (lib/metrics: o pago pela regra única de receita).
 * Numa rede [e2e] própria.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let cliente: ClienteDeTeste | null = null
let slug = ''
let plano = ''
const agendamentos: string[] = []
const lancamentos: string[] = []

async function como(browser: Browser, quem: ClienteDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: quem.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

async function agendamento(status: string, quando: Date) {
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: cliente!.clientId, procedure_id: rede!.procedureId, professional_id: rede!.professionalId,
    scheduled_at: quando.toISOString(), duration_min: 60, price: 0, status,
    ...(status === 'COMPLETED' ? { completed_at: quando.toISOString() } : {}),
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  agendamentos.push(data!.id)
  return data!.id
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`pf${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  cliente = await clienteComSessao(`pfc${marca}`, { id: rede.branchId, slug }, { tenant: rede.tenantId })
  const { data: pl, error: ePl } = await db().from('treatment_plans').insert({
    branch_id: rede.branchId, client_id: cliente.clientId, professional_id: rede.professionalId,
    status: 'ACCEPTED', name: `[e2e] Plano fechado ${marca}`, aceito_em: new Date().toISOString(),
  }).select('id').single<{ id: string }>()
  expect(ePl).toBeNull()
  plano = pl!.id
  const feita = await agendamento('COMPLETED', new Date('2026-10-28T13:00:00Z'))
  const agendada = await agendamento('SCHEDULED', new Date(Date.now() + 7 * 86_400_000))
  const { data: sessoes, error: eS } = await db().from('treatment_plan_sessions').insert([
    { plan_id: plano, sort_order: 0, appointment_id: feita },
    { plan_id: plano, sort_order: 1, appointment_id: agendada },
    { plan_id: plano, sort_order: 2 },
  ]).select('id, sort_order')
  expect(eS).toBeNull()
  expect((await db().from('treatment_plan_session_procedures').insert(
    sessoes!.map(s => ({ session_id: s.id, procedure_id: rede!.procedureId, price: 300 })),
  )).error).toBeNull()
  const { data: txs, error: eTx } = await db().from('financial_transactions').insert([
    { branch_id: rede.branchId, client_id: cliente.clientId, treatment_plan_id: plano, type: 'INCOME', category: 'Procedimento',
      description: 'Plano de tratamento — entrada', amount: 500, is_paid: true, paid_at: new Date().toISOString(), payment_method: 'PIX', created_by: 'e2e' },
    { branch_id: rede.branchId, client_id: cliente.clientId, treatment_plan_id: plano, type: 'INCOME', category: 'Procedimento',
      description: 'Plano de tratamento — parcela 1/1', amount: 400, is_paid: false, due_date: '2026-12-04', created_by: 'e2e' },
  ]).select('id')
  expect(eTx).toBeNull()
  lancamentos.push(...txs!.map(t => t.id as string))
})
test.afterAll(async () => {
  if (lancamentos.length) await db().from('financial_transactions').delete().in('id', lancamentos)
  if (plano) await db().from('treatment_plans').delete().eq('id', plano)
  if (agendamentos.length) {
    await db().from('appointment_history').delete().in('appointment_id', agendamentos)
    await db().from('appointments').delete().in('id', agendamentos)
  }
  await cliente?.limpar(); await rede?.limpar()
})

test('A45: o cartão do plano fechado abre — as sessões feitas e as que faltam, o pago e o a pagar', async ({ browser }) => {
  await como(browser, cliente!, async p => {
    await p.goto(`/${slug}/cliente/home`)
    const cartao = p.locator('[data-plano-fechado]')
    await expect(cartao).toContainText('1 de 3 sessões feitas')
    await cartao.getByText('Plano de tratamento', { exact: false }).first().click()
    const detalhe = cartao.locator('[data-plano-detalhe]')
    await expect(detalhe).toBeVisible()
    await expect(detalhe).toContainText('Sessão 1')
    await expect(detalhe).toContainText('Feita em 28/10')
    await expect(detalhe).toContainText('Sessão 2')
    await expect(detalhe).toContainText('Agendada')
    await expect(detalhe).toContainText('Sessão 3')
    await expect(detalhe).toContainText('A agendar')
    await expect(detalhe).toContainText('Pago R$ 500,00')
    await expect(detalhe).toContainText('A pagar R$ 400,00')
    await expect(detalhe).toContainText('04/12/2026')
  })
})
