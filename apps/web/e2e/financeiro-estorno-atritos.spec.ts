import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { responderAnamneseDoAgendamento } from './apoio/anamnese'
import { receberAtendimentoNoPdv, escolherFormaPorValor, botaoDeReceber } from './apoio/vender'

/**
 * Os atritos do estorno (5ª simulação):
 * - A51: a janela do estorno não dizia que a cobrança do atendimento reabre;
 *   o histórico do agendamento registrava "Pagamento recebido" duas vezes e
 *   nenhum estorno; e, recebido de novo, a URL ficava com `?receber=1` e o
 *   "Fechar agora" continuava à vista (desde o PDV7, recebe-se de novo na
 *   comanda do atendimento, no PDV — o `?receber=1` saiu);
 * - A52: a lista do Financeiro mostrava o estorno como "Despesa · Pago ·
 *   −R$ 98", sem dizer que anula a receita.
 */

test.describe.configure({ mode: 'serial' })

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede
let gestora: MembroDeTeste
let slug = ''
let ap = ''
let tx = ''
const PRECO = 98

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: gestora.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  test.setTimeout(180_000)
  rede = await criarOutraRede(`eat${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  expect((await db().from('procedures').update({ price: PRECO }).eq('id', rede.procedureId)).error).toBeNull()
  // A gestora da clínica: recebe, estorna e monta plano (o "Fechar agora" é dela).
  gestora = await criarMembro(`eatg${marca}`, {
    tenant: rede.tenantId, branchId: null, rotulo: 'Gestora',
    // Monta o plano no atendimento concluído: quem atende na unidade (PT2, 14/11).
    atendeEm: [rede.branchId],
    permissoes: [
      { modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'cashier', nivel: 'MANAGE' },
      { modulo: 'financial', nivel: 'MANAGE' }, { modulo: 'medical_records', nivel: 'MANAGE' },
    ],
  })
  const cliente = await rede.criarCliente('Estorno')
  const { data: a, error } = await db().from('appointments').insert({
    branch_id: rede.branchId, client_id: cliente, professional_id: rede.professionalId, procedure_id: rede.procedureId,
    scheduled_at: new Date(Date.now() - 3_600_000).toISOString(), duration_min: 30, price: PRECO, status: 'IN_PROGRESS', source: 'INTERNAL',
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  ap = a!.id
  await responderAnamneseDoAgendamento(ap, rede.tenantId)
  expect((await db().rpc('concluir_atendimento', {
    p_agendamento: ap, p_tenant: rede.tenantId, p_ator: null, p_ator_nome: null, p_dados: { insumos: [], comissoes: [] },
  })).error).toBeNull()
  const pago = await db().rpc('confirmar_pagamento_do_atendimento', {
    p_agendamento: ap, p_tenant: rede.tenantId, p_ator: null, p_ator_nome: null,
    p_dados: { metodo: 'PIX', pontos: 0, desconto: 0, valor_final: PRECO },
  })
  expect(pago.error).toBeNull()
  tx = pago.data as string
})

test.afterAll(async () => {
  test.setTimeout(120_000)
  await db().from('treatment_plans').delete().eq('branch_id', rede.branchId)
  await gestora?.limpar()
  await rede?.limpar()
})

test('A51: a janela diz que a cobrança reabre, e o estorno entra no histórico do agendamento', async ({ browser }) => {
  await como(browser, async p => {
    await p.goto(`/${slug}/financeiro?aba=movimentacoes`)
    await p.getByRole('button', { name: 'Estornar' }).first().click()
    const janela = p.getByRole('dialog', { name: 'Estornar este lançamento?' })
    await expect(janela).toContainText('O atendimento volta a receber')
    await janela.getByRole('textbox').fill(`Pix devolvido ${marca}`)
    await janela.getByRole('button', { name: 'Confirmar estorno' }).click()
    await expect.poll(async () => (await db().from('financial_transactions').select('notes').eq('id', tx).single()).data?.notes).toBe('Estornada')
  })
  const { data: hist } = await db().from('appointment_history').select('action, description').eq('appointment_id', ap).eq('action', 'PAYMENT_REVERSED')
  expect(hist).toEqual([{ action: 'PAYMENT_REVERSED', description: `Pagamento estornado — Pix devolvido ${marca}` }])
})

test('A52: na lista do Financeiro (unidade e rede), o estorno se chama "Estorno" e diz que anula a receita', async ({ browser }) => {
  const { data: contra } = await db().from('financial_transactions').select('id').eq('branch_id', rede.branchId).eq('category', 'Estorno').single<{ id: string }>()
  await como(browser, async p => {
    await p.goto('/admin/financeiro?aba=movimentacoes')
    const linha = p.locator(`[data-lancamento="${contra!.id}"]`)
    await expect(linha.locator('[data-tipo-do-lancamento]')).toHaveText('Estorno')
    await expect(linha).toContainText('Anula a receita estornada')
    await p.goto(`/${slug}/financeiro?aba=movimentacoes`)
    await expect(p.locator(`[data-lancamento="${contra!.id}"]`)).toContainText('Anula a receita estornada')
  })
})

test('A51: recebido de novo na comanda do PDV, a tela do atendimento diz pago e o "Fechar agora" some', async ({ browser }) => {
  await como(browser, async p => {
    // PDV7/CX3: o estornado volta à comanda do atendimento, no PDV.
    const comanda = await receberAtendimentoNoPdv(p, `/${slug}`, ap)
    await escolherFormaPorValor(comanda, 'PIX')
    await botaoDeReceber(comanda).click()
    await expect.poll(async () => (await db().from('financial_transactions').select('id')
      .eq('appointment_id', ap).eq('is_paid', true).eq('type', 'INCOME').neq('id', tx)).data?.length ?? 0,
      { message: 'a receita nova', timeout: 20_000 }).toBeGreaterThan(0)
    await p.goto(`/${slug}/agenda/${ap}`)
    await expect(p.getByText(/Pagamento confirmado/).first()).toBeVisible({ timeout: 20_000 })
    // Fase 3 do PDV (PT1b): o "Fechar agora" (que cobrava) saiu; o que ficou é
    // o "Aceitar plano", sem dinheiro — e não se lê como receber de novo.
    await expect(p.getByRole('button', { name: 'Fechar agora' }), 'pago, nada que se confunda com receber').toHaveCount(0)
    await expect(p.locator('[data-aceitar-plano]'), 'o aceite não cobra').not.toContainText(/Receber|Cobrar|Fechar/)
    await expect(p.getByRole('button', { name: 'Gerar plano · a cliente vai pensar' }), 'o plano continua a um clique').toBeVisible()
  })
})
