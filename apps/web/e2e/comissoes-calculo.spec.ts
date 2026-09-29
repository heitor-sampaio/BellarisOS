import { test, expect, type Browser } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * Comissões, fase 2 (2026-09-30): uma LINHA por procedimento executado e o
 * EXTRATO acertado por `comissao_acertar_linha` — na conclusão, no pagamento,
 * no recebimento do plano (gatilho) e no estorno.
 *
 * Numa rede [e2e] própria: a configuração de comissões é da rede. A conta
 * (`comissao_alvo`) é do banco, então os casos de modo, taxa e insumo vão
 * direto às funções (`concluir_atendimento`, `confirmar_pagamento_do_atendimento`,
 * `estornar_transacao`); plano e pacote passam pela TELA, que é onde a base de
 * cada procedimento é lida no servidor (`linhasDoAtendimento`).
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let gestor: MembroDeTeste | null = null
let cliente = ''
const proc: Record<'A' | 'B' | 'C', string> = { A: '', B: '', C: '' }

test.beforeAll(async () => {
  rede = await criarOutraRede(`cc${marca}`)
  proc.A = rede.procedureId
  for (const k of ['B', 'C'] as const) {
    const { data, error } = await db().from('procedures').insert({
      tenant_id: rede.tenantId, name: `${PREFIXO} Proc ${k} ${marca}`, category: 'e2e', duration_min: 30, price: 0,
    }).select('id').single<{ id: string }>()
    expect(error).toBeNull()
    proc[k] = data!.id
  }
  await db().from('users').update({ provides_services: true }).eq('id', rede.professionalId)
  // Padrão 10%; exceção do B: R$ 50 fixo.
  const { error: eR } = await db().from('commission_rules').insert([
    { tenant_id: rede.tenantId, professional_id: rede.professionalId, procedure_id: null, type: 'PERCENTAGE', value: 10, is_active: true },
    { tenant_id: rede.tenantId, professional_id: rede.professionalId, procedure_id: proc.B, type: 'FIXED_AMOUNT', value: 50, is_active: true },
  ])
  expect(eR).toBeNull()
  cliente = await rede.criarCliente('Comissão')
  gestor = await criarMembro(`ccg${marca}`, {
    tenant: rede.tenantId, rotulo: 'Atende comissões',
    permissoes: [
      { modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'MANAGE' },
      { modulo: 'medical_records', nivel: 'MANAGE' }, { modulo: 'stock', nivel: 'VIEW' },
      { modulo: 'procedures', nivel: 'VIEW' }, { modulo: 'cashier', nivel: 'MANAGE' },
    ],
  })
})

test.afterAll(async () => {
  if (gestor) await gestor.limpar()
  if (rede) {
    // O pacote do cliente aponta para o pacote da rede: sai antes dele.
    const falhas: string[] = []
    const { data: cps } = await db().from('client_packages').select('id').eq('client_id', cliente)
    const ids = (cps ?? []).map(c => c.id as string)
    if (ids.length) {
      const r1 = await db().from('package_sessions').delete().in('client_package_id', ids)
      if (r1.error) falhas.push(`sessões de pacote: ${r1.error.message}`)
      const r2 = await db().from('client_packages').delete().in('id', ids)
      if (r2.error) falhas.push(`pacotes do cliente: ${r2.error.message}`)
    }
    const r3 = await db().from('service_packages').delete().eq('tenant_id', rede.tenantId)
    if (r3.error) falhas.push(`pacotes: ${r3.error.message}`)
    await rede.limpar()
    expect(falhas).toEqual([])
  }
})

