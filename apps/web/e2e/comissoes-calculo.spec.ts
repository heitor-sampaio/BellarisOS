import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { responderAnamnese } from './apoio/anamnese'

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
  // A ficha de saúde respondida (as obrigatórias): desde a revisão do Heitor de
  // 2026-10-29, a obrigatória sem resposta barra o "Finalizar atendimento".
  await responderAnamnese(cliente, rede.tenantId)
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
    tenant_id: rede!.tenantId, desconta_insumos: false, desconta_taxa: false,
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
  test('só com o pagamento integral (H4): nada na conclusão; o pagamento libera já com a taxa; o estorno desfaz', async () => {
    await configurar({ desconta_taxa: true })
    await taxas([{ metodo: 'PIX', parcelas: 1, taxa_pct: 2 }])
    const ap = await atendimento(200)
    await concluir(ap, 200)
    expect(await extrato(ap), 'concluído sem pagamento não libera').toEqual([])

    const tx = await pagar(ap, 200, 'PIX')
    // (200 − 2% de taxa) × 10% = 19,60.
    expect(await extrato(ap)).toEqual([['LIBERACAO', 19.6]])

    await estornar(tx)
    expect(await extrato(ap)).toEqual([['LIBERACAO', 19.6], ['ESTORNO', -19.6]])

    // Concluído não se cancela (o gatilho), e o extrato não muda.
    const { error } = await db().from('appointments').update({ status: 'CANCELLED' }).eq('id', ap)
    expect(error?.message).toMatch(/não pode ser cancelado/)
  })

  test('descontando taxa e insumos: nada na conclusão; libera no pagamento sem taxa e sem insumos', async () => {
    await configurar({ desconta_taxa: true, desconta_insumos: true })
    await taxas([{ metodo: 'CREDIT_CARD', parcelas: 1, taxa_pct: 3 }])
    const produto = await rede!.criarProduto('insumo', 10)
    // O custo do insumo é lido pelo banco, do cadastro (custo de consumo;
    // aqui a embalagem é a unidade) — o app não o manda mais (2026-10-27).
    const { error: eCusto } = await db().from('products').update({ cost_price: 5 }).eq('id', produto)
    expect(eCusto).toBeNull()
    const ap = await atendimento(200)
    // 2 unidades a R$ 5: R$ 10 de insumo.
    await concluir(ap, 200, [{ produto, quantidade: -2, saldo_apos: 8, embalagens: 8, rendimento: null, minimo: 0 }])
    expect(await extrato(ap), 'sem o pagamento integral a conclusão não libera nada').toEqual([])
    const { data: linha } = await db().from('commission_lines').select('modo, custo_insumos').eq('appointment_id', ap).single()
    expect({ modo: linha!.modo, custo: Number(linha!.custo_insumos) }).toEqual({ modo: 'INTEGRAL', custo: 10 })

    await pagar(ap, 200, 'CREDIT_CARD')
    // (200 − 3% = 194 − 10 de insumo) × 10% = 18,40.
    expect(await extrato(ap)).toEqual([['LIBERACAO', 18.4]])
    // Liberada pelo pagamento: o fato vai para a corrente (sai do banco).
    const { data: liberada } = await db().from('domain_events').select('dados, origem').eq('nome', 'comissao.liberada').eq('entidade_id', ap)
    expect((liberada ?? []).map(e => [Number(e.dados?.valor), e.origem])).toEqual([[18.4, 'banco']])
  })

  test('cartão de crédito em 3x: pago na hora, com a taxa da faixa de 3x (2026-10-20)', async () => {
    // A maquininha paga a clínica: o lançamento nasce PAGO, e as vezes ficam
    // nele para a taxa — antes o único jeito era "entrada + parcelas", a receber.
    await configurar({ desconta_taxa: true })
    await taxas([{ metodo: 'CREDIT_CARD', parcelas: 1, taxa_pct: 3 }, { metodo: 'CREDIT_CARD', parcelas: 3, taxa_pct: 6 }])
    const ap = await atendimento(200)
    await concluir(ap, 200)
    const { data: tx, error } = await db().rpc('confirmar_pagamento_do_atendimento', {
      p_agendamento: ap, p_tenant: rede!.tenantId, p_ator: null, p_ator_nome: null,
      p_dados: { metodo: 'CREDIT_CARD', cartao_vezes: 3, pontos: 0, desconto: 0, valor_final: 200 },
    })
    expect(error, 'pagar em 3x').toBeNull()
    const { data: l } = await db().from('financial_transactions').select('is_paid, cartao_vezes').eq('id', tx as string).single()
    expect(l, 'um lançamento só, pago, com as vezes').toEqual({ is_paid: true, cartao_vezes: 3 })
    // (200 − 6% da faixa de 3x) × 10% = 18,80.
    expect(await extrato(ap)).toEqual([['LIBERACAO', 18.8]])

    // Vezes fora do crédito ou fora de 1–12: recusado.
    const ap2 = await atendimento(100)
    await concluir(ap2, 100)
    const { error: ePix } = await db().rpc('confirmar_pagamento_do_atendimento', {
      p_agendamento: ap2, p_tenant: rede!.tenantId, p_ator: null, p_ator_nome: null,
      p_dados: { metodo: 'PIX', cartao_vezes: 3, pontos: 0, desconto: 0, valor_final: 100 },
    })
    expect(ePix?.message).toMatch(/só no cartão de crédito/)
  })

  test('mudar a configuração depois não reescreve o atendimento já concluído', async () => {
    await configurar({})
    const ap = await atendimento(100)
    await concluir(ap, 100)
    await configurar({ desconta_taxa: true })
    await pagar(ap, 100, 'CREDIT_CARD')
    // A linha guardou "sem taxa": a configuração nova não a reescreve.
    expect(await extrato(ap)).toEqual([['LIBERACAO', 10]])
  })

  test('plano: cada procedimento com a sua regra, só com o plano pago inteiro (H4)', async ({ browser }) => {
    await configurar({})
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

    // Recebido 500 de 2.000: o plano não está pago — nada ainda (era 25%, na proporção).
    expect(await porProcedimento(ap)).toEqual({ [proc.A]: 0, [proc.B]: 0 })

    // A parcela que quita libera tudo (o gatilho do recebimento). A: 10% de 600 = 60. B: R$ 50 fixo.
    const segunda = await receber(1500)
    expect(await porProcedimento(ap)).toEqual({ [proc.A]: 60, [proc.B]: 50 })
    // Um `comissao.liberada` por PROCEDIMENTO (a chave é por lançamento).
    const { data: liberadas } = await db().from('domain_events').select('dados').eq('nome', 'comissao.liberada').eq('entidade_id', ap)
    expect((liberadas ?? []).map(e => Number(e.dados?.valor)).sort((x, y) => x - y)).toEqual([50, 60])

    // Estornar a parcela tira a quitação: volta a aguardar.
    await estornar(segunda)
    expect(await porProcedimento(ap)).toEqual({ [proc.A]: 0, [proc.B]: 0 })
    const tipos = (await extrato(ap)).map(([k]) => k)
    expect(tipos.filter(k => k === 'ESTORNO')).toHaveLength(2)
  })

  test('sessão de pacote: a base é o preço do pacote ÷ sessões, lido no servidor', async ({ browser }) => {
    await configurar({})
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

    // R$ 300 ÷ 3 = 100; 10% = 10 — pacote de antes da venda no sistema (sem
    // preço vendido nem lançamento): libera na conclusão, como sempre.
    expect(await extrato(ap)).toEqual([['LIBERACAO', 10]])
    const { data: linha } = await b.from('commission_lines').select('origem, preco').eq('appointment_id', ap).single()
    expect({ origem: linha!.origem, preco: Number(linha!.preco) }).toEqual({ origem: 'PACOTE', preco: 100 })
  })
})

