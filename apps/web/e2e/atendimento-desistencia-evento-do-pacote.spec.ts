import { test, expect } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * A desistência no meio gasta a sessão do pacote (o Heitor, 2026-11-18: "Não
 * existe isso de desistir no meio do atendimento. Se isso por ventura
 * acontecer, problema de quem desistir.") — e agora emite o MESMO fato da
 * conclusão, "Sessão de pacote usada" (`pacote.sessao_usada`), com as
 * restantes: a automação de "acabou, renove" via a sessão sumir sem o fato.
 *
 * O gatilho (`pre_pago_libera`) vale em todo caminho do cancelamento do
 * iniciado (a desistência com insumo, o cancelar direto, o Copilot): aqui pelo
 * banco. O controle: cancelar ANTES de iniciar devolve a sessão e não emite.
 *
 * Numa rede [e2e] própria.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null

test.beforeAll(async () => { rede = await criarOutraRede(`dsev${marca}`) })
test.afterAll(async () => { await rede?.limpar() })

async function pacoteCom(sessoes: number) {
  const cliente = await rede!.criarCliente(`Cliente desistência ${marca}`)
  const { data: sp, error: e1 } = await db().from('service_packages').insert({
    tenant_id: rede!.tenantId, procedure_id: rede!.procedureId, name: `${PREFIXO} Pacote desistência ${marca}`, total_sessions: sessoes, price: 300,
  }).select('id').single<{ id: string }>()
  expect(e1).toBeNull()
  const { data: cp, error: e2 } = await db().from('client_packages').insert({
    client_id: cliente, package_id: sp!.id, branch_id: rede!.branchId, total_sessions: sessoes, used_sessions: sessoes - 1,
  }).select('id').single<{ id: string }>()
  expect(e2).toBeNull()
  return { cliente, pacote: cp!.id }
}

async function agendamentoDaSessao(cliente: string, pacote: string, status: 'IN_PROGRESS' | 'SCHEDULED', n: number) {
  const { data: ap, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: cliente, procedure_id: rede!.procedureId, professional_id: rede!.professionalId,
    scheduled_at: new Date().toISOString(), duration_min: 30, price: 0, status, source: 'INTERNAL',
    ...(status === 'IN_PROGRESS' ? { started_at: new Date().toISOString() } : {}),
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  expect((await db().from('package_sessions').insert({ client_package_id: pacote, appointment_id: ap!.id, status: 'AVAILABLE', session_number: n })).error).toBeNull()
  return ap!.id
}

const fatosDo = async (agendamento: string) => (await db().from('domain_events')
  .select('nome, entidade, entidade_id, dados, origem, chave').eq('tenant_id', rede!.tenantId)
  .eq('chave', `pacote.sessao_usada:${agendamento}`)).data ?? []

test('a desistência (iniciado → cancelado) emite "Sessão de pacote usada" uma vez, com as restantes', async () => {
  // A última sessão do pacote: a desistência a gasta, e restam 0.
  const { cliente, pacote } = await pacoteCom(2)
  const ap = await agendamentoDaSessao(cliente, pacote, 'IN_PROGRESS', 2)
  expect((await db().from('appointments').update({ status: 'CANCELLED', cancellation_reason: `${PREFIXO} passou mal` }).eq('id', ap)).error).toBeNull()

  expect((await db().from('package_sessions').select('status').eq('appointment_id', ap).single()).data?.status, 'a sessão fica usada').toBe('USED')
  const fatos = await fatosDo(ap)
  expect(fatos, 'um fato só').toHaveLength(1)
  expect(fatos[0]).toMatchObject({
    nome: 'pacote.sessao_usada', entidade: 'pacote', entidade_id: pacote, origem: 'banco',
    dados: { clienteId: cliente, agendamentoId: ap, restantes: 0, pacoteNome: `${PREFIXO} Pacote desistência ${marca}` },
  })
})

test('o controle: cancelar ANTES de iniciar devolve a sessão e não emite o fato', async () => {
  const { cliente, pacote } = await pacoteCom(3)
  const ap = await agendamentoDaSessao(cliente, pacote, 'SCHEDULED', 3)
  expect((await db().from('appointments').update({ status: 'CANCELLED', cancellation_reason: `${PREFIXO} remarcou` }).eq('id', ap)).error).toBeNull()
  expect(await fatosDo(ap)).toEqual([])
  expect((await db().from('package_sessions').select('appointment_id, status').eq('client_package_id', pacote).single()).data)
    .toEqual({ appointment_id: null, status: 'AVAILABLE' })
})