async function configurar(cfg: Record<string, unknown>) {
  const { error } = await db().from('commission_configs').upsert({
    tenant_id: rede!.tenantId, modo: 'ATENDIMENTO', desconta_insumos: false, desconta_taxa: false,
    base_com_pontos: 'PRECO', periodo: 'MENSAL', ...cfg,
  }, { onConflict: 'tenant_id' })
  expect(error).toBeNull()
}
async function taxas(lista: { metodo: string; parcelas: number; taxa_pct: number }[]) {
  const { error } = await db().rpc('comissao_taxas_definir', { p_tenant: rede!.tenantId, p_taxas: lista })
  expect(error).toBeNull()
}
async function atendimento(preco: number, extra: Record<string, unknown> = {}) {
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: cliente, professional_id: rede!.professionalId, procedure_id: proc.A,
    scheduled_at: new Date().toISOString(), duration_min: 30, price: preco, status: 'IN_PROGRESS', source: 'INTERNAL', ...extra,
  }).select('id').single<{ id: string }>()
  expect(error, 'criar o atendimento').toBeNull()
  return data!.id
}
async function concluir(ap: string, preco: number, insumos: unknown[] = []) {
  const { error } = await db().rpc('concluir_atendimento', {
    p_agendamento: ap, p_tenant: rede!.tenantId, p_ator: null, p_ator_nome: null,
    p_dados: { insumos, comissoes: [{ procedure_id: proc.A, origem: 'AVULSO', treatment_plan_id: null, regra_tipo: 'PERCENTAGE', regra_valor: 10, preco }] },
  })
  expect(error, 'concluir').toBeNull()
}
async function pagar(ap: string, preco: number, metodo: string) {
  const { data, error } = await db().rpc('confirmar_pagamento_do_atendimento', {
    p_agendamento: ap, p_tenant: rede!.tenantId, p_ator: null, p_ator_nome: null,
    p_dados: { metodo, pontos: 0, desconto: 0, valor_final: preco },
  })
  expect(error, 'pagar').toBeNull()
  return data as string
}
async function estornar(tx: string) {
  const { error } = await db().rpc('estornar_transacao', { p_transacao: tx, p_tenant: rede!.tenantId, p_ator: 'e2e' })
  expect(error, 'estornar').toBeNull()
}
/** O extrato de um atendimento, na ordem: [tipo, valor]. */
async function extrato(ap: string) {
  const { data } = await db().from('commissions').select('kind, amount, released_at, line_id')
    .eq('appointment_id', ap).order('released_at').order('amount', { ascending: false })
  return (data ?? []).map(c => [c.kind as string, Number(c.amount)] as const)
}
/** Quanto cada procedimento do atendimento deve, somado o extrato. */
async function porProcedimento(ap: string) {
  const { data: linhas } = await db().from('commission_lines').select('id, procedure_id').eq('appointment_id', ap)
  const saida: Record<string, number> = {}
  for (const l of linhas ?? []) {
    const { data } = await db().from('commissions').select('amount').eq('line_id', l.id)
    saida[l.procedure_id as string] = Math.round((data ?? []).reduce((s, c) => s + Number(c.amount), 0) * 100) / 100
  }
  return saida
}

async function finalizarPelaTela(browser: Browser, ap: string) {
  const ctx = await browser.newContext({ storageState: gestor!.estado })
  try {
    const p = await ctx.newPage()
    await p.goto(`/admin/agenda/${ap}`)
    await p.getByRole('button', { name: 'Finalizar atendimento' }).click()
    await p.locator('textarea[name="notes"]').fill(`${PREFIXO} comissão`)
    await p.getByRole('button', { name: 'Confirmar conclusão' }).click()
    await expect.poll(async () => (await db().from('appointments').select('status').eq('id', ap).single()).data?.status,
      { message: 'a tela conclui', timeout: 20_000 }).toBe('COMPLETED')
  } finally { await ctx.close() }
}

