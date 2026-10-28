import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, clienteComSessao, type MembroDeTeste, type ClienteDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * O estorno REABRE a cobrança (D6 da simulação de 2026-10-28).
 *
 * A simulação achou: estornado o Pix de R$ 199,50 da Mariana, o atendimento
 * continuava "Pagamento confirmado", não voltava aos "Concluídos a receber",
 * e o único jeito de relançar era o "Novo lançamento" manual — sem cliente,
 * pontos nem comissão. O portal da cliente listava o estornado como "Pago" ao
 * lado de "Total investido R$ 0,00"; a ficha mostrava o estorno POSITIVO e o
 * original ainda "Pago".
 *
 * Decisão do Heitor (2026-10-28): estornada a receita de um atendimento, ele
 * VOLTA a "a receber", e o "Receber" vale de novo — com cliente, pontos e
 * comissão como num recebimento normal. Só o estornado reabre, e o novo
 * recebimento não duplica a comissão nem os pontos (o estorno já os devolveu).
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let recepcao: MembroDeTeste | null = null
let cliente: ClienteDeTeste | null = null
let slug = ''
let proc = ''
let ap = ''
let txOriginal = ''
const PRECO = 200

async function como(m: { estado: string }, browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}
const n = (v: unknown) => Number(v ?? 0)
async function extrato() {
  const { data, error } = await db().from('commissions').select('kind, amount')
    .eq('appointment_id', ap).order('released_at').order('amount', { ascending: false })
  expect(error).toBeNull()
  return (data ?? []).map(c => [c.kind as string, n(c.amount)] as const)
}
async function aReceber() {
  const { data, error } = await db().rpc('atendimentos_a_receber', { p_tenant: rede!.tenantId, p_cliente: cliente!.clientId })
  expect(error).toBeNull()
  return ((data ?? []) as { appointment_id: string }[]).map(r => r.appointment_id)
}
async function totaisDaCliente() {
  const { data, error } = await db().rpc('metrics_financeiro_do_cliente', { p_tenant: rede!.tenantId, p_client: cliente!.clientId, p_profissional: null })
  expect(error).toBeNull()
  const t = (data as { pago: number; a_receber: number }[])[0]
  return { pago: n(t?.pago), aReceber: n(t?.a_receber) }
}
const pontos = async () => n((await db().rpc('saldo_de_pontos', { p_cliente: cliente!.clientId, p_unidade: null })).data)

