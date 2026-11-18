import { test, expect } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * D17 da 25ª simulação (princípio 3; "próximo agendamento", busca.md): os
 * "Próximos agendamentos" da busca mostravam a falta e o concluído de hoje —
 * `busca_universal` só tirava o cancelado. "Próximo" é UMA regra: em aberto
 * (agendado, confirmado, chegou, em atendimento) e de hoje em diante; o de
 * hoje fica até a conclusão, mesmo com o horário já passado
 * (`STATUS_DO_PROXIMO`, atendimento.md). O dia é o da unidade (20261111006203).
 *
 * Numa rede `[e2e]` própria, pela função (é ela que decide; a action só
 * recorta o alcance — busca-universal.spec.ts).
 */

const marca = Date.now().toString(36)
const db = () => banco()
const hojeSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
const as = (dia: string, hora: string) => new Date(`${dia}T${hora}:00-03:00`).toISOString()
const amanha = () => new Date(new Date(`${hojeSP()}T12:00:00-03:00`).getTime() + 86_400_000).toISOString().slice(0, 10)

let rede: OutraRede
const ids: Record<string, string> = {}

test.beforeAll(async () => {
  test.setTimeout(120_000)
  rede = await criarOutraRede(`bp${marca}`)
  const ag = async (rotulo: string, dia: string, hora: string, status: string, extra: Record<string, unknown> = {}) => {
    const cliente = await rede.criarCliente(`Prox ${rotulo}`)
    const { data, error } = await db().from('appointments').insert({
      branch_id: rede.branchId, client_id: cliente, procedure_id: rede.procedureId, professional_id: rede.professionalId,
      scheduled_at: as(dia, hora), duration_min: 30, price: 0, status, source: 'INTERNAL', ...extra,
    }).select('id').single<{ id: string }>()
    expect(error, rotulo).toBeNull()
    ids[rotulo] = data!.id
  }
  // Hoje às 00:05: o horário já passou, e segue em aberto — fica.
  await ag('Agendado hoje', hojeSP(), '00:05', 'SCHEDULED')
  await ag('Chegou hoje', hojeSP(), '00:10', 'ARRIVED', { arrived_at: as(hojeSP(), '00:10') })
  await ag('Confirmado amanha', amanha(), '10:00', 'CONFIRMED')
  // Hoje, mas fechados: não são "próximos".
  await ag('Falta hoje', hojeSP(), '00:15', 'NO_SHOW')
  await ag('Concluido hoje', hojeSP(), '00:20', 'COMPLETED', { completed_at: as(hojeSP(), '00:21') })
  await ag('Cancelado amanha', amanha(), '11:00', 'CANCELLED', { cancelled_at: new Date().toISOString(), cancellation_reason: 'e2e' })
})
test.afterAll(async () => { await rede?.limpar() })

test('D17: a busca acha só os agendamentos em aberto de hoje em diante — a falta e o concluído de hoje ficam de fora', async () => {
  const { data, error } = await db().rpc('busca_universal', {
    p_tenant: rede.tenantId, p_termo: `Prox`, p_tipos: ['agendamento'], p_limite: 20,
  })
  expect(error).toBeNull()
  const achados = ((data ?? []) as { tipo: string; id: string }[]).filter(r => r.tipo === 'agendamento').map(r => r.id)
  expect(achados).toEqual(expect.arrayContaining([ids['Agendado hoje'], ids['Chegou hoje'], ids['Confirmado amanha']]))
  expect(achados).not.toContain(ids['Falta hoje'])
  expect(achados).not.toContain(ids['Concluido hoje'])
  expect(achados).not.toContain(ids['Cancelado amanha'])
})
