import { test, expect } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * D5 da 15ª simulação (2026-11-15): o histórico do atendimento dizia "Plano de
 * tratamento enviado ao PDV — 5 sessão(ões)" para um plano só PROPOSTO — a
 * comanda nasce no ACEITE (PDV4, PT1a–PT1c), e o banner da própria tela diz
 * isso. O texto mora em `gerar_plano_da_avaliacao`. Decidido pelos princípios
 * (3): "proposto" no histórico. Numa rede [e2e] própria, pela função, como a
 * action a chama.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let cliente = ''

async function agendamento(status: 'SCHEDULED' | 'COMPLETED') {
  const agora = Date.now()
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: cliente, procedure_id: rede!.procedureId, professional_id: rede!.professionalId,
    source: 'INTERNAL', duration_min: 30, price: 0, status,
    scheduled_at: new Date(agora - 2 * 3600_000).toISOString(),
    ...(status === 'COMPLETED' ? { completed_at: new Date(agora - 3600_000).toISOString() } : {}),
  }).select('id').single<{ id: string }>()
  expect(error, error?.message).toBeNull()
  return data!.id
}

async function gerar(ap: string, sessoes: number) {
  const { error } = await db().rpc('gerar_plano_da_avaliacao', {
    p_agendamento: ap, p_tenant: rede!.tenantId, p_ator: rede!.professionalId, p_ator_nome: 'Profissional d5',
    p_dados: {
      profissional: rede!.professionalId,
      sessoes: Array.from({ length: sessoes }, () => ({ procedimentos: [{ procedure_id: rede!.procedureId, price: 100 }] })),
    },
  })
  expect(error, error?.message).toBeNull()
  const { data } = await db().from('appointment_history').select('description').eq('appointment_id', ap).eq('action', 'PLAN_PROPOSED')
  return (data ?? []).map(h => h.description as string)
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`d5${marca}`)
  expect((await db().from('users').update({ provides_services: true, branch_id: rede.branchId }).eq('id', rede.professionalId)).error).toBeNull()
  cliente = await rede.criarCliente('Camila d5')
  // A ficha de saúde da rede nasce com perguntas obrigatórias, e o plano não
  // nasce com elas em branco (atend-04): aqui ela sai — o teste é do histórico.
  expect((await db().from('forms').delete().eq('tenant_id', rede.tenantId).eq('tipo', 'PRE_ATENDIMENTO')).error).toBeNull()
})

test.afterAll(async () => { await rede?.limpar() })

test('D5: o plano gerado no atendimento entra no histórico como "proposto", não "enviado ao PDV"', async () => {
  const ap = await agendamento('SCHEDULED')
  expect(await gerar(ap, 1)).toEqual(['Plano de tratamento proposto — 1 sessão'])
})

test('D5: o plano gerado da avaliação concluída também é "proposto" — e o plural sem "(ões)"', async () => {
  const ap = await agendamento('COMPLETED')
  expect(await gerar(ap, 3)).toEqual(['Plano de tratamento gerado da avaliação concluída e proposto — 3 sessões'])
})
