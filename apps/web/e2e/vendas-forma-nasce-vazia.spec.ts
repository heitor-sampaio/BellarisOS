import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'

/**
 * A37 da 6ª simulação: o Pix era o padrão CALADO em toda tela de cobrança, e
 * o `?receber=1` abre a janela do pagamento sozinha — um clique gravou o
 * peeling do Jorge no Pix, que ele pagou no cartão (e virou um estorno). A
 * forma nasce VAZIA e é obrigatória (princípio 3): nada se confirma sem ela.
 *
 * As telas: o "Confirmar pagamento" do atendimento (e o `?receber=1`), o
 * "Receber" do plano no check-in, o checkout do plano e o "Vender" da ficha
 * (`CamposDoPagamento`: pacote, pré-pago, produto e o pagamento do contrato).
 *
 * Numa rede [e2e] própria.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let caixa: MembroDeTeste | null = null
let slug = ''

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: caixa!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`fnv${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  expect((await db().from('procedures').update({ price: 280 }).eq('id', rede.procedureId)).error).toBeNull()
  caixa = await criarMembro(`fnvc${marca}`, {
    tenant: rede.tenantId, rotulo: 'Recepção e caixa',
    permissoes: [
      { modulo: 'cashier', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'agenda', nivel: 'MANAGE' },
      { modulo: 'medical_records', nivel: 'MANAGE' }, { modulo: 'documents', nivel: 'MANAGE' }, { modulo: 'procedures', nivel: 'VIEW' },
    ],
  })
})

test.afterAll(async () => {
  const falhas: string[] = []
  if (rede) {
    const b = db()
    for (const [o, q] of [
      ['comissão', b.from('commission_lines').delete().eq('tenant_id', rede.tenantId)],
      ['lançamentos', b.from('financial_transactions').delete().eq('branch_id', rede.branchId)],
    ] as const) {
      const { error } = await q
      if (error) falhas.push(`${o}: ${error.message}`)
    }
  }
  await caixa?.limpar()
  await rede?.limpar()
  expect(falhas).toEqual([])
})

test('o "Confirmar pagamento" que o ?receber=1 abre não tem forma: nada se confirma sem escolher', async ({ browser }) => {
  const c = await rede!.criarCliente('Jorge')
  const agora = new Date().toISOString()
  const { data: ap, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: c, procedure_id: rede!.procedureId, professional_id: rede!.professionalId,
    status: 'COMPLETED', source: 'INTERNAL', duration_min: 30, price: 280, scheduled_at: agora, completed_at: agora,
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  await como(browser, async p => {
    await p.goto(`/${slug}/agenda/${ap!.id}?receber=1`)
    const dlg = p.getByRole('dialog', { name: 'Confirmar pagamento' })
    await expect(dlg).toBeVisible()
    await expect(dlg.getByLabel('Forma de pagamento')).toHaveValue('')
    await expect(dlg.getByRole('button', { name: /Confirmar/ })).toBeDisabled()
  })
  expect((await db().from('financial_transactions').select('id').eq('appointment_id', ap!.id)).data, 'nada foi gravado').toEqual([])
})

test('o checkout do plano e o "Vender" da ficha: a forma nasce vazia e o botão espera', async ({ browser }) => {
  const c = await rede!.criarCliente('Paula')
  const { data: pl, error } = await db().from('treatment_plans').insert({
    branch_id: rede!.branchId, professional_id: rede!.professionalId, client_id: c, status: 'PROPOSED', name: `${PREFIXO} Plano ${marca}`,
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  const { data: s } = await db().from('treatment_plan_sessions').insert({ plan_id: pl!.id, sort_order: 0 }).select('id').single<{ id: string }>()
  expect((await db().from('treatment_plan_session_procedures').insert({ session_id: s!.id, procedure_id: rede!.procedureId, price: 280 })).error).toBeNull()
  await como(browser, async p => {
    await p.goto(`/admin/checkout/${pl!.id}`)
    await p.getByRole('button', { name: 'Confirmar plano' }).click()
    await p.getByRole('button', { name: 'À vista', exact: true }).click()
    // Nenhum meio escolhido: nenhum botão de meio marcado, e seguir é recusado.
    await expect(p.locator('[data-meio-do-checkout][aria-pressed="true"]')).toHaveCount(0)
    await expect(p.getByRole('button', { name: 'Ir para a documentação' })).toBeDisabled()
    await p.getByRole('button', { name: 'Pix', exact: true }).click()
    await expect(p.getByRole('button', { name: 'Ir para a documentação' })).toBeEnabled()

    // O "Vender" da ficha (procedimento pré-pago): a forma nasce vazia.
    await p.goto(`/admin/clients/${c}`)
    await p.getByRole('button', { name: 'Vender', exact: true }).click()
    const dlg = p.getByRole('dialog', { name: 'Vender' })
    await dlg.getByLabel('Procedimento', { exact: true }).selectOption(rede!.procedureId)
    await expect(dlg.getByLabel('Meio de pagamento')).toHaveValue('')
    await expect(dlg.getByRole('button', { name: /Vender por/ })).toBeDisabled()
  })
  expect((await db().from('treatment_plans').select('status').eq('id', pl!.id).single()).data?.status).toBe('PROPOSED')
})

test('o "Receber" do plano no check-in: a forma nasce vazia', async ({ browser }) => {
  const c = await rede!.criarCliente('Márcia')
  const { data: pl, error } = await db().from('treatment_plans').insert({
    branch_id: rede!.branchId, professional_id: rede!.professionalId, client_id: c, status: 'ACCEPTED', name: `${PREFIXO} Plano aceito ${marca}`,
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  expect((await db().from('financial_transactions').insert({
    branch_id: rede!.branchId, client_id: c, treatment_plan_id: pl!.id, type: 'INCOME', category: 'Serviços',
    description: 'Plano de tratamento', amount: 280, is_paid: false, created_by: 'e2e',
  })).error).toBeNull()
  const { data: ap } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: c, procedure_id: rede!.procedureId, professional_id: rede!.professionalId,
    status: 'ARRIVED', source: 'INTERNAL', duration_min: 30, price: 280, scheduled_at: new Date().toISOString(), treatment_plan_id: pl!.id,
  }).select('id').single<{ id: string }>()
  await como(browser, async p => {
    await p.goto(`/${slug}/agenda/${ap!.id}`)
    await p.getByRole('button', { name: /Receber R\$/ }).click()
    const dlg = p.getByRole('dialog', { name: 'Receber o plano de tratamento' })
    await expect(dlg.getByLabel('Forma de pagamento')).toHaveValue('')
    await expect(dlg.getByRole('button', { name: 'Confirmar recebimento' })).toBeDisabled()
  })
})
