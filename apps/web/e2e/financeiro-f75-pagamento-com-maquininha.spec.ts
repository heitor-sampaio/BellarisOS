import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { responderAnamnese } from './apoio/anamnese'

/**
 * A18 e A19 da 14ª simulação (F75):
 *
 * - A18: com duas maquininhas, o pagamento no cartão dizia só "Débito" — na
 *   confirmação, no histórico do atendimento e na lista do Financeiro. Quem
 *   estornava não sabia de qual. O rótulo é um só (`rotuloDaForma` com a
 *   maquininha; no banco, `private.rotulo_do_pagamento`), e a maquininha só
 *   aparece com MAIS DE UMA na rede.
 * - A19: quem estorna (Financeiro em Gerenciar, de todos) não achava o
 *   estorno no atendimento pago — só no Financeiro e na ficha. A página do
 *   atendimento mostra o "Estornar", com a mesma janela.
 *
 * Numa rede [e2e] própria, com a "Maquininha" com que ela nasce e uma "Stone".
 */

test.describe.configure({ mode: 'serial' })

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let dona: MembroDeTeste | null = null
let stone = ''
let cliente = ''
let agendamento = ''
const PRECO = 180

async function como<T>(browser: Browser, fn: (p: Page) => Promise<T>) {
  const ctx = await browser.newContext({ storageState: dona!.estado })
  try { return await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  test.setTimeout(150_000)
  rede = await criarOutraRede(`f75m${marca}`)
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  const { data: m, error } = await db().from('maquininhas')
    .insert({ tenant_id: rede.tenantId, nome: 'Stone', ordem: 1, taxas: {}, prazo_dias: 1 })
    .select('id').single<{ id: string }>()
  expect(error).toBeNull()
  stone = m!.id
  dona = await criarMembro(`f75md${marca}`, { tenant: rede.tenantId, donoDaRede: true, permissoes: [] })
  cliente = await rede.criarCliente('Pagante na Stone')

  const { data: a, error: eA } = await db().from('appointments').insert({
    branch_id: rede.branchId, client_id: cliente, professional_id: rede.professionalId, procedure_id: rede.procedureId,
    scheduled_at: new Date(Date.now() - 3_600_000).toISOString(), duration_min: 30, price: PRECO, status: 'IN_PROGRESS', source: 'INTERNAL',
  }).select('id').single<{ id: string }>()
  expect(eA).toBeNull()
  agendamento = a!.id
  await responderAnamnese(cliente, rede.tenantId)
  expect((await db().rpc('concluir_atendimento', {
    p_agendamento: agendamento, p_tenant: rede.tenantId, p_ator: null, p_ator_nome: null,
    p_dados: { insumos: [], comissoes: [] },
  })).error, 'concluir').toBeNull()
  expect((await db().rpc('confirmar_pagamento_do_atendimento', {
    p_agendamento: agendamento, p_tenant: rede.tenantId, p_ator: rede.professionalId, p_ator_nome: `${PREFIXO} Recepção`,
    p_dados: { pontos: 0, desconto: 0, valor_final: PRECO, metodo: 'DEBIT_CARD', cartao_bandeira: 'VISA', maquininha_id: stone },
  })).error, 'pagar').toBeNull()
})

test.afterAll(async () => {
  await dona?.limpar()
  await rede?.limpar()
})

test('A18: o histórico do atendimento diz a bandeira e a maquininha', async () => {
  const { data, error } = await db().from('appointment_history').select('description')
    .eq('appointment_id', agendamento).eq('action', 'PAYMENT_CONFIRMED').single<{ description: string }>()
  expect(error).toBeNull()
  expect(data!.description).toBe('Pagamento confirmado via Débito Visa · Stone')
})

test('A18 e A19: o atendimento pago diz a maquininha e mostra o "Estornar" a quem estorna', async ({ browser }) => {
  test.setTimeout(120_000)
  await como(browser, async page => {
    await page.goto(`/admin/agenda/${agendamento}`)
    await expect(page.getByText(/Pagamento confirmado — Débito Visa · Stone/)).toBeVisible({ timeout: 30_000 })
    await page.locator('[data-estornar]').click()
    // A mesma janela do Financeiro e da ficha (o motivo é obrigatório).
    await expect(page.getByRole('dialog', { name: /Estornar este lançamento/ })).toBeVisible()
  })
})

test('A18: a lista do Financeiro diz a maquininha', async ({ browser }) => {
  test.setTimeout(120_000)
  await como(browser, async page => {
    await page.goto('/admin/financeiro')
    await expect(page.getByText(/Débito( Visa)? · Stone/).first()).toBeVisible({ timeout: 30_000 })
  })
})
