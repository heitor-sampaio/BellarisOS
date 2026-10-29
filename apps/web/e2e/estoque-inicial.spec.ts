import { test, expect } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * O estoque inicial do produto novo (2026-10-21). A simulação de um dia de
 * clínica viu:
 * - três gravações fora de transação (movimento, saldo, lote — e a despesa),
 *   contra a regra do estoque (entrada só por estoque_entrada);
 * - o custo virar despesa PAGA de hoje sem a tela dizer nada.
 *
 * Agora é uma função só (estoque_inicial, sobre estoque_entrada). A despesa SAIU
 * (D13 revisto, 2026-10-28: movimentação de estoque nunca gera despesa; a tela
 * está em estoque-nunca-gera-despesa.spec.ts).
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null

test.beforeAll(async () => {
  rede = await criarOutraRede(`ei${marca}`)
})
test.afterAll(async () => {
  if (rede) {
    await db().from('financial_transactions').delete().eq('branch_id', rede.branchId)
    const { data } = await db().from('products').select('id').eq('tenant_id', rede.tenantId)
    const ids = (data ?? []).map(p => p.id as string)
    if (ids.length) {
      await db().from('product_batches').delete().in('product_id', ids)
      await db().from('stock_movements').delete().in('product_id', ids)
      await db().from('branch_product_stock').delete().in('product_id', ids)
      await db().from('products').delete().in('id', ids)
    }
  }
  await rede?.limpar()
})

async function produto(nome: string) {
  const { data, error } = await db().from('products').insert({ tenant_id: rede!.tenantId, name: nome, unit: 'un' }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  return data!.id
}

test('estoque_inicial grava tudo junto: movimento, saldo com o mínimo, lote, custo — e nenhuma despesa', async () => {
  // Movimentação de estoque nunca gera despesa (D13 revisto, 2026-10-28): a
  // função não tem mais p_despesa; o custo fica no movimento (base da margem).
  const id = await produto(`${PREFIXO} Inicial ${marca}`)
  const { error } = await db().rpc('estoque_inicial', {
    p_produto: id, p_unidade: rede!.branchId, p_quantidade: 4, p_custo: 25, p_observacao: 'Estoque inicial',
    p_lote: `L-${marca}`, p_validade: null, p_autor: 'e2e', p_minimo: 2,
  })
  expect(error, 'a função existe e grava').toBeNull()
  const saldo = (await db().from('branch_product_stock').select('current_stock, min_stock').eq('product_id', id).single()).data
  expect(saldo).toEqual({ current_stock: 4, min_stock: 2 })
  expect((await db().from('stock_movements').select('quantity, unit_cost').eq('product_id', id)).data).toEqual([{ quantity: 4, unit_cost: 25 }])
  expect((await db().from('product_batches').select('quantity').eq('product_id', id)).data).toEqual([{ quantity: 4 }])
  const { data: despesas } = await db().from('financial_transactions').select('id').eq('branch_id', rede!.branchId)
  expect(despesas, 'nenhum lançamento').toEqual([])
})
