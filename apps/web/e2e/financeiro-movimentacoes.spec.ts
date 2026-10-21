import { test, expect } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * As movimentações da unidade e o total da rede contam a MESMA coisa: os
 * lançamentos da lista (data de referência no período, sem o saldo zerado).
 * A simulação de um dia de clínica (2026-10-20) viu "9" na unidade e "6" no
 * total: a coluna contava pela data de pagamento até agora; o total, o
 * tamanho da lista (D34).
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null

test.beforeAll(async () => { rede = await criarOutraRede(`mv${marca}`) })
test.afterAll(async () => {
  if (!rede) return
  await db().from('financial_transactions').delete().eq('branch_id', rede.branchId)
  await rede.limpar()
})

test('a unidade e o total contam os mesmos lançamentos da lista', async () => {
  const agora = new Date()
  const fimDoMes = new Date(agora.getFullYear(), agora.getMonth() + 1, 0, 23, 0, 0)
  const lanca = (linha: Record<string, unknown>) => db().from('financial_transactions').insert({
    branch_id: rede!.branchId, type: 'INCOME', category: 'Serviços', description: 'e2e', created_by: 'e2e', ...linha,
  })
  await lanca({ amount: 100, is_paid: true, paid_at: agora.toISOString(), payment_method: 'PIX' })
  // A parcela que vence ainda neste mês: está na lista do mês.
  await lanca({ amount: 50, is_paid: false, due_date: fimDoMes.toISOString() })
  // O saldo zerado (substituído no check-in) é histórico: fora da lista.
  await lanca({ amount: 0, is_paid: false })

  const inicio = new Date(agora.getFullYear(), agora.getMonth(), 1)
  const { data, error } = await db().rpc('metrics_movimentacoes', {
    p_tenant: rede!.tenantId, p_branch_ids: [rede!.branchId], p_from: inicio.toISOString(), p_to: new Date(fimDoMes.getTime() + 3_600_000).toISOString(),
  })
  expect(error, 'a função existe').toBeNull()
  const linhas = (data ?? []) as { branch_id: string | null; n: number }[]
  expect(linhas.find(l => l.branch_id === rede!.branchId)?.n).toBe(2)
  expect(linhas.find(l => l.branch_id === null)?.n, 'o total').toBe(2)
})
