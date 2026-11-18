import { test, expect } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * 22ª A20, a decisão do Heitor (2026-11-18; princípio 3): o desconto do plano
 * combinado no editor vale em toda tela a partir do ACEITE. O `plano_aceitar`
 * (o aceite da equipe e o da cliente no app) o aplica nos preços na mesma
 * transação, pelo `plano_aplicar_desconto`: a comanda, o em aberto, a agenda e
 * o app leem o preço vendido. E o receber, que parte do preço de antes
 * (`preco_tabela`), não o aplica duas vezes.
 *
 * Fala com o banco pelo servidor (a função é só do service_role).
 */

const marca = `pc${Date.now().toString(36)}`
const db = () => banco()
let rede: OutraRede | null = null

async function planoProposto(rotulo: string, combinado: { tipo: 'VALOR' | 'PERCENTUAL'; valor: number } | null, precos: number[]) {
  const clientId = await rede!.criarCliente(`Cliente ${rotulo}`)
  const { data: plano, error } = await db().from('treatment_plans').insert({
    branch_id: rede!.branchId, professional_id: rede!.professionalId, client_id: clientId, status: 'PROPOSED',
    name: `[e2e] Plano ${rotulo} ${marca}`,
    desconto_combinado_tipo: combinado?.tipo ?? null, desconto_combinado_valor: combinado?.valor ?? 0,
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  const { data: sessao } = await db().from('treatment_plan_sessions').insert({ plan_id: plano!.id, sort_order: 0 }).select('id').single<{ id: string }>()
  expect((await db().from('treatment_plan_session_procedures').insert(precos.map((price, i) => ({
    session_id: sessao!.id, procedure_id: rede!.procedureId, price, sort_order: i,
  })))).error).toBeNull()
  return plano!.id
}

async function precosDo(planId: string) {
  const { data } = await db().from('treatment_plan_sessions')
    .select('treatment_plan_session_procedures(id, price, preco_tabela, sort_order)').eq('plan_id', planId)
  type P = { id: string; price: number | string; preco_tabela: number | string | null; sort_order: number }
  return ((data ?? []) as unknown as { treatment_plan_session_procedures: P[] }[])
    .flatMap(s => s.treatment_plan_session_procedures).sort((a, b) => a.sort_order - b.sort_order)
    .map(p => ({ id: p.id, price: Number(p.price), tabela: p.preco_tabela == null ? null : Number(p.preco_tabela) }))
}

test.beforeAll(async () => { rede = await criarOutraRede(marca) })
test.afterAll(async () => {
  if (rede) await db().from('comandas').delete().eq('branch_id', rede.branchId)
  await rede?.limpar()
})

test('o aceite aplica o combinado em reais nos preços, e o receber não aplica de novo', async () => {
  const planId = await planoProposto('valor', { tipo: 'VALOR', valor: 30 }, [150, 150, 150])
  expect((await db().rpc('plano_aceitar', { p_tenant: rede!.tenantId, p_plano: planId })).error).toBeNull()

  const depois = await precosDo(planId)
  expect(depois.map(p => p.price)).toEqual([140, 140, 140])
  expect(depois.map(p => p.tabela)).toEqual([150, 150, 150])
  const plano = (await db().from('treatment_plans').select('status, desconto').eq('id', planId).single()).data
  expect(plano?.status).toBe('ACCEPTED')
  expect(Number(plano?.desconto)).toBe(30)
  expect((await db().from('comandas').select('id').eq('treatment_plan_id', planId)).data ?? []).toHaveLength(1)

  // O receber manda o mesmo desconto sobre o preço de ANTES: os preços ficam.
  expect((await db().rpc('plano_aplicar_desconto', {
    p_plano: planId, p_tenant: rede!.tenantId, p_ator: null, p_desconto: 30,
    p_precos: depois.map(p => ({ id: p.id, preco: p.price })),
  })).error).toBeNull()
  expect((await precosDo(planId)).map(p => p.price)).toEqual([140, 140, 140])
})

test('o percentual se rateia ao centavo, e sem combinado o aceite não mexe nos preços', async () => {
  const pct = await planoProposto('pct', { tipo: 'PERCENTUAL', valor: 12.5 }, [33.33, 33.33, 33.35])
  expect((await db().rpc('plano_aceitar', { p_tenant: rede!.tenantId, p_plano: pct })).error).toBeNull()
  const precos = await precosDo(pct)
  expect(Math.round(precos.reduce((t, p) => t + p.price * 100, 0))).toBe(8751) // 100,01 − 12,50
  expect(Number((await db().from('treatment_plans').select('desconto').eq('id', pct).single()).data?.desconto)).toBe(12.5)

  const sem = await planoProposto('sem', null, [100, 50])
  expect((await db().rpc('plano_aceitar', { p_tenant: rede!.tenantId, p_plano: sem })).error).toBeNull()
  expect((await precosDo(sem)).map(p => [p.price, p.tabela])).toEqual([[100, null], [50, null]])
})