// O cancelamento do pacote acerta a comissão de venda UMA vez, com o dinheiro do fim; a
// escolha "Descontar a taxa da maquininha" do procedimento (o Heitor, 18/11, ao item 11:
// "ok") vence a da rede na linha do atendimento; e cada lançamento retrata a base da hora
// dele (decisão do Claude, 18/11, princípio 3). Numa rede [e2e] própria, de uma unidade.
test.describe('o cancelamento do pacote, a taxa por procedimento e o retrato da base da comissão (comissoes.md)', () => {
  const n = (v: unknown) => Number(v ?? 0)
  const centavos = (v: number) => Math.round(v * 100) / 100
  let rede: OutraRede | null = null
  let dona: MembroDeTeste | null = null
  let cliente = ''
  let proc = ''
  let pacote = ''

  async function como(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<void>) {
    const ctx = await browser.newContext({ storageState: m.estado })
    try { await fn(await ctx.newPage()) } finally { await ctx.close() }
  }

  test.beforeAll(async () => {
    test.setTimeout(150_000)
    rede = await criarOutraRede(`ccr${marca}`)
    const b = db()
    expect((await b.from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
    dona = await criarMembro(`ccrd${marca}`, { tenant: rede.tenantId, donoDaRede: true, rotulo: 'Dona', permissoes: [] })
    proc = rede.procedureId
    expect((await b.from('procedures').update({ name: `${PREFIXO} Limpeza ${marca}`, price: 500 }).eq('id', proc)).error).toBeNull()
    cliente = await rede.criarCliente('Cancelou o pacote')
    await responderAnamnese(cliente, rede.tenantId)
    expect((await b.from('users').update({ provides_services: true }).eq('id', rede.professionalId)).error).toBeNull()
    const { data, error } = await b.rpc('pacote_salvar', {
      p_tenant: rede.tenantId, p_id: null, p_nome: `${PREFIXO} Pacote 2 limpezas ${marca}`, p_preco: 1000, p_validade: null, p_ativo: true,
      p_itens: [{ procedure_id: proc, quantity: 2 }],
      p_comissao: { venda: { tipo: 'PERCENTAGE', valor: 10 }, execucao: { tipo: 'PERCENTAGE', valor: 10 } },
    })
    expect(error, 'criar o pacote').toBeNull()
    pacote = data as string
  })

  test.afterAll(async () => {
    await dona?.limpar()
    await rede?.limpar()
  })

  test('o pacote cancelado acerta a comissão de venda uma vez, com o dinheiro do fim', async () => {
    const b = db()
    // Vendido no crédito (R$ 1.000), 1 de 2 sessões feita (usado R$ 500).
    const { data: cp, error: eV } = await b.rpc('pacote_vender', {
      p_tenant: rede!.tenantId, p_cliente: cliente, p_pacote: pacote, p_unidade: rede!.branchId, p_ator: dona!.userId,
      p_lancamentos: [{ amount: 1000, payment_method: 'CREDIT_CARD', is_paid: true, cartao_vezes: 1 }],
      p_sessoes: Array.from({ length: 2 }, () => ({ procedure_id: proc, preco: 500 })),
    })
    expect(eV, 'vender o pacote').toBeNull()
    const { data: ap, error: eA } = await b.from('appointments').insert({
      branch_id: rede!.branchId, client_id: cliente, professional_id: rede!.professionalId, procedure_id: proc,
      scheduled_at: new Date().toISOString(), duration_min: 30, price: 500, status: 'IN_PROGRESS', source: 'INTERNAL',
    }).select('id').single<{ id: string }>()
    expect(eA).toBeNull()
    expect((await b.from('package_sessions').update({ appointment_id: ap!.id }).eq('client_package_id', cp as string).eq('session_number', 1)).error).toBeNull()
    expect((await b.rpc('concluir_atendimento', {
      p_agendamento: ap!.id, p_tenant: rede!.tenantId, p_ator: null, p_ator_nome: null,
      p_dados: { insumos: [], comissoes: [{ procedure_id: proc, origem: 'PACOTE', treatment_plan_id: null, regra_tipo: 'PERCENTAGE', regra_valor: 10, preco: 500 }] },
    })).error, 'concluir a sessão').toBeNull()

    const { data: linha } = await b.from('commission_lines').select('id')
      .eq('client_package_id', cp as string).is('appointment_id', null).single<{ id: string }>()
    const antes = ((await b.from('commissions').select('id').eq('line_id', linha!.id)).data ?? []).map(c => c.id as string)

    // Cancelar: o cartão volta inteiro, e o usado (R$ 500) entra no Pix.
    const { error: eC } = await b.rpc('pacote_cancelar_devolvendo', {
      p_tenant: rede!.tenantId, p_pacote: cp, p_ator: dona!.userId, p_ator_nome: 'e2e', p_motivo: 'desistiu', p_destino: 'ESTORNO',
      p_agendamentos: null, p_esperado: 500, p_simular: false, p_estorno: 'INTEIRO', p_novo: { metodo: 'PIX' },
    })
    expect(eC, 'cancelar estornando o cartão inteiro').toBeNull()

    const { data: todas } = await b.from('commissions').select('id, amount, kind, motivo, transaction_id').eq('line_id', linha!.id)
    const novas = (todas ?? []).filter(c => !antes.includes(c.id as string))
    expect(novas.map(c => c.motivo), 'um lançamento só, o do cancelamento').toEqual(['Cancelamento do pacote'])
    expect(centavos((todas ?? []).reduce((s, c) => s + n(c.amount), 0)), 'a venda: 10% do usado').toBe(50)
    const { data: usado } = await b.from('financial_transactions').select('id')
      .eq('client_package_id', cp as string).eq('type', 'INCOME').eq('payment_method', 'PIX').eq('is_paid', true).single<{ id: string }>()
    expect(novas[0]!.transaction_id, 'ligado ao "usado" que o cancelamento lançou').toBe(usado!.id)
  })

  test('a escolha "Descontar a taxa da maquininha" do procedimento vence a da rede na linha do atendimento', async ({ browser }) => {
    // O Heitor, 18/11, ao item 11: "ok".
    const b = db()
    // A rede não desconta; o procedimento passa a descontar.
    expect((await b.from('commission_configs').upsert({ tenant_id: rede!.tenantId, desconta_taxa: false }, { onConflict: 'tenant_id' })).error).toBeNull()
    const definir = (escolha: string | null) => b.rpc('comissao_do_procedimento_definir', {
      p_tenant: rede!.tenantId, p_procedimento: proc, p_geral: { tipo: 'PERCENTAGE', valor: 10 }, p_profissionais: [],
      p_ator: null, p_desconta_taxa: escolha,
    })
    expect((await definir('SIM')).error, 'gravar "Desconta a taxa"').toBeNull()
    expect((await b.from('procedures').select('desconta_taxa').eq('id', proc).single()).data?.desconta_taxa).toBe(true)
    expect((await definir('TALVEZ')).error, 'só as três escolhas').not.toBeNull()
    try {
      const quem = await rede!.criarCliente('Taxa do procedimento')
      await responderAnamnese(quem, rede!.tenantId)
      const concluir = async () => {
        const { data: ap, error } = await b.from('appointments').insert({
          branch_id: rede!.branchId, client_id: quem, professional_id: rede!.professionalId, procedure_id: proc,
          scheduled_at: new Date().toISOString(), duration_min: 30, price: 500, status: 'IN_PROGRESS', source: 'INTERNAL',
        }).select('id').single<{ id: string }>()
        expect(error).toBeNull()
        expect((await b.rpc('concluir_atendimento', {
          p_agendamento: ap!.id, p_tenant: rede!.tenantId, p_ator: null, p_ator_nome: null,
          p_dados: { insumos: [], comissoes: [{ procedure_id: proc, origem: 'AVULSO', treatment_plan_id: null, regra_tipo: 'PERCENTAGE', regra_valor: 10, preco: 500 }] },
        })).error, 'concluir').toBeNull()
        return (await b.from('commission_lines').select('desconta_taxa').eq('appointment_id', ap!.id).single()).data?.desconta_taxa
      }
      expect(await concluir(), 'o procedimento desconta: a linha retrata').toBe(true)

      // A tela diz a escolha, e o "Como a rede" diz o que a rede faz.
      await como(browser, dona!, async p => {
        await p.goto('/admin/procedures')
        await p.locator(`[data-comissao-procedimento="${proc}"]`).click()
        const dlg = p.getByRole('dialog')
        await expect(dlg.locator('[data-taxa-do-procedimento="SIM"]')).toBeVisible()
      })

      expect((await definir('REDE')).error).toBeNull()
      expect((await b.from('procedures').select('desconta_taxa').eq('id', proc).single()).data?.desconta_taxa).toBeNull()
      expect(await concluir(), '"Como a rede": a da rede (não desconta)').toBe(false)
    } finally {
      await definir('REDE')
      await b.from('commission_rules').delete().eq('procedure_id', proc).is('professional_id', null)
    }
  })

  test('cada lançamento retrata a base da hora dele: a liberação e o estorno dizem a base da liberação', async () => {
    // Decisão do Claude (18/11), princípio 3. Toda linha é INTEGRAL: a comissão de
    // venda se libera uma vez, com a venda inteira paga.
    const b = db()
    const { data: pac, error: eP } = await b.rpc('pacote_salvar', {
      p_tenant: rede!.tenantId, p_id: null, p_nome: `${PREFIXO} Pacote retrato ${marca}`, p_preco: 1000, p_validade: null, p_ativo: true,
      p_itens: [{ procedure_id: proc, quantity: 2 }],
      p_comissao: { venda: { tipo: 'PERCENTAGE', valor: 10 }, execucao: { tipo: 'NENHUMA', valor: null } },
    })
    expect(eP, 'criar o pacote').toBeNull()
    // A base sem a taxa; o Pix a 2%, o dinheiro sem taxa.
    expect((await b.from('commission_configs').upsert({ tenant_id: rede!.tenantId, desconta_taxa: true }, { onConflict: 'tenant_id' })).error).toBeNull()
    expect((await b.rpc('comissao_taxas_definir', { p_tenant: rede!.tenantId, p_taxas: [{ metodo: 'PIX', parcelas: 1, taxa_pct: 2 }] })).error).toBeNull()
    try {
      const quem = await rede!.criarCliente('Retrato da base')
      // A entrada de R$ 500 no dinheiro; a parcela de R$ 500 em aberto.
      const { data: cp, error: eV } = await b.rpc('pacote_vender', {
        p_tenant: rede!.tenantId, p_cliente: quem, p_pacote: pac as string, p_unidade: rede!.branchId, p_ator: dona!.userId,
        p_lancamentos: [
          { amount: 500, payment_method: 'CASH', is_paid: true },
          { amount: 500, payment_method: 'PIX', is_paid: false, parcela_numero: 1, parcela_total: 1 },
        ],
        p_sessoes: [{ procedure_id: proc, preco: 500 }, { procedure_id: proc, preco: 500 }],
      })
      expect(eV, 'vender no crediário').toBeNull()
      const { data: parcela } = await b.from('financial_transactions').select('id')
        .eq('client_package_id', cp as string).eq('is_paid', false).single<{ id: string }>()
      // A parcela paga no Pix: a venda inteira paga, a comissão se libera — 10% de 990 (a taxa média de 1%).
      expect((await b.from('financial_transactions').update({ is_paid: true, paid_at: new Date().toISOString() }).eq('id', parcela!.id)).error).toBeNull()
      // Depois, a parcela estornada: a comissão volta.
      expect((await b.rpc('estornar_transacao', { p_transacao: parcela!.id, p_tenant: rede!.tenantId, p_ator: 'e2e' })).error, 'estornar').toBeNull()

      const { data: linha } = await b.from('commission_lines').select('id, modo')
        .eq('client_package_id', cp as string).eq('origem', 'PACOTE_VENDA').single<{ id: string; modo: string }>()
      expect(linha!.modo).toBe('INTEGRAL')
      const { data: lanc } = await b.from('commissions').select('id, amount, kind, base_retrato').eq('line_id', linha!.id).order('released_at')
      expect((lanc ?? []).map(c => [c.kind, centavos(n(c.amount))]), 'a liberação e o estorno').toEqual([['LIBERACAO', 99], ['ESTORNO', -99]])

      const { data: ext, error: eExt } = await b.rpc('comissoes_extrato_com_regra', {
        p_tenant: rede!.tenantId, p_branch_ids: null, p_inicio: new Date(Date.now() - 86_400_000).toISOString(),
        p_fim: new Date(Date.now() + 86_400_000).toISOString(), p_profissional: null,
      })
      expect(eExt).toBeNull()
      const doExtrato = new Map(((ext ?? []) as { id: string; base: number; base_taxa: number }[]).map(l => [l.id, l]))
      const bases = (lanc ?? []).map(c => [n(doExtrato.get(c.id as string)?.base), n(doExtrato.get(c.id as string)?.base_taxa)])
      // Sem o retrato, as duas diriam a base de hoje (R$ 1.000: só o dinheiro ficou pago).
      expect(bases, 'as duas com a base da liberação').toEqual([[990, 10], [990, 10]])
    } finally {
      await b.from('commission_configs').update({ desconta_taxa: false }).eq('tenant_id', rede!.tenantId)
      await b.rpc('comissao_taxas_definir', { p_tenant: rede!.tenantId, p_taxas: [] })
    }
  })
})
