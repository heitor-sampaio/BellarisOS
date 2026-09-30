import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'

/**
 * Desconto em todas as vendas (decisão do Heitor, 2026-09-30 — migration
 * 20260930000021): pacote, checkout do plano e o recebimento na recepção. Sem
 * teto; o servidor calcula o desconto em reais e a função do banco confere.
 *
 * - Pacote: o preço VENDIDO é o de catálogo menos o desconto; as sessões e o
 *   dinheiro fecham com ele.
 * - Plano: o desconto é rateado nos procedimentos do plano (preço vendido,
 *   com o de antes em `preco_tabela`): dinheiro e fidelidade leem dele.
 * - Avulso: `sale_discount` no lançamento, e a comissão percentual sai sobre o
 *   vendido.
 *
 * Numa rede [e2e] própria.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let gestor: MembroDeTeste | null = null
let slug = ''
let procB = ''
let pacoteId = ''

test.beforeAll(async () => {
  rede = await criarOutraRede(`vd${marca}`)
  const { data: un } = await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()
  slug = un!.slug
  await db().from('procedures').update({ price: 300 }).eq('id', rede.procedureId)
  const { data: b, error: eB } = await db().from('procedures').insert({
    tenant_id: rede.tenantId, name: `${PREFIXO} Proc B ${marca}`, category: 'e2e', duration_min: 30, price: 100,
  }).select('id').single<{ id: string }>()
  expect(eB).toBeNull()
  procB = b!.id
  // Pacote de R$ 800: 2× A (tabela R$ 300) + 2× B (R$ 100).
  const { data: pac, error: eP } = await db().rpc('pacote_salvar', {
    p_tenant: rede.tenantId, p_id: null, p_nome: `${PREFIXO} Pacote ${marca}`, p_preco: 800, p_validade: null, p_ativo: true,
    p_itens: [{ procedure_id: rede.procedureId, quantity: 2 }, { procedure_id: procB, quantity: 2 }],
  })
  expect(eP, 'criar o pacote').toBeNull()
  pacoteId = pac as string
  gestor = await criarMembro(`vdg${marca}`, {
    tenant: rede.tenantId, rotulo: 'Recepção e vendas',
    permissoes: [
      { modulo: 'cashier', nivel: 'MANAGE' }, { modulo: 'financial', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'MANAGE' },
      { modulo: 'medical_records', nivel: 'MANAGE' }, { modulo: 'documents', nivel: 'MANAGE' }, { modulo: 'agenda', nivel: 'MANAGE' },
      { modulo: 'procedures', nivel: 'VIEW' },
    ],
  })
})

test.afterAll(async () => {
  if (rede) {
    const b = db()
    const { data: cps } = await b.from('client_packages').select('id').eq('branch_id', rede.branchId)
    const ids = (cps ?? []).map(c => c.id as string)
    if (ids.length) {
      await b.from('package_sessions').delete().in('client_package_id', ids)
      await b.from('financial_transactions').update({ client_package_id: null }).in('client_package_id', ids)
      await b.from('client_packages').delete().in('id', ids)
    }
    const falhas: string[] = []
    const r = await b.from('service_packages').delete().eq('tenant_id', rede.tenantId)
    if (r.error) falhas.push(r.error.message)
    if (gestor) await gestor.limpar()
    await rede.limpar()
    expect(falhas).toEqual([])
  }
})

async function comSessao<T>(browser: Browser, fn: (p: Page) => Promise<T>) {
  const ctx = await browser.newContext({ storageState: gestor!.estado })
  try { return await fn(await ctx.newPage()) } finally { await ctx.close() }
}

const n = (v: unknown) => Number(v)

test.describe.serial('desconto nas vendas', () => {
  test('pacote pela tela: 10% — vendido 720, sessões e dinheiro fecham com ele', async ({ browser }) => {
    const cliente = await rede!.criarCliente('Pacote')
    await comSessao(browser, async p => {
      await p.goto(`/admin/clients/${cliente}`)
      await p.getByRole('button', { name: 'Vender pacote' }).click()
      const dlg = p.getByRole('dialog', { name: 'Vender pacote' })
      await dlg.getByRole('button', { name: '%', exact: true }).click()
      await dlg.getByLabel('Desconto', { exact: true }).fill('10')
      await expect(dlg.getByTestId('conta-do-desconto')).toContainText('720,00')
      await dlg.getByRole('button', { name: /^Vender por R\$\s720,00$/ }).click()
      await expect(dlg).toBeHidden({ timeout: 15_000 })
    })
    const { data: cp } = await db().from('client_packages').select('id, price, preco_tabela, desconto, sold_by').eq('client_id', cliente).single()
    expect({ price: n(cp!.price), tabela: n(cp!.preco_tabela), desconto: n(cp!.desconto) }).toEqual({ price: 720, tabela: 800, desconto: 80 })
    expect(cp!.sold_by, 'quem deu o desconto é quem vendeu').toBe(gestor!.userId)
    const { data: sess } = await db().from('package_sessions').select('preco').eq('client_package_id', cp!.id)
    // 720 rateado pela tabela (300, 300, 100, 100 → 3/8 e 1/8): 270, 270, 90, 90.
    expect((sess ?? []).map(s => n(s.preco)).sort((a, b) => b - a)).toEqual([270, 270, 90, 90])
    const { data: txs } = await db().from('financial_transactions').select('amount, is_paid').eq('client_package_id', cp!.id)
    expect((txs ?? []).map(t => [n(t.amount), t.is_paid])).toEqual([[720, true]])
  })

  test('pacote: desconto maior que o preço é recusado pela action e pela função', async ({ browser }) => {
    const cliente = await rede!.criarCliente('Pacote recusa')
    await comSessao(browser, async p => {
      const r = await chamarAcao(p, 'actions/pacotes.ts', 'venderPacote', `/admin/clients/${cliente}`,
        [cliente, pacoteId, rede!.branchId, { forma: 'AVISTA', metodo: 'PIX' }, { tipo: 'VALOR', valor: 900 }])
      expect(r.texto).toContain('maior que o valor')
    })
    const { error } = await db().rpc('pacote_vender', {
      p_tenant: rede!.tenantId, p_cliente: cliente, p_pacote: pacoteId, p_unidade: rede!.branchId, p_ator: null,
      p_lancamentos: [{ amount: 0, payment_method: 'PIX', is_paid: true }], p_desconto: 900,
    })
    expect(error?.message).toMatch(/maior que o preço/)
    expect((await db().from('client_packages').select('id').eq('client_id', cliente)).data).toEqual([])
  })

  test('plano: 10% rateado nos procedimentos — dinheiro e fidelidade pelo vendido', async ({ browser }) => {
    const cliente = await rede!.criarCliente('Plano')
    // Fidelidade por procedimento: 40 pontos por procedimento do plano. Lia a
    // tabela legada (`treatment_plan_items`) e dava zero.
    await db().from('loyalty_configs').upsert({ tenant_id: rede!.tenantId, enabled: true, earn_mode: 'POR_PROCEDIMENTO' }, { onConflict: 'tenant_id' })
    await db().from('procedures').update({ loyalty_points: 40 }).in('id', [rede!.procedureId, procB])
    const { data: pl, error } = await db().from('treatment_plans').insert({
      branch_id: rede!.branchId, professional_id: rede!.professionalId, client_id: cliente, status: 'PROPOSED', name: `${PREFIXO} Plano ${marca}`,
    }).select('id').single<{ id: string }>()
    expect(error).toBeNull()
    const { data: s } = await db().from('treatment_plan_sessions').insert([{ plan_id: pl!.id, sort_order: 0 }, { plan_id: pl!.id, sort_order: 1 }]).select('id, sort_order')
    const [s1, s2] = (s ?? []).sort((a, b) => a.sort_order - b.sort_order)
    await db().from('treatment_plan_session_procedures').insert([
      { session_id: s1!.id, procedure_id: rede!.procedureId, price: 300, sort_order: 0 },
      { session_id: s2!.id, procedure_id: procB, price: 100, sort_order: 0 },
    ])

    await comSessao(browser, async p => {
      const r = await chamarAcao(p, 'actions/treatment-plans.ts', 'checkoutTreatmentPlan', `/admin/checkout/${pl!.id}`,
        [pl!.id, { forma: 'AVISTA', metodo: 'PIX' }, [], slug, { tipo: 'PERCENTUAL', valor: 10 }])
      expect(r.texto, 'o checkout passa').toContain('transactionId')
    })

    const { data: procs } = await db().from('treatment_plan_session_procedures').select('price, preco_tabela, procedure_id').in('session_id', [s1!.id, s2!.id])
    const por = (id: string) => procs!.find(x => x.procedure_id === id)!
    expect([n(por(rede!.procedureId).price), n(por(rede!.procedureId).preco_tabela)]).toEqual([270, 300])
    expect([n(por(procB).price), n(por(procB).preco_tabela)]).toEqual([90, 100])
    const { data: plano } = await db().from('treatment_plans').select('desconto, desconto_por, status').eq('id', pl!.id).single()
    expect({ desconto: n(plano!.desconto), por: plano!.desconto_por, status: plano!.status })
      .toEqual({ desconto: 40, por: gestor!.userId, status: 'ACCEPTED' })
    const { data: txs } = await db().from('financial_transactions').select('amount, is_paid').eq('treatment_plan_id', pl!.id)
    expect((txs ?? []).map(t => [n(t.amount), t.is_paid])).toEqual([[360, true]])
    // Pago inteiro (360 de 360): os 2 × 40 pontos do plano.
    await expect.poll(async () => n((await db().rpc('saldo_de_pontos', { p_cliente: cliente, p_unidade: null })).data)).toBe(80)
  })

  test('plano: a função recusa rateio que não fecha e preço acima do de antes', async () => {
    const cliente = await rede!.criarCliente('Plano recusa')
    const { data: pl } = await db().from('treatment_plans').insert({
      branch_id: rede!.branchId, professional_id: rede!.professionalId, client_id: cliente, status: 'PROPOSED', name: `${PREFIXO} Plano R ${marca}`,
    }).select('id').single<{ id: string }>()
    const { data: s } = await db().from('treatment_plan_sessions').insert({ plan_id: pl!.id, sort_order: 0 }).select('id').single<{ id: string }>()
    const { data: pr } = await db().from('treatment_plan_session_procedures').insert([
      { session_id: s!.id, procedure_id: rede!.procedureId, price: 300, sort_order: 0 },
      { session_id: s!.id, procedure_id: procB, price: 100, sort_order: 1 },
    ]).select('id, price')
    const [a, b] = (pr ?? []).sort((x, y) => n(y.price) - n(x.price))
    const aplicar = (desconto: number, precos: [number, number]) => db().rpc('plano_aplicar_desconto', {
      p_plano: pl!.id, p_tenant: rede!.tenantId, p_ator: null, p_desconto: desconto,
      p_precos: [{ id: a!.id, preco: precos[0] }, { id: b!.id, preco: precos[1] }],
    })
    expect((await aplicar(40, [270, 80])).error?.message).toMatch(/não fecha/)
    expect((await aplicar(40, [310, 50])).error?.message).toMatch(/acima do preço/)
    expect((await aplicar(500, [0, 0])).error?.message).toMatch(/maior que o valor/)
    const outra = await criarOutraRede(`vdo${marca}`)
    try {
      const { error } = await db().rpc('plano_aplicar_desconto', {
        p_plano: pl!.id, p_tenant: outra.tenantId, p_ator: null, p_desconto: 0, p_precos: [],
      })
      expect(error?.message, 'outra rede não mexe no plano').toMatch(/não encontrado/)
    } finally { await outra.limpar() }
    // Aplicar de novo parte do preço de antes: 10% duas vezes dá o mesmo, e 0 desfaz.
    expect((await aplicar(40, [270, 90])).error).toBeNull()
    expect((await aplicar(40, [270, 90])).error).toBeNull()
    expect((await aplicar(0, [300, 100])).error).toBeNull()
    const { data: depois } = await db().from('treatment_plan_session_procedures').select('price').eq('session_id', s!.id)
    expect((depois ?? []).map(x => n(x.price)).sort((x, y) => y - x)).toEqual([300, 100])
  })

  test('recepção pela tela: desconto de R$ 50 no avulso — recebe 150 e a comissão sai sobre o vendido', async ({ browser }) => {
    const cliente = await rede!.criarCliente('Avulso')
    const { data: ap } = await db().from('appointments').insert({
      branch_id: rede!.branchId, client_id: cliente, professional_id: rede!.professionalId, procedure_id: rede!.procedureId,
      scheduled_at: new Date().toISOString(), duration_min: 30, price: 200, status: 'IN_PROGRESS',
    }).select('id').single<{ id: string }>()
    const { error: eFim } = await db().rpc('concluir_atendimento', {
      p_agendamento: ap!.id, p_tenant: rede!.tenantId, p_ator: null, p_ator_nome: null,
      p_dados: { comissoes: [{
        procedure_id: rede!.procedureId, origem: 'AVULSO', treatment_plan_id: null,
        regra_tipo: 'PERCENTAGE', regra_valor: 10, preco: 200,
      }], insumos: [] },
    })
    expect(eFim, 'concluir o atendimento').toBeNull()

    await comSessao(browser, async p => {
      await p.goto(`/admin/agenda/${ap!.id}`)
      await p.getByRole('button', { name: 'Confirmar pagamento' }).click()
      await p.getByLabel('Desconto', { exact: true }).fill('50')
      await expect(p.getByTestId('total-a-receber')).toContainText('150,00')
      await p.locator('select[name="payment_method"]').selectOption('PIX')
      await p.locator('form').getByRole('button', { name: 'Confirmar pagamento' }).click()
      await expect.poll(async () => (await db().from('financial_transactions').select('is_paid').eq('appointment_id', ap!.id).maybeSingle()).data?.is_paid,
        { message: 'o pagamento é gravado' }).toBe(true)
    })
    const { data: t } = await db().from('financial_transactions').select('amount, sale_discount, loyalty_discount').eq('appointment_id', ap!.id).single()
    expect({ amount: n(t!.amount), venda: n(t!.sale_discount), pontos: n(t!.loyalty_discount) }).toEqual({ amount: 150, venda: 50, pontos: 0 })
    const comissao = ((await db().from('commissions').select('amount').eq('appointment_id', ap!.id)).data ?? [])
      .reduce((s, c) => Math.round((s + n(c.amount)) * 100) / 100, 0)
    expect(comissao, '10% de 150, não de 200').toBe(15)
    const { data: hist } = await db().from('appointment_history').select('description').eq('appointment_id', ap!.id).eq('action', 'PAYMENT_CONFIRMED')
    expect(hist?.[0]?.description).toMatch(/desconto de R\$ 50,00/)
  })

  test('recepção: a função recusa desconto maior que o atendimento', async () => {
    const cliente = await rede!.criarCliente('Avulso recusa')
    const { data: ap } = await db().from('appointments').insert({
      branch_id: rede!.branchId, client_id: cliente, professional_id: rede!.professionalId, procedure_id: rede!.procedureId,
      scheduled_at: new Date().toISOString(), duration_min: 30, price: 100, status: 'COMPLETED',
    }).select('id').single<{ id: string }>()
    const pagar = (dados: Record<string, unknown>) => db().rpc('confirmar_pagamento_do_atendimento', {
      p_agendamento: ap!.id, p_tenant: rede!.tenantId, p_ator: null, p_ator_nome: null, p_dados: dados,
    })
    expect((await pagar({ metodo: 'PIX', valor_final: -20, desconto_venda: 120 })).error?.message).toMatch(/inválidos/)
    expect((await pagar({ metodo: 'PIX', valor_final: 80, desconto_venda: 10 })).error?.message).toMatch(/não fecham/)
    expect((await db().from('financial_transactions').select('id').eq('appointment_id', ap!.id)).data).toEqual([])
  })
})
