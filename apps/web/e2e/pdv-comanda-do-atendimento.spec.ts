import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'
import { haMinutosHoje } from './apoio/datas'

/**
 * O PDV e a comanda do atendimento (a revisão do Heitor, 2026-11-13 — PDV1,
 * PDV2, PDV3 e CX1 do plano de adaptação, `docs/revisao.md`).
 *
 * O Heitor: "vamos fazer um PDV. E aí tudo que foi relacionado a alguma coisa
 * que tenha cobrança vira uma comanda. E aí o pagamento acontece por dentro
 * desse PDV, seja do que for." E, sobre quando ela nasce: "quando inicia o
 * atendimento, gera a comanda. Aí fica a critério da clínica se precisa pagar
 * primeiro ou se paga depois, que daí é só a ordem que eles vão fazer
 * qualquer coisa."
 *
 * - Iniciar o atendimento gera a comanda; agendar e confirmar, não.
 * - O PDV recebe a comanda, com a forma de pagamento obrigatória — e antes de
 *   concluir o atendimento também.
 * - O atendimento cancelado no meio tira a comanda; o de R$ 0 não tem comanda.
 * - O PDV é de quem recebe (o PDV ou o Financeiro em Gerenciar).
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let recepcao: MembroDeTeste | null = null
let slug = ''
let procLimpeza = ''
let minutos = 5

async function como(m: MembroDeTeste, browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

/** Um agendamento de hoje, minutos atrás, na situação pedida. */
async function agendamento(cliente: string, preco: number, status: string, procedimento = procLimpeza) {
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: cliente, procedure_id: procedimento, professional_id: rede!.professionalId,
    status, source: 'INTERNAL', duration_min: 30, price: preco,
    scheduled_at: haMinutosHoje(minutos += 2),
    ...(status === 'COMPLETED' ? { started_at: new Date().toISOString(), completed_at: new Date().toISOString() } : {}),
  }).select('id').single<{ id: string }>()
  expect(error, 'agendar').toBeNull()
  return data!.id
}
const comandaDo = async (agendamentoId: string) => (await db().from('comandas')
  .select('id, numero, origem, client_id, branch_id, tenant_id, cancelada_em').eq('appointment_id', agendamentoId)
  .maybeSingle<{ id: string; numero: number; origem: string; client_id: string; branch_id: string; tenant_id: string; cancelada_em: string | null }>()).data