test.describe.serial('comissões — cálculo e extrato', () => {
  test('no atendimento: nasce na conclusão; a taxa vira ajuste no pagamento; o estorno desfaz', async () => {
    await configurar({ modo: 'ATENDIMENTO', desconta_taxa: true })
    await taxas([{ metodo: 'PIX', parcelas: 1, taxa_pct: 2 }])
    const ap = await atendimento(200)
    await concluir(ap, 200)
    expect(await extrato(ap)).toEqual([['LIBERACAO', 20]])

    const tx = await pagar(ap, 200, 'PIX')
    // (200 − 2% de taxa) × 10% = 19,60.
    expect(await extrato(ap)).toEqual([['LIBERACAO', 20], ['AJUSTE', -0.4]])

    await estornar(tx)
    expect(await extrato(ap)).toEqual([['LIBERACAO', 20], ['AJUSTE', -0.4], ['ESTORNO', -19.6]])

    // Concluído não se cancela (o gatilho), e o extrato não muda.
    const { error } = await db().from('appointments').update({ status: 'CANCELLED' }).eq('id', ap)
    expect(error?.message).toMatch(/não pode ser cancelado/)
  })

  test('quando o cliente paga: nada na conclusão; libera no pagamento sem taxa e sem insumos', async () => {
    await configurar({ modo: 'PAGAMENTO', desconta_taxa: true, desconta_insumos: true })
    await taxas([{ metodo: 'CREDIT_CARD', parcelas: 1, taxa_pct: 3 }])
    const produto = await rede!.criarProduto('insumo', 10)
    const ap = await atendimento(200)
    // 2 unidades a R$ 5: R$ 10 de insumo.
    await concluir(ap, 200, [{ produto, quantidade: -2, saldo_apos: 8, embalagens: 8, rendimento: null, custo: 5, minimo: 0 }])
    expect(await extrato(ap), 'no modo "quando paga" a conclusão não libera nada').toEqual([])
    const { data: linha } = await db().from('commission_lines').select('modo, custo_insumos').eq('appointment_id', ap).single()
    expect({ modo: linha!.modo, custo: Number(linha!.custo_insumos) }).toEqual({ modo: 'PAGAMENTO', custo: 10 })

    await pagar(ap, 200, 'CREDIT_CARD')
    // (200 − 3% = 194 − 10 de insumo) × 10% = 18,40.
    expect(await extrato(ap)).toEqual([['LIBERACAO', 18.4]])
  })

  test('mudar a configuração depois não reescreve o atendimento já concluído', async () => {
    await configurar({ modo: 'ATENDIMENTO' })
    const ap = await atendimento(100)
    await concluir(ap, 100)
    await configurar({ modo: 'PAGAMENTO', desconta_taxa: true })
    await pagar(ap, 100, 'CREDIT_CARD')
    // A linha guardou "no atendimento, sem taxa": o pagamento não mexe.
    expect(await extrato(ap)).toEqual([['LIBERACAO', 10]])
  })

  test('plano, quando o cliente paga: cada procedimento com a sua regra, na proporção do recebido', async ({ browser }) => {
    await configurar({ modo: 'PAGAMENTO' })
    const b = db()
    const { data: plano, error: eP } = await b.from('treatment_plans').insert({
      client_id: cliente, branch_id: rede!.branchId, professional_id: rede!.professionalId, status: 'ACCEPTED', name: `${PREFIXO} Plano ${marca}`,
    }).select('id').single<{ id: string }>()
    expect(eP).toBeNull()
    const { data: sessoes } = await b.from('treatment_plan_sessions').insert([
      { plan_id: plano!.id, sort_order: 0 }, { plan_id: plano!.id, sort_order: 1 },
    ]).select('id, sort_order')
    const [s1, s2] = (sessoes ?? []).sort((x, y) => x.sort_order - y.sort_order)
    // Total do plano: 600 + 400 + 1000 = R$ 2.000.
    const { error: eSp } = await b.from('treatment_plan_session_procedures').insert([
      { session_id: s1!.id, procedure_id: proc.A, price: 600, sort_order: 0 },
      { session_id: s1!.id, procedure_id: proc.B, price: 400, sort_order: 1 },
      { session_id: s2!.id, procedure_id: proc.C, price: 1000, sort_order: 0 },
    ])
    expect(eSp).toBeNull()
    const receber = async (valor: number) => (await b.from('financial_transactions').insert({
      branch_id: rede!.branchId, client_id: cliente, treatment_plan_id: plano!.id, type: 'INCOME', category: 'Serviços',
      description: `${PREFIXO} plano`, amount: valor, payment_method: 'PIX', is_paid: true, paid_at: new Date().toISOString(), created_by: 'e2e',
    }).select('id').single<{ id: string }>()).data!.id
    await receber(500)

    // O preço do agendamento é o da SESSÃO (R$ 1.000): não é a base de ninguém.
    const ap = await atendimento(1000, { treatment_plan_id: plano!.id })
    await b.from('treatment_plan_sessions').update({ appointment_id: ap }).eq('id', s1!.id)
    await finalizarPelaTela(browser, ap)

    // Recebido 500 de 2.000 = 25%. A: 10% de 600 = 60 → 15. B: R$ 50 fixo → 12,50.
    expect(await porProcedimento(ap)).toEqual({ [proc.A]: 15, [proc.B]: 12.5 })

    // A parcela seguinte completa (o gatilho do recebimento).
    const segunda = await receber(1500)
    expect(await porProcedimento(ap)).toEqual({ [proc.A]: 60, [proc.B]: 50 })

    // Estornar a parcela volta à proporção de antes.
    await estornar(segunda)
    expect(await porProcedimento(ap)).toEqual({ [proc.A]: 15, [proc.B]: 12.5 })
    const tipos = (await extrato(ap)).map(([k]) => k)
    expect(tipos.filter(k => k === 'ESTORNO')).toHaveLength(2)
  })

  test('sessão de pacote: a base é o preço do pacote ÷ sessões, lido no servidor', async ({ browser }) => {
    await configurar({ modo: 'PAGAMENTO' })
    const b = db()
    const { data: sp } = await b.from('service_packages').insert({
      tenant_id: rede!.tenantId, procedure_id: proc.A, name: `${PREFIXO} Pacote ${marca}`, total_sessions: 3, price: 300,
    }).select('id').single<{ id: string }>()
    const { data: cp } = await b.from('client_packages').insert({
      client_id: cliente, package_id: sp!.id, branch_id: rede!.branchId, total_sessions: 3, used_sessions: 0,
    }).select('id').single<{ id: string }>()
    // O preço gravado no agendamento (o que o navegador mandou) é outro.
    const ap = await atendimento(999)
    await b.from('package_sessions').insert({ client_package_id: cp!.id, appointment_id: ap, status: 'AVAILABLE', session_number: 1 })
    await finalizarPelaTela(browser, ap)

    // R$ 300 ÷ 3 = 100; 10% = 10 — e o pacote já foi pago: libera mesmo no modo "quando paga".
    expect(await extrato(ap)).toEqual([['LIBERACAO', 10]])
    const { data: linha } = await b.from('commission_lines').select('origem, preco').eq('appointment_id', ap).single()
    expect({ origem: linha!.origem, preco: Number(linha!.preco) }).toEqual({ origem: 'PACOTE', preco: 100 })
  })
})
