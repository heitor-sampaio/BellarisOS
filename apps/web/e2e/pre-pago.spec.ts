import { test, expect, type Browser, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'

/**
 * Procedimento pré-pago (decisão do Heitor, 2026-09-30 — migration
 * 20260930000022): N unidades de UM procedimento, pagas antes e agendadas
 * depois. Separado do pacote.
 *
 * - A venda: retrato do preço e do desconto, unidades com a sua parte, e o
 *   dinheiro (`procedimento_vender`).
 * - A unidade no atendimento: a conclusão a usa, a recepção não cobra de novo,
 *   a comissão (PRE_PAGO) libera na proporção do que a venda recebeu.
 * - Falta devolve a unidade; cancelar a unidade reduz o a receber ou registra
 *   a devolução.
 *
 * Numa rede [e2e] própria.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let gestor: MembroDeTeste | null = null
let soVe: MembroDeTeste | null = null

test.beforeAll(async () => {
  rede = await criarOutraRede(`pp${marca}`)
  await db().from('procedures').update({ price: 300 }).eq('id', rede.procedureId)
  await db().from('users').update({ provides_services: true }).eq('id', rede.professionalId)
  const { error: eR } = await db().from('commission_rules').insert({
    tenant_id: rede.tenantId, professional_id: rede.professionalId, procedure_id: null, type: 'PERCENTAGE', value: 10, is_active: true,
  })
  expect(eR).toBeNull()
  await db().from('commission_configs').upsert({ tenant_id: rede.tenantId, modo: 'PAGAMENTO' }, { onConflict: 'tenant_id' })
  gestor = await criarMembro(`ppg${marca}`, {
    tenant: rede.tenantId, rotulo: 'Recepção e vendas',
    permissoes: [
      { modulo: 'cashier', nivel: 'MANAGE' }, { modulo: 'financial', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'MANAGE' },
      { modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'medical_records', nivel: 'MANAGE' }, { modulo: 'procedures', nivel: 'VIEW' },
    ],
  })
  soVe = await criarMembro(`ppv${marca}`, {
    tenant: rede.tenantId, rotulo: 'Só vê clientes',
    permissoes: [{ modulo: 'clients', nivel: 'VIEW' }, { modulo: 'agenda', nivel: 'VIEW' }],
  })
})

test.afterAll(async () => {
  if (rede) {
    const b = db()
    const { data: vendas } = await b.from('procedure_sales').select('id').eq('tenant_id', rede.tenantId)
    const ids = (vendas ?? []).map(v => v.id as string)
    const falhas: string[] = []
    if (ids.length) {
      for (const [t, col] of [['financial_transactions', 'procedure_sale_id'], ['commission_lines', 'procedure_sale_id']] as const) {
        const r = await b.from(t).update({ [col]: null }).in(col, ids)
        if (r.error) falhas.push(r.error.message)
      }
      const r = await b.from('procedure_sales').delete().in('id', ids)
      if (r.error) falhas.push(r.error.message)
    }
    await b.from('commission_rules').delete().eq('tenant_id', rede.tenantId)
    if (soVe) await soVe.limpar()
    if (gestor) await gestor.limpar()
    await rede.limpar()
    expect(falhas).toEqual([])
  }
})

async function comSessao<T>(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<T>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { return await fn(await ctx.newPage()) } finally { await ctx.close() }
}

const n = (v: unknown) => Number(v)
const devido = async (ap: string) => ((await db().from('commissions').select('amount').eq('appointment_id', ap)).data ?? [])
  .reduce((s, c) => Math.round((s + n(c.amount)) * 100) / 100, 0)

/** Venda direto pela função (para os casos que não são da tela). */
async function vender(cliente: string, qtd: number, lancamentos: Record<string, unknown>[]) {
  const { data, error } = await db().rpc('procedimento_vender', {
    p_tenant: rede!.tenantId, p_cliente: cliente, p_procedimento: rede!.procedureId, p_unidade: rede!.branchId,
    p_ator: null, p_quantidade: qtd, p_desconto: 0, p_validade_dias: null, p_lancamentos: lancamentos,
    p_unidades: Array.from({ length: qtd }, () => ({ preco: 300 })),
  })
  expect(error, 'vender pela função').toBeNull()
  return data as string
}

async function agendar(cliente: string) {
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: cliente, professional_id: rede!.professionalId, procedure_id: rede!.procedureId,
    scheduled_at: new Date().toISOString(), duration_min: 30, price: 270, status: 'IN_PROGRESS',
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  return data!.id
}

test.describe.serial('procedimento pré-pago', () => {
  let cliente = ''
  let venda = ''

  test('venda pela ficha: 3× com 10% e entrada + parcelas — unidades, dinheiro e o card', async ({ browser }) => {
    cliente = await rede!.criarCliente('Pré-pago')
    await comSessao(browser, gestor!, async p => {
      await p.goto(`/admin/clients/${cliente}`)
      await p.getByRole('button', { name: 'Vender', exact: true }).click()
      const dlg = p.getByRole('dialog', { name: 'Vender' })
      await dlg.getByLabel('Procedimento', { exact: true }).selectOption(rede!.procedureId)
      await dlg.getByLabel('Quantidade').fill('3')
      await expect(dlg.locator('[data-resumo-do-procedimento]')).toContainText('900,00')
      await dlg.getByRole('button', { name: '%', exact: true }).click()
      await dlg.getByLabel('Desconto', { exact: true }).fill('10')
      await dlg.getByRole('button', { name: 'Entrada + parcelas' }).click()
      await dlg.getByLabel('Entrada').fill('210')
      await dlg.getByLabel('Parcelas').selectOption('2')
      await dlg.getByRole('button', { name: /^Vender por R\$\s810,00$/ }).click()
      await expect(dlg).toBeHidden({ timeout: 15_000 })
      await expect(p.locator('[data-procedimentos-pagos]')).toContainText('3 para agendar')
    })
    const { data: v } = await db().from('procedure_sales').select('id, quantity, preco_tabela, desconto, price, sold_by').eq('client_id', cliente).single()
    venda = v!.id
    expect({ q: v!.quantity, tabela: n(v!.preco_tabela), desconto: n(v!.desconto), price: n(v!.price), por: v!.sold_by })
      .toEqual({ q: 3, tabela: 900, desconto: 90, price: 810, por: gestor!.userId })
    const { data: us } = await db().from('procedure_sale_units').select('preco, status').eq('sale_id', venda).order('numero')
    expect((us ?? []).map(u => [n(u.preco), u.status])).toEqual([[270, 'DISPONIVEL'], [270, 'DISPONIVEL'], [270, 'DISPONIVEL']])
    const { data: txs } = await db().from('financial_transactions').select('amount, is_paid, installments(amount)').eq('procedure_sale_id', venda).order('amount')
    expect((txs ?? []).map(t => [n(t.amount), t.is_paid, ((t.installments ?? []) as { amount: number }[]).length])).toEqual([[210, true, 0], [600, false, 2]])
  })

  test('a unidade no atendimento: conclusão a usa, recepção não cobra, comissão pela proporção recebida', async () => {
    const ap = await agendar(cliente)
    const { data: u1 } = await db().from('procedure_sale_units').select('id').eq('sale_id', venda).eq('numero', 1).single()
    await db().from('procedure_sale_units').update({ appointment_id: ap }).eq('id', u1!.id)
    const { error } = await db().rpc('concluir_atendimento', {
      p_agendamento: ap, p_tenant: rede!.tenantId, p_ator: null, p_ator_nome: null,
      p_dados: { comissoes: [{ procedure_id: rede!.procedureId, origem: 'PRE_PAGO', treatment_plan_id: null,
        regra_tipo: 'PERCENTAGE', regra_valor: 10, preco: 270 }], insumos: [] },
    })
    expect(error, 'concluir').toBeNull()
    const { data: usada } = await db().from('procedure_sale_units').select('status, used_at').eq('id', u1!.id).single()
    expect(usada!.status).toBe('USADA')
    const { data: linha } = await db().from('commission_lines').select('origem, preco, procedure_sale_id').eq('appointment_id', ap).single()
    expect({ ...linha, preco: n(linha!.preco) }).toEqual({ origem: 'PRE_PAGO', preco: 270, procedure_sale_id: venda })
    // Modo PAGAMENTO: 10% de 270 = 27, na proporção do recebido (210 de 810).
    expect(await devido(ap)).toBe(7)

    // A recepção não cobra de novo.
    const { error: eP } = await db().rpc('confirmar_pagamento_do_atendimento', {
      p_agendamento: ap, p_tenant: rede!.tenantId, p_ator: null, p_ator_nome: null, p_dados: { metodo: 'PIX', valor_final: 270 },
    })
    expect(eP?.message).toMatch(/pré-pago/)

    // O saldo é pago: completa.
    const { data: saldo } = await db().from('financial_transactions').select('id').eq('procedure_sale_id', venda).eq('is_paid', false).single()
    await db().from('financial_transactions').update({ is_paid: true, paid_at: new Date().toISOString() }).eq('id', saldo!.id)
    expect(await devido(ap)).toBe(27)
  })

  test('falta devolve a unidade para agendar de novo', async () => {
    const ap = await agendar(cliente)
    await db().from('appointments').update({ status: 'SCHEDULED' }).eq('id', ap)
    const { data: u2 } = await db().from('procedure_sale_units').select('id').eq('sale_id', venda).eq('numero', 2).single()
    await db().from('procedure_sale_units').update({ appointment_id: ap }).eq('id', u2!.id)
    await db().from('appointments').update({ status: 'NO_SHOW' }).eq('id', ap)
    const { data: depois } = await db().from('procedure_sale_units').select('status, appointment_id').eq('id', u2!.id).single()
    expect(depois).toEqual({ status: 'DISPONIVEL', appointment_id: null })
  })

  test('cancelar unidade pela ficha, com o a receber em aberto: o a receber diminui', async ({ browser }) => {
    const c = await rede!.criarCliente('Cancela a receber')
    const v = await vender(c, 2, [{ amount: 600, payment_method: 'PIX', is_paid: false }])
    await comSessao(browser, gestor!, async p => {
      await p.goto(`/admin/clients/${c}`)
      const card = p.locator('[data-procedimentos-pagos]')
      await card.getByRole('button', { name: 'Cancelar', exact: true }).first().click()
      await card.getByLabel('Motivo do cancelamento').fill('Desistiu da segunda sessão')
      await card.getByRole('button', { name: 'Cancelar unidade' }).click()
      await expect(card.getByRole('status')).toContainText('O a receber diminuiu R$')
    })
    const { data: txs } = await db().from('financial_transactions').select('type, amount, is_paid').eq('procedure_sale_id', v)
    expect((txs ?? []).map(t => [t.type, n(t.amount), t.is_paid])).toEqual([['INCOME', 300, false]])
    const { data: us } = await db().from('procedure_sale_units').select('status, cancel_reason').eq('sale_id', v).order('numero')
    expect(us!.map(u => u.status)).toEqual(['CANCELADA', 'DISPONIVEL'])
    expect(us![0]!.cancel_reason).toBe('Desistiu da segunda sessão')
  })

  test('cancelar unidade já paga: registra a devolução; agendada, recusa', async ({ browser }) => {
    const c = await rede!.criarCliente('Cancela pago')
    const v = await vender(c, 2, [{ amount: 600, payment_method: 'PIX', is_paid: true }])
    const { data: us } = await db().from('procedure_sale_units').select('id').eq('sale_id', v).order('numero')
    const ap = await agendar(c)
    await db().from('appointments').update({ status: 'SCHEDULED' }).eq('id', ap)
    await db().from('procedure_sale_units').update({ appointment_id: ap }).eq('id', us![1]!.id)
    await comSessao(browser, gestor!, async p => {
      const rota = `/admin/clients/${c}`
      const agendada = await chamarAcao(p, 'actions/pre-pago.ts', 'cancelarUnidadePrePaga', rota, [us![1]!.id, 'teste'])
      expect(agendada.texto).toContain('cancele o agendamento antes')
      const r = await chamarAcao(p, 'actions/pre-pago.ts', 'cancelarUnidadePrePaga', rota, [us![0]!.id, 'Mudou de cidade'])
      expect(r.texto).toContain('"devolver":300')
    })
    const { data: dev } = await db().from('financial_transactions').select('type, category, amount, is_paid, notes')
      .eq('procedure_sale_id', v).eq('type', 'EXPENSE').single()
    expect({ ...dev, amount: n(dev!.amount) }).toEqual({ type: 'EXPENSE', category: 'Devolução', amount: 300, is_paid: false, notes: 'Mudou de cidade' })
  })

  test('recusas: quem só vê não vende nem cancela; a sessão não escreve pelo PostgREST', async ({ browser }) => {
    const c = await rede!.criarCliente('Recusas')
    const v = await vender(c, 1, [{ amount: 300, payment_method: 'PIX', is_paid: true }])
    const { data: u } = await db().from('procedure_sale_units').select('id').eq('sale_id', v).single()
    await comSessao(browser, soVe!, async p => {
      const rota = `/admin/clients/${c}`
      const r = await chamarAcao(p, 'actions/pre-pago.ts', 'venderProcedimento', rota,
        [c, rede!.procedureId, rede!.branchId, 1, null, { forma: 'AVISTA', metodo: 'PIX' }, null])
      expect(r.texto).not.toContain('saleId')
      const x = await chamarAcao(p, 'actions/pre-pago.ts', 'cancelarUnidadePrePaga', rota, [u!.id, 'tentativa'])
      expect(x.texto).not.toContain('devolver')
    })
    expect((await db().from('procedure_sales').select('id').eq('client_id', c)).data?.length).toBe(1)
    expect((await db().from('procedure_sale_units').select('status').eq('id', u!.id).single()).data?.status).toBe('DISPONIVEL')

    const api = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: `Bearer ${gestor!.accessToken}` } }, auth: { persistSession: false },
    })
    const ins = await api.from('procedure_sales').insert({
      tenant_id: rede!.tenantId, branch_id: rede!.branchId, client_id: c, procedure_id: rede!.procedureId,
      quantity: 5, preco_unitario_tabela: 0, preco_tabela: 0, desconto: 0, price: 0,
    })
    expect(ins.error, 'a sessão não cria venda').not.toBeNull()
    const upd = await api.from('procedure_sale_units').update({ status: 'DISPONIVEL' }).eq('id', u!.id).select('id')
    expect(upd.data ?? [], 'a sessão não mexe na unidade').toEqual([])
    const lido = await api.from('procedure_sales').select('id').eq('id', v)
    expect(lido.data?.length, 'mas a equipe lê').toBe(1)
  })

  test('fidelidade por procedimento: os pontos das unidades, na proporção do pago', async () => {
    const c = await rede!.criarCliente('Fidelidade')
    await db().from('loyalty_configs').upsert({ tenant_id: rede!.tenantId, enabled: true, earn_mode: 'POR_PROCEDIMENTO' }, { onConflict: 'tenant_id' })
    await db().from('procedures').update({ loyalty_points: 40 }).eq('id', rede!.procedureId)
    await vender(c, 2, [
      { amount: 300, payment_method: 'PIX', is_paid: true },
      { amount: 300, payment_method: 'PIX', is_paid: false },
    ])
    const saldo = async () => n((await db().rpc('saldo_de_pontos', { p_cliente: c, p_unidade: null })).data)
    // 300 de 600 pagos: metade dos 2 × 40.
    await expect.poll(saldo).toBe(40)
    await db().from('loyalty_configs').update({ enabled: false }).eq('tenant_id', rede!.tenantId)
  })
})

test('um procedimento de outra rede não se vende', async ({ browser }) => {
  const c = await rede!.criarCliente('Outra rede')
  const outra = await criarOutraRede(`ppo${marca}`)
  try {
    await comSessao(browser, gestor!, async p => {
      const r = await chamarAcao(p, 'actions/pre-pago.ts', 'venderProcedimento', `/admin/clients/${c}`,
        [c, outra.procedureId, rede!.branchId, 1, null, { forma: 'AVISTA', metodo: 'PIX' }, null])
      expect(r.texto).toContain('Procedimento não encontrado')
    })
  } finally { await outra.limpar() }
})
