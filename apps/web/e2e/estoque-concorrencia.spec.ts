import { test, expect } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * A TRANSFERÊNCIA de estoque numa transação só (`estoque_transferir`, a dívida
 * da revisão do Copilot, 2026-10-08). Era ler os dois saldos no app e gravar
 * os dois valores absolutos: duas transferências ao mesmo tempo (ou uma e uma
 * conclusão de atendimento) perdiam uma. Agora as duas linhas de saldo são
 * TRAVADAS e a conta é feita lá dentro, como a entrada e o ajuste.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let outra: OutraRede | null = null
let destino: string | null = null
let produto: string | null = null

test.beforeAll(async () => {
  outra = await criarOutraRede(`conc${marca}`)
  const { data, error } = await db().from('branches')
    .insert({ tenant_id: outra.tenantId, name: `${PREFIXO} Destino ${marca}`, slug: `e2e-dest-${marca}` }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  destino = data!.id
  produto = await outra.criarProduto('transferido', 10)
})
test.afterAll(async () => {
  if (!outra) return
  if (produto) {
    await db().from('stock_movements').delete().eq('product_id', produto)
    await db().from('branch_product_stock').delete().eq('product_id', produto)
  }
  if (destino) await db().from('branches').delete().eq('id', destino)
  await outra.limpar()
})

const transferir = (quantidade: number) => db().rpc('estoque_transferir', {
  p_produto: produto, p_origem: outra!.branchId, p_destino: destino, p_quantidade: quantidade, p_observacao: null, p_autor: 'e2e',
})
async function saldo(unidade: string) {
  const { data } = await db().from('branch_product_stock').select('current_stock').eq('product_id', produto!).eq('branch_id', unidade).maybeSingle()
  return Number(data?.current_stock ?? 0)
}

test('cinco transferências AO MESMO TEMPO não perdem nenhuma', async () => {
  const resultados = await Promise.all([1, 1, 1, 1, 1].map(q => transferir(q)))
  expect(resultados.map(r => r.error), 'todas gravam').toEqual([null, null, null, null, null])
  expect([await saldo(outra!.branchId), await saldo(destino!)]).toEqual([5, 5])
  const { data: movs } = await db().from('stock_movements').select('type').eq('product_id', produto!).in('type', ['TRANSFER_OUT', 'TRANSFER_IN'])
  expect(movs ?? []).toHaveLength(10)
})

test('transferir mais do que a origem tem é recusado, sem gravar nada', async () => {
  const r = await transferir(50)
  expect(r.error?.message).toContain('Estoque insuficiente')
  expect([await saldo(outra!.branchId), await saldo(destino!)]).toEqual([5, 5])
})
