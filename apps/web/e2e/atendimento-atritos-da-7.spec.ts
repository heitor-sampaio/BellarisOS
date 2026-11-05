import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { responderAnamnese } from './apoio/anamnese'

/**
 * Os atritos do atendimento da 7ª simulação (2026-11-05), da F32:
 * - A33: depois de enviar o plano, a avaliação seguia "Em atendimento" e nada
 *   dizia à profissional que falta o "Finalizar" (gerar o plano não conclui a
 *   avaliação — a regra fica; a tela passa a dizer).
 * - A34: a tela do plano não dizia que o desconto é dado no checkout.
 * - A37: a drenagem avulsa abria o formulário da avaliação ("Dores do
 *   cliente", "Tratamento / Nova sessão") sem dizer que o plano é opcional.
 * - A38: a busca de insumo numa rede sem produtos voltava vazia, calada.
 * - A39: a profissional sem o Financeiro (e sem receber) via "Plano · R$ 2.672
 *   a vencer"; o saldo do plano é de quem recebe (decidido pelo princípio 3).
 *
 * Numa rede [e2e] própria.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let slug = ''
let profissional: MembroDeTeste | null = null
let recepcao: MembroDeTeste | null = null

async function como(browser: Browser, quem: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: quem.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

/** Um atendimento em curso da profissional, com a ficha de saúde respondida. */
async function emCurso(rotulo: string, extra: Record<string, unknown> = {}) {
  const cliente = await rede!.criarCliente(rotulo)
  await responderAnamnese(cliente, rede!.tenantId)
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: cliente, procedure_id: rede!.procedureId, professional_id: profissional!.userId,
    status: 'IN_PROGRESS', source: 'INTERNAL', duration_min: 30, price: 0,
    scheduled_at: new Date(Date.now() - 30 * 60_000).toISOString(), started_at: new Date(Date.now() - 20 * 60_000).toISOString(),
    ...extra,
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  return { id: data!.id, cliente }
}

test.beforeAll(async () => {
  test.setTimeout(150_000)
  rede = await criarOutraRede(`at7${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  profissional = await criarMembro(`at7p${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Profissional',
    permissoes: [
      { modulo: 'agenda', nivel: 'MANAGE', escopo: 'OWN' },
      { modulo: 'clients', nivel: 'VIEW' },
      { modulo: 'medical_records', nivel: 'MANAGE', escopo: 'OWN' },
    ],
  })
  expect((await db().from('users').update({ provides_services: true }).eq('id', profissional.userId)).error).toBeNull()
  recepcao = await criarMembro(`at7r${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Recepção',
    permissoes: [
      { modulo: 'agenda', nivel: 'MANAGE' },
      { modulo: 'clients', nivel: 'VIEW' },
      { modulo: 'cashier', nivel: 'MANAGE' },
    ],
  })
})

test.afterAll(async () => {
  if (rede) {
    await db().from('financial_transactions').delete().eq('branch_id', rede.branchId)
    await db().from('appointments').delete().eq('branch_id', rede.branchId)
  }
  await profissional?.limpar(); await recepcao?.limpar(); await rede?.limpar()
})

test('A33: com o plano enviado e a avaliação em curso, a tela diz que falta finalizar', async ({ browser }) => {
  const { id, cliente } = await emCurso('Plano enviado')
  const plano = await db().from('treatment_plans').insert({
    branch_id: rede!.branchId, professional_id: profissional!.userId, client_id: cliente, status: 'PROPOSED',
    name: `[e2e] Plano ${marca}`, evaluation_appointment_id: id,
  }).select('id').single<{ id: string }>()
  expect(plano.error).toBeNull()
  await como(browser, profissional!, async p => {
    await p.goto(`/${slug}/agenda/${id}`)
    const aviso = p.locator('[data-falta-finalizar]')
    await expect(aviso).toContainText('Falta finalizar a avaliação')
    await expect(aviso).toContainText('Finalizar atendimento')
  })
  // Concluída, o aviso some.
  expect((await db().from('appointments').update({ status: 'COMPLETED', completed_at: new Date().toISOString() }).eq('id', id)).error).toBeNull()
  await como(browser, profissional!, async p => {
    await p.goto(`/${slug}/agenda/${id}`)
    await expect(p.getByText('Registro bloqueado para edição')).toBeVisible()
    await expect(p.locator('[data-falta-finalizar]')).toHaveCount(0)
  })
})

test('A34 e A37: o plano é opcional na tela e diz que o desconto é dado no checkout', async ({ browser }) => {
  const { id } = await emCurso('Drenagem avulsa')
  await como(browser, profissional!, async p => {
    await p.goto(`/${slug}/agenda/${id}`)
    await expect(p.locator('[data-plano-opcional]')).toContainText('Opcional')
    await expect(p.locator('[data-plano-opcional]')).toContainText('Finalizar atendimento')
    await expect(p.locator('[data-campo="dores"]')).toContainText('só para gerar um plano')
    await expect(p.locator('[data-desconto-no-checkout]')).toContainText('O desconto é dado no checkout')
  })
})

test('A38: sem produto cadastrado, a busca de insumo diz isso e o caminho', async ({ browser }) => {
  const { id } = await emCurso('Sem insumo')
  await como(browser, profissional!, async p => {
    await p.goto(`/${slug}/agenda/${id}`)
    await p.getByRole('button', { name: 'Adicionar insumo' }).first().click()
    const vazio = p.locator('[data-busca-de-insumo-vazia]')
    await expect(vazio).toContainText('Nenhum produto cadastrado')
    await expect(vazio).toContainText('Estoque')
  })
})

test('A39: o saldo do plano aparece a quem recebe, não à profissional sem o Financeiro', async ({ browser }) => {
  const cliente = await rede!.criarCliente('Plano a vencer')
  await responderAnamnese(cliente, rede!.tenantId)
  const plano = await db().from('treatment_plans').insert({
    branch_id: rede!.branchId, professional_id: profissional!.userId, client_id: cliente, status: 'ACCEPTED', name: `[e2e] Plano aceito ${marca}`,
  }).select('id').single<{ id: string }>()
  expect(plano.error).toBeNull()
  const daqui30 = new Date(Date.now() + 30 * 86_400_000).toISOString()
  expect((await db().from('financial_transactions').insert({
    branch_id: rede!.branchId, client_id: cliente, treatment_plan_id: plano.data!.id, type: 'INCOME', category: 'Plano de tratamento',
    description: '[e2e] Plano de tratamento — parcela 1/1', amount: 2672, is_paid: false, due_date: daqui30, created_by: rede!.professionalId,
  })).error).toBeNull()
  const ag = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: cliente, procedure_id: rede!.procedureId, professional_id: profissional!.userId,
    treatment_plan_id: plano.data!.id, status: 'ARRIVED', source: 'INTERNAL', duration_min: 30, price: 0,
    scheduled_at: new Date(Date.now() + 10 * 60_000).toISOString(), arrived_at: new Date().toISOString(),
  }).select('id').single<{ id: string }>()
  expect(ag.error).toBeNull()
  await como(browser, recepcao!, async p => {
    await p.goto(`/${slug}/agenda/${ag.data!.id}`)
    await expect(p.locator('[data-plano-em-aberto]'), 'quem recebe vê o saldo').toContainText('a vencer')
  })
  await como(browser, profissional!, async p => {
    await p.goto(`/${slug}/agenda/${ag.data!.id}`)
    await expect(p.getByText('Histórico', { exact: true })).toBeVisible()
    await expect(p.locator('[data-plano-em-aberto]'), 'a profissional sem receber não vê o dinheiro do plano').toHaveCount(0)
  })
})
