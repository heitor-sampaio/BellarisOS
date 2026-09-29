import { test, expect } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * Fidelidade — o ponto nasce no PAGAMENTO (migration 20260929000001).
 *
 * O gatilho `trg_fidelidade_ganho` em financial_transactions: vale para
 * qualquer lugar que receba (recepção, checkout de plano, lançamento), por isso
 * o teste fala direto com o banco. Numa rede [e2e] própria, com a config que
 * cada caso descrever.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null

test.beforeAll(async () => { rede = await criarOutraRede(`fg${marca}`) })
test.afterAll(async () => { if (rede) await rede.limpar() })

async function configurar(cfg: Record<string, unknown>) {
  const { error } = await db().from('loyalty_configs')
    .upsert({ tenant_id: rede!.tenantId, ...cfg }, { onConflict: 'tenant_id' })
  expect(error, 'gravar a config').toBeNull()
}

async function pagar(clientId: string, valor: number, extra: Record<string, unknown> = {}) {
  const { data, error } = await db().from('financial_transactions').insert({
    branch_id: rede!.branchId, client_id: clientId, type: 'INCOME', category: 'Atendimento',
    description: `${PREFIXO} pagamento ${marca}`, amount: valor, payment_method: 'PIX',
    is_paid: true, paid_at: new Date().toISOString(), created_by: 'e2e', ...extra,
  }).select('id').single<{ id: string }>()
  expect(error, 'lançar o pagamento').toBeNull()
  return data!.id
}

async function extrato(clientId: string) {
  const { data: conta } = await db().from('loyalty_accounts').select('id').eq('client_id', clientId).maybeSingle()
  if (!conta) return []
  const { data } = await db().from('loyalty_transactions')
    .select('kind, points, transaction_id, treatment_plan_id').eq('loyalty_account_id', conta.id).order('created_at')
  return (data ?? []) as { kind: string; points: number; transaction_id: string | null; treatment_plan_id: string | null }[]
}

async function saldo(clientId: string) {
  const { data, error } = await db().rpc('saldo_de_pontos', { p_cliente: clientId, p_unidade: null })
  expect(error).toBeNull()
  return Number(data)
}

