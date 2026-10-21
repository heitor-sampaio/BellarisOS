import { test, expect } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * A margem por procedimento, contada no banco (metrics_margem_procedimentos).
 *
 * A simulação de um dia de clínica (2026-10-20) viu a Toxina com −3858% e o
 * Peeling com −71%: o dashboard multiplicava a quantidade do insumo (40 U,
 * 5 ml) pelo preço da EMBALAGEM inteira (o frasco de R$ 1.200), na própria
 * página — fora de lib/metrics. O custo do insumo é o da unidade de CONSUMO:
 * o preço da embalagem ÷ o que ela rende.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
const produtos: string[] = []

test.beforeAll(async () => {
  rede = await criarOutraRede(`mg${marca}`)
})

test.afterAll(async () => {
  if (!rede) return
  await db().from('procedure_products').delete().in('product_id', produtos)
  await db().from('products').delete().in('id', produtos)
  await rede.limpar()
})

test('o custo do insumo é o da unidade de consumo, não o da embalagem', async () => {
  const { data: toxina, error: eP } = await db().from('products').insert({
    tenant_id: rede!.tenantId, name: `${PREFIXO} Toxina frasco ${marca}`, unit: 'frasco',
    consumption_unit: 'U', units_per_package: 100, cost_price: 1200,
  }).select('id').single<{ id: string }>()
  expect(eP).toBeNull()
  const { data: luva, error: eL } = await db().from('products').insert({
    tenant_id: rede!.tenantId, name: `${PREFIXO} Luva ${marca}`, unit: 'un', cost_price: 2,
  }).select('id').single<{ id: string }>()
  expect(eL).toBeNull()
  produtos.push(toxina!.id, luva!.id)

  const { data: proc, error: ePr } = await db().from('procedures').insert({
    tenant_id: rede!.tenantId, name: `${PREFIXO} Toxina ${marca}`, category: 'e2e', duration_min: 30,
    price: 1200, labor_cost: 100, other_costs: 0, is_active: true,
  }).select('id').single<{ id: string }>()
  expect(ePr).toBeNull()
  // 40 U a R$ 12 (1200 ÷ 100) = R$ 480; 2 luvas a R$ 2 = R$ 4; mão de obra R$ 100.
  await db().from('procedure_products').insert([
    { procedure_id: proc!.id, product_id: toxina!.id, quantity: 40 },
    { procedure_id: proc!.id, product_id: luva!.id, quantity: 2 },
  ])

  const { data, error } = await db().rpc('metrics_margem_procedimentos', { p_tenant: rede!.tenantId, p_limit: 10 })
  expect(error, 'a função existe').toBeNull()
  const linha = ((data ?? []) as { procedure_name: string; price: number; cost: number; margin_pct: number }[])
    .find(r => r.procedure_name === `${PREFIXO} Toxina ${marca}`)
  expect(linha, 'o procedimento está no ranking').toBeTruthy()
  expect(Number(linha!.cost)).toBe(584)
  expect(Math.round(Number(linha!.margin_pct) * 10) / 10).toBe(51.3)
})
