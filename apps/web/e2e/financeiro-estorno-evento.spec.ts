import { test, expect } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * O evento falso de estorno (achado da F2b, 913c1ad8): a parcela NUNCA paga
 * que cai — cancelar o pacote (F2b), cancelar a venda de produto toda a
 * receber (F3) — é marcada `Estornada`, e o gatilho `on_transaction_reversed`
 * emitia `pagamento.estornado`. Uma automação ligada nesse evento avisaria a
 * cliente de um estorno que não houve. O evento só sai para o lançamento que
 * estava PAGO.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede
let cliente = ''

test.beforeAll(async () => {
  rede = await criarOutraRede(`fee${marca}`)
  cliente = await rede.criarCliente('Estorno')
})
test.afterAll(async () => {
  if (!rede) return
  await db().from('domain_events').delete().eq('tenant_id', rede.tenantId)
  await db().from('financial_transactions').delete().eq('branch_id', rede.branchId)
  await rede.limpar()
})

async function lancamento(pago: boolean): Promise<string> {
  const { data, error } = await db().from('financial_transactions').insert({
    branch_id: rede.branchId, client_id: cliente, type: 'INCOME', category: 'Atendimento', description: `[e2e] parcela ${marca}`,
    amount: 300, is_paid: pago, paid_at: pago ? new Date().toISOString() : null, payment_method: pago ? 'PIX' : null, created_by: 'e2e',
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  return data!.id
}
const eventoDoEstorno = async (id: string) => (await db().from('domain_events').select('id')
  .eq('tenant_id', rede.tenantId).eq('chave', `pagamento.estornado:${id}`)).data ?? []

test('a parcela nunca paga que cai como "Estornada" não emite pagamento.estornado', async () => {
  const id = await lancamento(false)
  expect((await db().from('financial_transactions').update({ notes: 'Estornada' }).eq('id', id)).error).toBeNull()
  expect(await eventoDoEstorno(id), 'não houve estorno: nada foi pago').toEqual([])
})

test('controle: o lançamento PAGO estornado emite pagamento.estornado', async () => {
  const id = await lancamento(true)
  expect((await db().from('financial_transactions').update({ notes: 'Estornada' }).eq('id', id)).error).toBeNull()
  expect(await eventoDoEstorno(id)).toHaveLength(1)
})