test.beforeAll(async () => {
  rede = await criarOutraRede(`pdv${marca}`)
  expect((await db().from('users').update({ branch_id: rede.branchId, provides_services: true }).eq('id', rede.professionalId)).error).toBeNull()
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  const { data: pr, error } = await db().from('procedures')
    .insert({ tenant_id: rede.tenantId, name: `[e2e] Limpeza ${marca}`, category: 'e2e', duration_min: 30, price: 180 })
    .select('id').single<{ id: string }>()
  expect(error).toBeNull()
  procLimpeza = pr!.id
  // Quem está no balcão: agenda, clientes e o PDV (cashier) em Gerenciar.
  recepcao = await criarMembro(`pdvr${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Balcão',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'cashier', nivel: 'MANAGE' }],
  })
})
test.afterAll(async () => {
  await recepcao?.limpar()
  await rede?.limpar()
})

test('PDV3: agendar e confirmar não geram comanda; iniciar o atendimento gera', async ({ browser }) => {
  const cliente = await rede!.criarCliente('Inicia')
  const id = await agendamento(cliente, 180, 'SCHEDULED')
  expect(await comandaDo(id), 'agendado não tem comanda').toBeNull()
  expect((await db().from('appointments').update({ status: 'CONFIRMED' }).eq('id', id)).error).toBeNull()
  expect(await comandaDo(id), 'confirmado não tem comanda').toBeNull()

  await como(recepcao!, browser, async p => {
    await p.goto(`/${slug}/agenda/${id}`)
    await chamarAcao(p, 'actions/appointments.ts', 'startAppointment', `/${slug}/agenda/${id}`, [id, slug, { inicioAdiantadoConfirmado: true }])
  })
  // A resposta da action traz a página inteira: o que vale é o que ficou gravado.
  expect((await db().from('appointments').select('status').eq('id', id).single<{ status: string }>()).data!.status).toBe('IN_PROGRESS')
  const comanda = await comandaDo(id)
  expect(comanda, 'iniciado tem comanda').not.toBeNull()
  expect(comanda!.origem).toBe('ATENDIMENTO')
  expect(comanda!.client_id).toBe(cliente)
  expect(comanda!.branch_id).toBe(rede!.branchId)
  expect(comanda!.tenant_id).toBe(rede!.tenantId)
  expect(comanda!.numero).toBeGreaterThan(0)
  expect(comanda!.cancelada_em).toBeNull()
})

test('PDV1/CX1: o PDV mostra a comanda aberta e a recebe, com a forma obrigatória, antes de concluir', async ({ browser }) => {
  const cliente = await rede!.criarCliente('Paga Antes')
  const id = await agendamento(cliente, 180, 'CONFIRMED')
  expect((await db().from('appointments').update({ status: 'IN_PROGRESS', started_at: new Date().toISOString() }).eq('id', id)).error).toBeNull()
  const comanda = (await comandaDo(id))!
  expect(comanda).not.toBeNull()

  await como(recepcao!, browser, async p => {
    await p.goto(`/${slug}/pdv`)
    await expect(p.getByRole('heading', { name: 'PDV' })).toBeVisible()
    const linha = p.locator(`[data-comanda="${comanda.id}"]`)
    await expect(linha).toContainText(`Paga Antes pdv${marca}`)
    await expect(linha).toContainText('180,00')
    await linha.click()

    const detalhe = p.locator('[data-comanda-aberta]')
    await expect(detalhe).toContainText(`Limpeza ${marca}`)
    const receber = detalhe.getByRole('button', { name: /Receber R\$\s?180,00/ })
    // Não existe pagamento sem forma de pagamento (PDV8): o botão espera a forma.
    await expect(receber).toBeDisabled()
    await detalhe.getByRole('radio', { name: 'Pix' }).click()
    await expect(receber).toBeEnabled()
    await receber.click()

    // Recebida, sai das abertas e aparece nas pagas de hoje.
    await expect(p.locator(`[data-lista-de-comandas] [data-comanda="${comanda.id}"]`)).toHaveCount(0)
    await p.getByRole('link', { name: 'Pagas hoje' }).click()
    await expect(p.locator(`[data-lista-de-comandas] [data-comanda="${comanda.id}"]`)).toContainText('Paga')
  })

  const { data: tx } = await db().from('financial_transactions')
    .select('amount, is_paid, payment_method').eq('appointment_id', id)
  expect(tx).toEqual([{ amount: 180, is_paid: true, payment_method: 'PIX' }])
  // Pagar antes é só a ordem do trabalho: o atendimento segue em andamento.
  expect((await db().from('appointments').select('status').eq('id', id).single<{ status: string }>()).data!.status).toBe('IN_PROGRESS')
})

test('o atendimento cancelado no meio tira a comanda do PDV; o de R$ 0 não tem comanda', async ({ browser }) => {
  const cancelado = await agendamento(await rede!.criarCliente('Desiste'), 180, 'CONFIRMED')
  expect((await db().from('appointments').update({ status: 'IN_PROGRESS', started_at: new Date().toISOString() }).eq('id', cancelado)).error).toBeNull()
  const comanda = (await comandaDo(cancelado))!
  expect(comanda.cancelada_em).toBeNull()
  expect((await db().from('appointments').update({ status: 'CANCELLED', cancellation_reason: 'e2e' }).eq('id', cancelado)).error).toBeNull()
  expect((await comandaDo(cancelado))!.cancelada_em, 'cancelado, a comanda sai').not.toBeNull()

  const gratis = await agendamento(await rede!.criarCliente('Gratis'), 0, 'CONFIRMED', rede!.procedureId)
  expect((await db().from('appointments').update({ status: 'IN_PROGRESS', started_at: new Date().toISOString() }).eq('id', gratis)).error).toBeNull()
  expect(await comandaDo(gratis), 'sem cobrança, sem comanda').toBeNull()

  await como(recepcao!, browser, async p => {
    await p.goto(`/${slug}/pdv`)
    await expect(p.getByRole('heading', { name: 'PDV' })).toBeVisible()
    await expect(p.locator(`[data-lista-de-comandas] [data-comanda="${comanda.id}"]`)).toHaveCount(0)
  })
})

test('CX3: o atendimento concluído sem pagamento é uma comanda aberta do PDV', async ({ browser }) => {
  const id = await agendamento(await rede!.criarCliente('Concluida'), 120, 'COMPLETED')
  const comanda = (await comandaDo(id))!
  expect(comanda, 'concluído e não pago, a comanda está aberta').not.toBeNull()
  await como(recepcao!, browser, async p => {
    await p.goto(`/${slug}/pdv`)
    await expect(p.locator(`[data-lista-de-comandas] [data-comanda="${comanda.id}"]`)).toContainText('120,00')
  })
})

test('o PDV é de quem recebe: sem o PDV nem o Financeiro em Gerenciar, a tela é fechada; a rede abre pelo /admin', async ({ browser }) => {
  const soAgenda = await criarMembro(`pdva${marca}`, {
    tenant: rede!.tenantId, branchId: rede!.branchId, rotulo: 'Só agenda',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'financial', nivel: 'VIEW' }],
  })
  const daRede = await criarMembro(`pdvf${marca}`, {
    tenant: rede!.tenantId, rotulo: 'Financeiro da rede',
    permissoes: [{ modulo: 'financial', nivel: 'MANAGE' }],
  })
  try {
    await como(soAgenda, browser, async p => {
      await p.goto(`/${slug}/pdv`)
      await expect(p.getByText('Você não tem acesso a esta área')).toBeVisible()
    })
    const id = await agendamento(await rede!.criarCliente('Da Rede'), 150, 'COMPLETED')
    const comanda = (await comandaDo(id))!
    await como(daRede, browser, async p => {
      await p.goto(`/admin/pdv`)
      await expect(p.getByRole('heading', { name: 'PDV' })).toBeVisible()
      await expect(p.locator(`[data-lista-de-comandas] [data-comanda="${comanda.id}"]`)).toContainText('150,00')
    })
  } finally {
    await soAgenda.limpar()
    await daRede.limpar()
  }
})
