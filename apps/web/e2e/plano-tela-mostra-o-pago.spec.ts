import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { apagarAgendamentos } from './apoio/limpeza'

/**
 * J-42 (ajustes J, 2026-10-30): a tela do plano fechado não mostrava a
 * entrada paga, as parcelas nem as sessões feitas — só "Plano aceito. O que
 * estiver em aberto é recebido no check-in do atendimento", que engana: o
 * check-in só cobra o que VENCEU, e a parcela de daqui a um mês se recebe no
 * financeiro (vendas-financeiro.md, "O check-in só cobra o que VENCEU").
 *
 * Agora o plano fechado mostra o valor, o recebido e o a receber
 * (`metrics_financeiro_do_plano`, contados no banco), cada lançamento —
 * entrada e parcelas, com vencimento e situação — e as sessões feitas.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let membro: MembroDeTeste | null = null
let slug = ''
let plano = ''

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: membro!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

const emDias = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString()

test.beforeAll(async () => {
  test.setTimeout(180_000)
  rede = await criarOutraRede(`ptp${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  membro = await criarMembro(`ptpm${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Recepção',
    permissoes: [
      { modulo: 'agenda', nivel: 'MANAGE' },
      { modulo: 'clients', nivel: 'VIEW' },
      { modulo: 'cashier', nivel: 'MANAGE' },
    ],
  })
  const cliente = await rede.criarCliente('Plano pago')
  const { data: pl, error } = await db().from('treatment_plans').insert({
    branch_id: rede.branchId, professional_id: rede.professionalId, client_id: cliente,
    status: 'ACCEPTED', name: `[e2e] Plano parcelado ${marca}`,
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  plano = pl!.id
  const { data: sessoes, error: eS } = await db().from('treatment_plan_sessions')
    .insert([0, 1, 2].map(i => ({ plan_id: plano, sort_order: i }))).select('id, sort_order')
  expect(eS).toBeNull()
  const ordenadas = (sessoes ?? []).sort((a, b) => a.sort_order - b.sort_order)
  expect((await db().from('treatment_plan_session_procedures').insert(
    ordenadas.map(s => ({ session_id: s.id, procedure_id: rede!.procedureId, price: 300 })))).error).toBeNull()
  // A 1ª sessão já foi feita; a 2ª está agendada.
  const base = { branch_id: rede.branchId, client_id: cliente, procedure_id: rede.procedureId, professional_id: rede.professionalId,
    source: 'INTERNAL', duration_min: 30, price: 300, treatment_plan_id: plano }
  const { data: ags, error: eA } = await db().from('appointments').insert([
    { ...base, status: 'COMPLETED', scheduled_at: emDias(-3), completed_at: emDias(-3) },
    { ...base, status: 'SCHEDULED', scheduled_at: emDias(7) },
  ]).select('id, status')
  expect(eA).toBeNull()
  const feito = ags!.find(a => a.status === 'COMPLETED')!.id
  const agendado = ags!.find(a => a.status === 'SCHEDULED')!.id
  expect((await db().from('treatment_plan_sessions').update({ appointment_id: feito }).eq('id', ordenadas[0]!.id)).error).toBeNull()
  expect((await db().from('treatment_plan_sessions').update({ appointment_id: agendado }).eq('id', ordenadas[1]!.id)).error).toBeNull()
  // Entrada paga + 2 parcelas a vencer.
  const grupo = crypto.randomUUID()
  const lanc = { branch_id: rede.branchId, client_id: cliente, treatment_plan_id: plano, type: 'INCOME', category: 'Serviços', created_by: 'e2e' }
  expect((await db().from('financial_transactions').insert([
    { ...lanc, description: `[e2e] Plano — entrada`, amount: 300, is_paid: true, paid_at: emDias(-3), payment_method: 'PIX' },
    { ...lanc, description: `[e2e] Plano — parcela 2/3`, amount: 300, is_paid: false, due_date: emDias(27), parcela_numero: 2, parcela_total: 3, parcela_grupo: grupo },
    { ...lanc, description: `[e2e] Plano — parcela 3/3`, amount: 300, is_paid: false, due_date: emDias(57), parcela_numero: 3, parcela_total: 3, parcela_grupo: grupo },
  ])).error).toBeNull()
})

test.afterAll(async () => {
  if (rede) {
    const { data: ags } = await db().from('appointments').select('id').eq('branch_id', rede.branchId)
    const falhas = await apagarAgendamentos((ags ?? []).map(a => a.id as string))
    expect(falhas).toEqual([])
  }
  await membro?.limpar()
  await rede?.limpar()
})

test('o plano fechado mostra o recebido, as parcelas e as sessões feitas — e não promete cobrar tudo no check-in', async ({ browser }) => {
  await como(browser, async p => {
    await p.goto(`/${slug}/planejamentos/${plano}`)
    const resumo = p.locator('[data-resumo-do-plano]')
    await expect(resumo).toBeVisible()
    await expect(resumo.locator('[data-plano-valor]')).toHaveText('R$ 900,00')
    await expect(resumo.locator('[data-plano-recebido]')).toHaveText('R$ 300,00')
    await expect(resumo.locator('[data-plano-a-receber]')).toHaveText('R$ 600,00')
    await expect(resumo.locator('[data-plano-sessoes]')).toContainText('1 de 3 sessões feitas')
    await expect(resumo.locator('[data-plano-sessoes]')).toContainText('1 agendada')
    const linhas = resumo.locator('[data-lancamento-do-plano]')
    await expect(linhas).toHaveCount(3)
    await expect(linhas.nth(0)).toContainText('Entrada')
    await expect(linhas.nth(0)).toContainText('Pago')
    await expect(linhas.nth(1)).toContainText('Parcela 2/3')
    await expect(linhas.nth(1)).toContainText('A vencer')
    await expect(p.getByText('O que estiver em aberto é recebido no check-in')).toHaveCount(0)
  })
})
