import { test, expect } from '@playwright/test'
import { banco, PREFIXO, criarLoginDeTeste } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * F69 — as campanhas e o push do levantamento das regras (07, 11/11/2026):
 *
 * - C51: a mesma pessoa é cliente de duas clínicas com um login só, e instalou
 *   o app pela B. A campanha da A gravava o sino e o celular não tocava, e o
 *   "vai receber" dizia 0. O aviso vai aos aparelhos de TODAS as fichas do
 *   login (`aparelhos_da_cliente`), e a conta também.
 * - C56: `push_tokens` é de uma pessoa OU de uma cliente; e o disparo da
 *   campanha é um por campanha, cliente e dia (índice único que reivindica).
 *
 * O C52 (o pós-visita) e o C74 (o lembrete de madrugada) eram da campanha
 * "Automática", que saiu em 2026-11-14 (MK1): o pós-visita e o lembrete são
 * modelos nas Automações, com o silêncio noturno delas.
 */

test.setTimeout(180_000)

const marca = Date.now().toString(36)
const db = () => banco()
let A: OutraRede
let B: OutraRede
let fichaA = ''
let fichaB = ''
let outraCliente = ''
let campanha = ''
let login = ''

test.beforeAll(async () => {
  A = await criarOutraRede(`cpla${marca}`)
  B = await criarOutraRede(`cplb${marca}`)
  fichaA = await A.criarCliente('Ana na A')
  fichaB = await B.criarCliente('Ana na B')
  login = await criarLoginDeTeste(db(), `e2e-cli-f69-${marca}@bellaris.invalid`, 'o login da Ana')
  for (const f of [fichaA, fichaB]) expect((await db().from('clients').update({ auth_id: login }).eq('id', f)).error).toBeNull()
  // O app instalado pela clínica B.
  expect((await db().from('push_tokens').insert({ token: `e2e-f69-${marca}`, platform: 'android', client_id: fichaB })).error).toBeNull()

  outraCliente = await A.criarCliente('Outra')

  const { data, error } = await db().from('notification_campaigns').insert({
    tenant_id: A.tenantId, name: `${PREFIXO} Agendada ${marca}`, status: 'DRAFT', type: 'SCHEDULED',
    title: 'Oi', body: 'Novidade', audience_rules: {}, scheduled_at: '2030-01-01T12:00:00Z',
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  campanha = data!.id
})

test.afterAll(async () => {
  await db().from('push_tokens').delete().eq('token', `e2e-f69-${marca}`)
  await db().from('notification_campaigns').delete().eq('tenant_id', A.tenantId)
  await A?.limpar(); await B?.limpar()
  if (login) await db().auth.admin.deleteUser(login)
})

test('C51: o "vai receber" conta o aparelho que ela registrou pela outra rede', async () => {
  const { data: n, error } = await db().rpc('publico_com_aparelho', { p_tenant: A.tenantId, p_filtros: { client_ids: [fichaA] } })
  expect(error, error?.message).toBeNull()
  expect(n, 'a Ana da A tem o celular registrado pela B').toBe(1)
  const { data: aparelhos, error: e2 } = await db().rpc('aparelhos_das_clientes', { p_clientes: [fichaA] })
  expect(e2, e2?.message).toBeNull()
  expect((aparelhos ?? []).map((a: { client_id: string; token: string | null }) => [a.client_id, a.token]))
    .toEqual([[fichaA, `e2e-f69-${marca}`]])
})

test('C56: o aparelho é de uma pessoa OU de uma cliente, nunca dos dois', async () => {
  const { error } = await db().from('push_tokens').insert({
    token: `e2e-f69-dois-${marca}`, platform: 'android', client_id: fichaA, user_id: A.professionalId,
  })
  await db().from('push_tokens').delete().eq('token', `e2e-f69-dois-${marca}`)
  expect(error, 'o banco recusa o aparelho dos dois').not.toBeNull()
})

test('C56: um disparo por campanha, cliente e dia — o segundo é recusado no banco', async () => {
  const linha = { campaign_id: campanha, client_id: outraCliente, status: 'SENT' }
  const um = await db().from('campaign_dispatches').insert(linha)
  expect(um.error).toBeNull()
  const dois = await db().from('campaign_dispatches').insert(linha)
  await db().from('campaign_dispatches').delete().eq('campaign_id', campanha)
  expect(dois.error, 'o mesmo dia, a mesma cliente: recusado').not.toBeNull()
})
