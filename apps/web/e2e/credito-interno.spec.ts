import { test, expect } from '@playwright/test'
import { banco, filiaisAtivas, tenantId, PREFIXO } from './apoio/banco'
import { apagarClientes } from './apoio/limpeza'

/**
 * Crédito interno é DESCONTADO quando usado para pagar, e o pagamento sem
 * saldo é recusado (decisão do Heitor, 2026-09-27).
 *
 * Até aqui `INTERNAL_CREDIT` era só um rótulo: a receita entrava paga e o
 * saldo continuava igual — o mesmo crédito pagava qualquer número de vezes.
 *
 * A regra mora num gatilho de `financial_transactions`, então vale para toda
 * porta por onde uma receita vira paga. O teste escreve direto no banco de
 * propósito: é a garantia do BANCO que se prova, não a de uma tela.
 */

const marca = Date.now().toString(36)

async function saldo(clientId: string): Promise<number> {
  const { data } = await banco().from('internal_credits').select('amount').eq('client_id', clientId)
  return (data ?? []).reduce((s, c) => s + Number(c.amount), 0)
}

test.describe.serial('crédito interno como forma de pagamento', () => {
  let clientId = ''
  let branchId = ''
  const lancamentos: string[] = []

  test.beforeAll(async () => {
    const db = banco()
    branchId = (await filiaisAtivas())[0]!.id
    const { data, error } = await db.from('clients')
      .insert({ tenant_id: await tenantId(), branch_id: branchId, name: `${PREFIXO} Cliente com credito ${marca}`, phone: '5548' + String(Date.now()).slice(-9) })
      .select('id').single<{ id: string }>()
    expect(error).toBeNull()
    clientId = data!.id
    await db.from('internal_credits').insert({ client_id: clientId, branch_id: branchId, amount: 50, description: `${PREFIXO} concessão` })
  })

  test.afterAll(async () => {
    const db = banco()
    await db.from('internal_credits').delete().eq('client_id', clientId)
    await db.from('domain_events').delete().in('entidade_id', lancamentos)
    await db.from('financial_transactions').delete().in('id', lancamentos)
    await db.from('financial_transactions').delete().like('description', `Estorno: ${PREFIXO} pagamento%${marca}`)
    await apagarClientes([clientId])
  })

  async function pagar(valor: number, rotulo: string, pago = true) {
    const { data, error } = await banco().from('financial_transactions')
      .insert({
        branch_id: branchId, client_id: clientId, type: 'INCOME', category: 'Serviços',
        description: `${PREFIXO} pagamento ${rotulo} ${marca}`, amount: valor,
        payment_method: 'INTERNAL_CREDIT', is_paid: pago, paid_at: pago ? new Date().toISOString() : null,
        created_by: 'e2e',
      })
      .select('id').single<{ id: string }>()
    if (data?.id) lancamentos.push(data.id)
    return { id: data?.id ?? null, error }
  }

  test('pagar com crédito desconta do saldo, amarrado ao lançamento', async () => {
    expect(await saldo(clientId)).toBe(50)
    const { id, error } = await pagar(30, 'um')
    expect(error, 'com saldo, o pagamento entra').toBeNull()
    expect(await saldo(clientId), 'o saldo desce o valor pago').toBe(20)

    const { data: debito } = await banco().from('internal_credits')
      .select('amount, transaction_id').eq('client_id', clientId).lt('amount', 0).single()
    expect(Number(debito!.amount)).toBe(-30)
    expect(debito!.transaction_id, 'o débito aponta o pagamento que o consumiu').toBe(id)
  })

  test('sem saldo, o pagamento é recusado — inteiro', async () => {
    const { id, error } = await pagar(30, 'dois')
    expect(error?.message ?? '', 'o banco recusa pagar além do saldo').toContain('insuficiente')
    expect(id, 'o lançamento não pode ter entrado').toBeNull()
    expect(await saldo(clientId), 'o saldo não mexe').toBe(20)
  })

  test('pendente que vira pago também desconta — e só uma vez', async () => {
    const { id } = await pagar(5, 'tres', false)
    expect(await saldo(clientId), 'pendente não desconta').toBe(20)
    const db = banco()
    await db.from('financial_transactions').update({ is_paid: true, paid_at: new Date().toISOString() }).eq('id', id!)
    expect(await saldo(clientId), 'virar pago desconta').toBe(15)
    // Outra atualização qualquer não pode descontar de novo.
    await db.from('financial_transactions').update({ notes: `${PREFIXO} anotação` }).eq('id', id!)
    await db.from('financial_transactions').update({ is_paid: true }).eq('id', id!)
    expect(await saldo(clientId), 'nada desconta duas vezes').toBe(15)
  })

  test('estornar um pagamento feito com crédito devolve o crédito', async () => {
    const primeiro = lancamentos[0]!
    const { error } = await banco().rpc('estornar_transacao', {
      p_transacao: primeiro, p_tenant: await tenantId(), p_ator: 'e2e',
    })
    expect(error).toBeNull()
    expect(await saldo(clientId), 'os 30 voltam').toBe(45)
  })
})

test('estornar o pagamento de um ATENDIMENTO funciona', async () => {
  // A contra-transação copiava `appointment_id`, e `financial_transactions` tem
  // UNIQUE nele: todo estorno de atendimento falhava com 23505.
  const db = banco()
  const tenant = await tenantId()
  const branch = (await filiaisAtivas())[0]!.id
  const { data: cli } = await db.from('clients')
    .insert({ tenant_id: tenant, branch_id: branch, name: `${PREFIXO} Cliente estorno atend ${marca}`, phone: '5548' + String(Date.now() + 7).slice(-9) })
    .select('id').single<{ id: string }>()
  const { data: proc } = await db.from('procedures').select('id').eq('tenant_id', tenant).limit(1).single<{ id: string }>()
  const { data: prof } = await db.from('users').select('id').eq('tenant_id', tenant).eq('is_active', true).limit(1).single<{ id: string }>()
  const { data: ag, error: eAg } = await db.from('appointments')
    .insert({
      branch_id: branch, client_id: cli!.id, procedure_id: proc!.id, professional_id: prof!.id,
      scheduled_at: new Date(Date.now() - 3_600_000).toISOString(), duration_min: 30, price: 80,
      status: 'COMPLETED',
    })
    .select('id').single<{ id: string }>()
  expect(eAg).toBeNull()
  try {
    const { data: tx, error: eTx } = await db.from('financial_transactions')
      .insert({
        branch_id: branch, client_id: cli!.id, appointment_id: ag!.id, type: 'INCOME', category: 'Serviços',
        description: `${PREFIXO} atendimento a estornar ${marca}`, amount: 80, payment_method: 'PIX',
        is_paid: true, paid_at: new Date().toISOString(), created_by: 'e2e',
      })
      .select('id').single<{ id: string }>()
    expect(eTx).toBeNull()
    const { error } = await db.rpc('estornar_transacao', { p_transacao: tx!.id, p_tenant: tenant, p_ator: 'e2e' })
    expect(error, 'estornar o pagamento de um atendimento tem de funcionar').toBeNull()
  } finally {
    await db.from('financial_transactions').delete().like('description', `%${PREFIXO} atendimento a estornar ${marca}`)
    await apagarClientes([cli!.id])
  }
})