test.beforeAll(async () => {
  rede = await criarOutraRede(`er${marca}`)
  expect((await db().from('users').update({ branch_id: rede.branchId, provides_services: true }).eq('id', rede.professionalId)).error).toBeNull()
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  const { data: pr, error } = await db().from('procedures')
    .insert({ tenant_id: rede.tenantId, name: `${PREFIXO} Peeling ${marca}`, category: 'e2e', duration_min: 30, price: PRECO })
    .select('id').single<{ id: string }>()
  expect(error).toBeNull()
  proc = pr!.id
  // Comissão "no atendimento", 10%, sem taxa; fidelidade de 1 ponto por real.
  expect((await db().from('commission_configs').upsert({
    tenant_id: rede.tenantId, modo: 'ATENDIMENTO', desconta_insumos: false, desconta_taxa: false,
    base_com_pontos: 'PRECO', periodo: 'MENSAL',
  }, { onConflict: 'tenant_id' })).error).toBeNull()
  expect((await db().from('loyalty_configs').upsert({
    tenant_id: rede.tenantId, enabled: true, earn_mode: 'POR_REAL', points_per_real: 1,
  }, { onConflict: 'tenant_id' })).error).toBeNull()

  recepcao = await criarMembro(`err${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Recepção',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'cashier', nivel: 'MANAGE' }],
  })
  cliente = await clienteComSessao(`erc${marca}`, { id: rede.branchId, slug }, { tenant: rede.tenantId })

  // O atendimento concluído (com a linha de comissão), pago no Pix e estornado.
  const { data: a, error: eA } = await db().from('appointments').insert({
    branch_id: rede.branchId, client_id: cliente.clientId, professional_id: rede.professionalId, procedure_id: proc,
    scheduled_at: new Date().toISOString(), duration_min: 30, price: PRECO, status: 'IN_PROGRESS', source: 'INTERNAL',
  }).select('id').single<{ id: string }>()
  expect(eA).toBeNull()
  ap = a!.id
  expect((await db().rpc('concluir_atendimento', {
    p_agendamento: ap, p_tenant: rede.tenantId, p_ator: null, p_ator_nome: null,
    p_dados: { insumos: [], comissoes: [{ procedure_id: proc, origem: 'AVULSO', treatment_plan_id: null, regra_tipo: 'PERCENTAGE', regra_valor: 10, preco: PRECO }] },
  })).error, 'concluir').toBeNull()
  const pago = await db().rpc('confirmar_pagamento_do_atendimento', {
    p_agendamento: ap, p_tenant: rede.tenantId, p_ator: null, p_ator_nome: null,
    p_dados: { metodo: 'PIX', pontos: 0, desconto: 0, valor_final: PRECO },
  })
  expect(pago.error, 'pagar').toBeNull()
  txOriginal = pago.data as string
  await expect.poll(pontos, { message: 'o pagamento dá os pontos' }).toBe(PRECO)
  expect((await db().rpc('estornar_transacao', { p_transacao: txOriginal, p_tenant: rede.tenantId, p_ator: 'e2e', p_motivo: 'Pix devolvido' })).error, 'estornar').toBeNull()
})

test.afterAll(async () => {
  await recepcao?.limpar()
  await cliente?.limpar()
  await rede?.limpar()
})

test.describe('o estorno reabre a cobrança', () => {
  test('no banco: o estornado volta a "a receber", e o total a receber da cliente o conta', async () => {
    expect(await extrato(), 'a comissão já foi devolvida pelo estorno').toEqual([['LIBERACAO', 20], ['ESTORNO', -20]])
    expect(await pontos(), 'e os pontos também').toBe(0)
    expect(await aReceber()).toContain(ap)
    expect(await totaisDaCliente()).toEqual({ pago: 0, aReceber: PRECO })
  })

  test('a tela do atendimento diz que o pagamento foi estornado e oferece receber de novo; o Fechamento o lista', async ({ browser }) => {
    await como(recepcao!, browser, async p => {
      await p.goto(`/${slug}/agenda/${ap}`)
      await expect(p.getByText(/Pagamento estornado/).first()).toBeVisible()
      await expect(p.getByText(/Pagamento confirmado/)).toHaveCount(0)
      await expect(p.getByRole('button', { name: 'Confirmar pagamento' })).toBeVisible()

      await p.goto(`/${slug}/fechamento`)
      await expect(p.locator(`[data-a-receber] [data-agendamento="${ap}"]`)).toBeVisible()
    })
  })

  test('o portal da cliente mostra o pagamento como "Estornado", não "Pago"', async ({ browser }) => {
    await como(cliente!, browser, async p => {
      await p.goto(`/${slug}/cliente/financeiro`)
      const linha = p.locator('.card').filter({ hasText: `Peeling ${marca}` })
      await expect(linha).toHaveCount(1)
      await expect(linha).toContainText('Estornado')
      await expect(linha).not.toContainText('Pago')
      await expect(p.locator('.card').filter({ hasText: 'Total investido' })).toContainText('0,00')
    })
  })

  test('a ficha mostra o estorno com o sinal de saída e o original marcado como estornado', async ({ browser }) => {
    const { data: contra, error } = await db().from('financial_transactions').select('id')
      .eq('client_id', cliente!.clientId).eq('category', 'Estorno').single<{ id: string }>()
    expect(error).toBeNull()
    await como(recepcao!, browser, async p => {
      await p.goto(`/${slug}/clients/${cliente!.clientId}?aba=financeiro`)
      const original = p.locator(`[data-lancamento="${txOriginal}"]`)
      await expect(original).toContainText('Estornado')
      await expect(original).not.toContainText('Pago')
      await expect(p.locator(`[data-lancamento="${contra!.id}"]`)).toContainText(/[−-]\s?R\$\s?200,00/)
    })
  })

  test('receber de novo pela tela: com cliente, pontos e comissão — uma vez só', async ({ browser }) => {
    await como(recepcao!, browser, async p => {
      await p.goto(`/${slug}/agenda/${ap}`)
      await p.getByRole('button', { name: 'Confirmar pagamento' }).click()
      const janela = p.getByRole('dialog', { name: 'Confirmar pagamento' })
      await janela.getByLabel('Forma de pagamento').selectOption('PIX')
      await janela.getByRole('button', { name: 'Confirmar pagamento' }).click()
      await expect(p.getByText(/Pagamento confirmado/).first()).toBeVisible({ timeout: 20_000 })
    })

    const { data: lancs, error } = await db().from('financial_transactions')
      .select('id, client_id, amount, is_paid, notes').eq('appointment_id', ap).eq('type', 'INCOME')
    expect(error).toBeNull()
    const novo = (lancs ?? []).find(l => l.notes !== 'Estornada')
    expect(lancs ?? [], 'o estornado fica, e nasce um recebimento novo').toHaveLength(2)
    expect(novo).toMatchObject({ client_id: cliente!.clientId, is_paid: true })
    expect(n(novo!.amount)).toBe(PRECO)

    expect(await extrato(), 'a comissão volta UMA vez').toEqual([['LIBERACAO', 20], ['ESTORNO', -20], ['LIBERACAO', 20]])
    await expect.poll(pontos, { message: 'os pontos voltam uma vez' }).toBe(PRECO)
    expect(await aReceber()).not.toContain(ap)
    expect(await totaisDaCliente()).toEqual({ pago: PRECO, aReceber: 0 })

    // Pago de novo, não se recebe uma terceira vez.
    const terceira = await db().rpc('confirmar_pagamento_do_atendimento', {
      p_agendamento: ap, p_tenant: rede!.tenantId, p_ator: null, p_ator_nome: null,
      p_dados: { metodo: 'PIX', pontos: 0, desconto: 0, valor_final: PRECO },
    })
    expect(terceira.error?.message ?? '').toMatch(/já registrado/)

    // A venda do atendimento continua UMA (o relatório de vendas juntava o lançamento pelo agendamento).
    const { data: vendas, error: eV } = await db().rpc('metrics_vendas', {
      p_tenant: rede!.tenantId, p_branch_ids: null,
      p_from: new Date(Date.now() - 86_400_000).toISOString(), p_to: new Date(Date.now() + 86_400_000).toISOString(),
    })
    expect(eV).toBeNull()
    expect(((vendas ?? []) as { id: string }[]).filter(v => v.id === ap)).toHaveLength(1)
  })
})
