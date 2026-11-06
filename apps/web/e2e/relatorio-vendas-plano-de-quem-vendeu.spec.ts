import { test, expect } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * D14 da 8ª simulação (2026-11-06): o Relatório de Vendas punha o plano em
 * nome da "Dra. Paula" (a dona do plano), não da Marta, que vendeu — o rodapé
 * diz que no pacote vale quem vendeu, e o plano tem "Quem vendeu" desde a
 * decisão 4 da 7ª (`treatment_plans.vendido_por`), que só a comissão lia.
 *
 * Agora a coluna "Profissional" do plano é quem vendeu; a dona do plano só
 * quando ninguém foi marcado. O "só os meus" segue a mesma pessoa.
 *
 * Numa rede [e2e] própria.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let marta: MembroDeTeste | null = null
let nomeDaDona = ''
const planos: string[] = []
const agora = new Date().toISOString()

async function plano(nome: string, vendidoPor: string | null) {
  const { data, error } = await db().from('treatment_plans').insert({
    branch_id: rede!.branchId, professional_id: rede!.professionalId, client_id: await rede!.criarCliente(`Cliente ${nome}`),
    status: 'ACCEPTED', name: `${PREFIXO} ${nome} ${marca}`, vendido_por: vendidoPor, aceito_em: agora,
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  const s = await db().from('treatment_plan_sessions').insert({ plan_id: data!.id, sort_order: 0 }).select('id').single<{ id: string }>()
  expect(s.error).toBeNull()
  expect((await db().from('treatment_plan_session_procedures').insert({ session_id: s.data!.id, procedure_id: rede!.procedureId, price: 900, sort_order: 0 })).error).toBeNull()
  planos.push(data!.id)
}

test.beforeAll(async () => {
  test.setTimeout(120_000)
  rede = await criarOutraRede(`vq${marca}`)
  marta = await criarMembro(`vqm${marca}`, { tenant: rede.tenantId, rotulo: 'Recepcao', permissoes: [] })
  nomeDaDona = (await db().from('users').select('name').eq('id', rede.professionalId).single<{ name: string }>()).data!.name
  await plano('Vendido pela Marta', marta.userId)
  await plano('Sem vendedora', null)
})

test.afterAll(async () => {
  for (const id of planos) {
    const { data: ss } = await db().from('treatment_plan_sessions').select('id').eq('plan_id', id)
    const ids = (ss ?? []).map(s => s.id as string)
    if (ids.length) await db().from('treatment_plan_session_procedures').delete().in('session_id', ids)
    await db().from('treatment_plan_sessions').delete().eq('plan_id', id)
    await db().from('treatment_plans').delete().eq('id', id)
  }
  await marta?.limpar(); await rede?.limpar()
})

test('D14: o plano nas Vendas é de quem vendeu; sem vendedora, da dona do plano — e o "só os meus" segue a coluna', async () => {
  const de = new Date(Date.now() - 86_400_000).toISOString(), ate = new Date(Date.now() + 86_400_000).toISOString()
  const vendas = async (profissional: string | null) => {
    const { data, error } = await db().rpc('metrics_vendas', { p_tenant: rede!.tenantId, p_branch_ids: null, p_from: de, p_to: ate, p_professional_id: profissional })
    expect(error).toBeNull()
    return (data as { tipo: string; descricao: string; profissional: string }[]).filter(v => v.tipo === 'PLANO')
      .map(v => `${v.descricao.replace(` ${marca}`, '').replace(`${PREFIXO} `, '')} · ${v.profissional}`).sort()
  }
  const nomeDaMarta = (await db().from('users').select('name').eq('id', marta!.userId).single<{ name: string }>()).data!.name
  expect(await vendas(null)).toEqual([`Sem vendedora · ${nomeDaDona}`, `Vendido pela Marta · ${nomeDaMarta}`].sort())
  expect(await vendas(marta!.userId)).toEqual([`Vendido pela Marta · ${nomeDaMarta}`])
  expect(await vendas(rede!.professionalId)).toEqual([`Sem vendedora · ${nomeDaDona}`])
})
