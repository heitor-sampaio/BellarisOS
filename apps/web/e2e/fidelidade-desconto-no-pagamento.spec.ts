import { test, expect } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * Fidelidade, fase 2 — pontos como desconto no pagamento
 * (migration 20260929000002, `confirmar_pagamento_do_atendimento`).
 *
 * `amount` é o dinheiro recebido; o desconto fica em `loyalty_discount`. A
 * recepção usa pontos pela tela; as tentativas de burlar vão direto à função do
 * banco, que é quem confere de verdade (config, teto, saldo, trava do cliente).
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let recepcao: MembroDeTeste | null = null

test.beforeAll(async () => {
  rede = await criarOutraRede(`fd${marca}`)
  recepcao = await criarMembro(`fdr${marca}`, {
    tenant: rede.tenantId, rotulo: 'Recepção pontos',
    permissoes: [{ modulo: 'agenda', nivel: 'VIEW' }, { modulo: 'cashier', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'VIEW' }],
  })
})
test.afterAll(async () => {
  if (recepcao) await recepcao.limpar()
  if (rede) await rede.limpar()
})

async function configurar(cfg: Record<string, unknown>) {
  const { error } = await db().from('loyalty_configs').upsert({
    tenant_id: rede!.tenantId, enabled: true, earn_mode: 'POR_REAL', points_per_real: 1,
    redeem_points_value: 0.1, redeem_min_points: 0, redeem_max_pct: 50, ...cfg,
  }, { onConflict: 'tenant_id' })
  expect(error, 'gravar a config').toBeNull()
}

/** A base da comissão com pontos mora na configuração de comissões (§9.7), e é
 *  retratada na linha quando o atendimento é concluído. */
async function comissaoSobre(base: 'PRECO' | 'VALOR_PAGO') {
  const { error } = await db().from('commission_configs')
    .upsert({ tenant_id: rede!.tenantId, base_com_pontos: base }, { onConflict: 'tenant_id' })
  expect(error, 'gravar a base da comissão').toBeNull()
}

async function dar(clientId: string, pontos: number) {
  const { error } = await db().rpc('ajustar_pontos', {
    p_tenant: rede!.tenantId, p_cliente: clientId, p_unidade: rede!.branchId, p_pontos: pontos, p_motivo: 'saldo do teste', p_ator: 'e2e',
  })
  expect(error, 'dar pontos').toBeNull()
}

/** Concluído pela função do banco, com uma comissão fixa — o que o
 *  `finishSession` faz, sem a tela. */
async function atendimentoConcluido(clientId: string, preco: number, comissao = 30) {
  const { data: ap, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: clientId, professional_id: rede!.professionalId, procedure_id: rede!.procedureId,
    scheduled_at: new Date().toISOString(), duration_min: 30, price: preco, status: 'IN_PROGRESS',
  }).select('id').single<{ id: string }>()
  expect(error, 'criar o atendimento').toBeNull()
  const { error: eFim } = await db().rpc('concluir_atendimento', {
    p_agendamento: ap!.id, p_tenant: rede!.tenantId, p_ator: null, p_ator_nome: null,
    p_dados: { comissoes: [{
      procedure_id: rede!.procedureId, origem: 'AVULSO', treatment_plan_id: null,
      regra_tipo: 'FIXED_AMOUNT', regra_valor: comissao, preco,
    }], insumos: [] },
  })
  expect(eFim, 'concluir o atendimento').toBeNull()
  return ap!.id
}

async function pagarPelaFuncao(ap: string, dados: Record<string, unknown>) {
  return db().rpc('confirmar_pagamento_do_atendimento', {
    p_agendamento: ap, p_tenant: rede!.tenantId, p_ator: null, p_ator_nome: null, p_dados: dados,
  })
}

const saldo = async (c: string) => Number((await db().rpc('saldo_de_pontos', { p_cliente: c, p_unidade: null })).data)
const tx = async (ap: string) => (await db().from('financial_transactions')
  .select('id, amount, loyalty_discount, is_paid, payment_method').eq('appointment_id', ap).maybeSingle()).data
/** A comissão do atendimento: a soma do extrato (liberação + ajustes). */
const comissao = async (ap: string) => ((await db().from('commissions').select('amount').eq('appointment_id', ap)).data ?? [])
  .reduce((s, c) => Math.round((s + Number(c.amount)) * 100) / 100, 0)