test.describe.serial('fidelidade: ganho no pagamento', () => {
  test('programa desligado: pagar não gera ponto', async () => {
    const c = await rede!.criarCliente('Desligado')
    await configurar({ enabled: false, earn_mode: 'POR_REAL', points_per_real: 1 })
    await pagar(c, 100)
    expect(await extrato(c)).toEqual([])
  })

  test('por real: 2 pontos por real sobre o valor pago, com evento; repagar não duplica', async () => {
    const c = await rede!.criarCliente('Por real')
    await configurar({ enabled: true, earn_mode: 'POR_REAL', points_per_real: 2 })
    const tx = await pagar(c, 150.99)
    expect(await extrato(c)).toEqual([{ kind: 'GANHO', points: 301, transaction_id: tx, treatment_plan_id: null }])
    expect(await saldo(c)).toBe(301)

    const { data: ev } = await db().from('domain_events').select('dados')
      .eq('tenant_id', rede!.tenantId).eq('nome', 'fidelidade.pontos_ganhos').eq('chave', `fidelidade.pontos_ganhos:${tx}`)
    expect((ev ?? []).length, 'o evento sai do gatilho').toBe(1)
    expect((ev![0]!.dados as { pontos: number }).pontos).toBe(301)

    // Desmarcar e marcar de novo como pago não credita de novo.
    await db().from('financial_transactions').update({ is_paid: false }).eq('id', tx)
    await db().from('financial_transactions').update({ is_paid: true }).eq('id', tx)
    expect(await saldo(c)).toBe(301)
  })

  test('a receber não gera; gera quando vira pago. Crédito interno não gera', async () => {
    const c = await rede!.criarCliente('A receber')
    await configurar({ enabled: true, earn_mode: 'POR_REAL', points_per_real: 1 })
    const tx = await pagar(c, 80, { is_paid: false, paid_at: null })
    expect(await saldo(c)).toBe(0)
    await db().from('financial_transactions').update({ is_paid: true, paid_at: new Date().toISOString() }).eq('id', tx)
    expect(await saldo(c)).toBe(80)

    await db().from('internal_credits').insert({ client_id: c, branch_id: rede!.branchId, amount: 50, description: `${PREFIXO} crédito` })
    await pagar(c, 50, { payment_method: 'INTERNAL_CREDIT' })
    expect(await saldo(c), 'crédito é dinheiro que o cliente já tinha').toBe(80)
  })

  test('estorno tira exatamente o que o pagamento deu; saldo pode ficar negativo', async () => {
    const c = await rede!.criarCliente('Estorno')
    await configurar({ enabled: true, earn_mode: 'POR_REAL', points_per_real: 1 })
    const tx = await pagar(c, 100)
    // A equipe debita 60 antes do estorno.
    const { error: eAj } = await db().rpc('ajustar_pontos', {
      p_tenant: rede!.tenantId, p_cliente: c, p_unidade: rede!.branchId, p_pontos: -60, p_motivo: 'uso de teste', p_ator: 'e2e',
    })
    expect(eAj).toBeNull()
    const { error } = await db().rpc('estornar_transacao', { p_transacao: tx, p_tenant: rede!.tenantId, p_ator: 'e2e' })
    expect(error).toBeNull()
    const linhas = await extrato(c)
    expect(linhas.map(l => [l.kind, l.points])).toEqual([['GANHO', 100], ['AJUSTE', -60], ['ESTORNO_GANHO', -100]])
    expect(await saldo(c)).toBe(-60)
  })

  test('por procedimento: atendimento pago ganha os pontos do procedimento', async () => {
    const c = await rede!.criarCliente('Por procedimento')
    await configurar({ enabled: true, earn_mode: 'POR_PROCEDIMENTO' })
    await db().from('procedures').update({ loyalty_points: 40 }).eq('id', rede!.procedureId)
    const { data: ap, error } = await db().from('appointments').insert({
      branch_id: rede!.branchId, client_id: c, professional_id: rede!.professionalId, procedure_id: rede!.procedureId,
      scheduled_at: new Date().toISOString(), duration_min: 30, price: 300, status: 'COMPLETED',
    }).select('id').single<{ id: string }>()
    expect(error).toBeNull()
    await pagar(c, 300, { appointment_id: ap!.id })
    expect(await saldo(c)).toBe(40)
    // Receita sem atendimento não gera nada neste modo.
    await pagar(c, 999)
    expect(await saldo(c)).toBe(40)
  })

  test('plano: cumulativo — entrada e restante somam exatamente os pontos do plano', async () => {
    const c = await rede!.criarCliente('Plano')
    await configurar({ enabled: true, earn_mode: 'POR_PROCEDIMENTO' })
    await db().from('procedures').update({ loyalty_points: 40 }).eq('id', rede!.procedureId)
    const { data: plano, error } = await db().from('treatment_plans').insert({
      branch_id: rede!.branchId, professional_id: rede!.professionalId, client_id: c, status: 'ACCEPTED', name: `${PREFIXO} Plano ${marca}`,
    }).select('id').single<{ id: string }>()
    expect(error).toBeNull()
    // 3 sessões de R$ 100: total R$ 300, pontos do plano = 40 × 3 = 120.
    const { error: eItem } = await db().from('treatment_plan_items')
      .insert({ plan_id: plano!.id, procedure_id: rede!.procedureId, sessions: 3, unit_price: 100 })
    expect(eItem).toBeNull()

    await pagar(c, 100, { treatment_plan_id: plano!.id })   // 1/3 → floor(40)
    expect(await saldo(c)).toBe(40)
    await pagar(c, 100.5, { treatment_plan_id: plano!.id }) // 200,5/300 → floor(80,2) = 80 → +40
    expect(await saldo(c)).toBe(80)
    await pagar(c, 99.5, { treatment_plan_id: plano!.id })  // 300/300 → 120 → +40
    expect(await saldo(c)).toBe(120)
    const linhas = await extrato(c)
    expect(linhas.every(l => l.kind === 'GANHO' && l.treatment_plan_id === plano!.id)).toBe(true)
  })

  test('concluir o atendimento não dá mais ponto (mesmo mandando pontos)', async () => {
    const c = await rede!.criarCliente('Conclusão')
    await configurar({ enabled: true, earn_mode: 'POR_REAL', points_per_real: 1 })
    const { data: ap } = await db().from('appointments').insert({
      branch_id: rede!.branchId, client_id: c, professional_id: rede!.professionalId, procedure_id: rede!.procedureId,
      scheduled_at: new Date().toISOString(), duration_min: 30, price: 200, status: 'IN_PROGRESS',
    }).select('id').single<{ id: string }>()
    const { error } = await db().rpc('concluir_atendimento', {
      p_agendamento: ap!.id, p_tenant: rede!.tenantId, p_ator: null, p_ator_nome: null,
      p_dados: { pontos: 500, insumos: [] },
    })
    expect(error).toBeNull()
    expect(await extrato(c)).toEqual([])
  })
})