test.describe.serial('fidelidade: pontos como desconto no pagamento', () => {
  test('pela tela: "usar o máximo" respeita o teto; recebe o líquido; comissão sobre o valor pago', async ({ browser }) => {
    await configurar({})
    await comissaoSobre('VALOR_PAGO')
    const c = await rede!.criarCliente('Tela')
    await dar(c, 1500)
    const ap = await atendimentoConcluido(c, 200)

    const ctx = await browser.newContext({ storageState: recepcao!.estado })
    try {
      const p = await ctx.newPage()
      await p.goto(`/admin/agenda/${ap}`)
      await p.getByRole('button', { name: 'Confirmar pagamento' }).click()
      const bloco = p.getByTestId('usar-pontos')
      await expect(bloco).toContainText('1.500 pontos')
      await bloco.getByRole('button', { name: 'Usar o máximo' }).click()
      // Teto de 50% de R$ 200 = R$ 100 = 1.000 pontos a R$ 0,10.
      await expect(bloco.locator('input[name="pontos"]')).toHaveValue('1000')
      await expect(p.getByTestId('total-a-receber')).toContainText('100,00')
      await p.locator('select[name="payment_method"]').selectOption('PIX')
      await p.locator('form').getByRole('button', { name: 'Confirmar pagamento' }).click()
      await expect.poll(async () => (await tx(ap))?.is_paid, { message: 'o pagamento é gravado' }).toBe(true)
    } finally { await ctx.close() }

    const t = await tx(ap)
    expect({ amount: Number(t!.amount), desconto: Number(t!.loyalty_discount), metodo: t!.payment_method })
      .toEqual({ amount: 100, desconto: 100, metodo: 'PIX' })
    // 1.500 − 1.000 usados + 100 ganhos sobre o LÍQUIDO (R$ 100 × 1).
    expect(await saldo(c)).toBe(600)
    expect(await comissao(ap), 'VALOR_PAGO: a comissão cai na proporção').toBe(15)
  })

  test('a função recusa desconto que não bate, acima do teto e acima do saldo — nada grava', async () => {
    await configurar({})
    await comissaoSobre('PRECO')
    const c = await rede!.criarCliente('Burla')
    await dar(c, 300)
    const ap = await atendimentoConcluido(c, 200)
    const casos: [string, Record<string, unknown>, RegExp][] = [
      ['desconto inflado', { metodo: 'PIX', pontos: 100, desconto: 50, valor_final: 150 }, /não corresponde/],
      // 1.100 pontos = R$ 110, acima do teto de 50% de R$ 200 (o teto é conferido antes do saldo).
      ['acima do teto',    { metodo: 'PIX', pontos: 1100, desconto: 110, valor_final: 90 }, /máximo/],
      ['não fecha',        { metodo: 'PIX', pontos: 100, desconto: 10, valor_final: 100 }, /não fecham/],
    ]
    for (const [nome, dados, erro] of casos) {
      const { error } = await pagarPelaFuncao(ap, dados)
      expect(error?.message, nome).toMatch(erro)
    }
    // Mais pontos do que tem: teto alto para o saldo ser o que barra.
    await configurar({ redeem_max_pct: 100 })
    const { error } = await pagarPelaFuncao(ap, { metodo: 'PIX', pontos: 400, desconto: 40, valor_final: 160 })
    expect(error?.message).toMatch(/insuficiente/)
    expect(await tx(ap), 'nenhuma recusa gravou pagamento').toBeNull()
    expect(await saldo(c)).toBe(300)

    // Controle, com comissão PRECO: paga com 100 pontos (R$ 10) e a comissão não muda.
    const ok = await pagarPelaFuncao(ap, { metodo: 'PIX', pontos: 100, desconto: 10, valor_final: 190 })
    expect(ok.error).toBeNull()
    expect(await comissao(ap), 'PRECO: a comissão fica como estava').toBe(30)
  })

  test('estorno devolve os pontos usados e tira os ganhos', async () => {
    await configurar({ redeem_max_pct: 100 })
    const c = await rede!.criarCliente('Estorno')
    await dar(c, 500)
    const ap = await atendimentoConcluido(c, 100)
    expect((await pagarPelaFuncao(ap, { metodo: 'PIX', pontos: 500, desconto: 50, valor_final: 50 })).error).toBeNull()
    expect(await saldo(c)).toBe(50)  // 500 − 500 + 50 ganhos no líquido
    const t = await tx(ap)
    const { error } = await db().rpc('estornar_transacao', { p_transacao: t!.id, p_tenant: rede!.tenantId, p_ator: 'e2e' })
    expect(error).toBeNull()
    expect(await saldo(c), 'volta ao que era antes do pagamento').toBe(500)
    const { data: contra } = await db().from('financial_transactions').select('amount').eq('category', 'Estorno')
      .eq('client_id', c).single()
    expect(Number(contra!.amount), 'a contra-transação é o líquido').toBe(50)
  })

  test('pago todo com pontos: R$ 0, sem forma de pagamento, sem "Purchase" para a Meta', async () => {
    await configurar({ redeem_max_pct: 100, redeem_points_value: 1 })
    const c = await rede!.criarCliente('Zero')
    await db().from('clients').update({ ctwa_clid: `e2e-${marca}` }).eq('id', c)
    await dar(c, 80)
    const ap = await atendimentoConcluido(c, 80)
    expect((await pagarPelaFuncao(ap, { metodo: null, pontos: 80, desconto: 80, valor_final: 0 })).error).toBeNull()
    const t = await tx(ap)
    expect({ amount: Number(t!.amount), pago: t!.is_paid, metodo: t!.payment_method }).toEqual({ amount: 0, pago: true, metodo: null })
    expect(await saldo(c), 'R$ 0 não gera ponto').toBe(0)
    const { data: capi } = await db().from('meta_capi_events').select('id').eq('event_id', `purchase:${t!.id}`)
    expect(capi ?? []).toHaveLength(0)
  })

  test('dois pagamentos ao mesmo tempo com o saldo inteiro: só um passa', async () => {
    await configurar({ redeem_max_pct: 100, redeem_points_value: 0.1 })
    const c = await rede!.criarCliente('Concorrência')
    await dar(c, 200)
    const [a1, a2] = [await atendimentoConcluido(c, 100), await atendimentoConcluido(c, 100)]
    const dados = { metodo: 'PIX', pontos: 200, desconto: 20, valor_final: 80 }
    const [r1, r2] = await Promise.all([pagarPelaFuncao(a1, dados), pagarPelaFuncao(a2, dados)])
    const erros = [r1.error, r2.error].filter(Boolean)
    expect(erros, 'exatamente um é recusado').toHaveLength(1)
    expect(erros[0]!.message).toMatch(/insuficiente/)
    // 200 − 200 + 80 ganhos no pagamento que passou.
    expect(await saldo(c)).toBe(80)
  })
})
