import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO, criarLoginDeTeste } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { addDaysTZ, dayKeyTZ, instanteNoFuso } from '../lib/datetime'

/**
 * F69 — as campanhas e o push do levantamento das regras (07, 11/11/2026):
 *
 * - C51: a mesma pessoa é cliente de duas clínicas com um login só, e instalou
 *   o app pela B. A campanha da A gravava o sino e o celular não tocava, e o
 *   "vai receber" dizia 0. O aviso vai aos aparelhos de TODAS as fichas do
 *   login (`aparelhos_da_cliente`), e a conta também.
 * - C52: o "N dias depois do último atendimento" pegava quem concluiu naquele
 *   dia mesmo tendo voltado depois. Só quem não tem concluído depois do dia-alvo.
 * - C56: `push_tokens` é de uma pessoa OU de uma cliente; e o disparo da
 *   campanha é um por campanha, cliente e dia (índice único que reivindica).
 * - C74 (D17): o lembrete da campanha avisa quando cai de madrugada e tem a
 *   opção, desligada, de mandar na véspera às 20:00.
 */

test.setTimeout(180_000)

const marca = Date.now().toString(36)
const db = () => banco()
let A: OutraRede
let B: OutraRede
let membro: MembroDeTeste
let fichaA = ''
let fichaB = ''
let voltou = ''
let naoVoltou = ''
let campanhaVisita = ''
let login = ''

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: membro.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

/** Meio-dia de N dias atrás, em Brasília: longe da virada do dia. */
const meioDiaHa = (dias: number) => instanteNoFuso(dayKeyTZ(addDaysTZ(new Date(), -dias)), '12:00')

async function concluido(clientId: string, quando: Date) {
  const { error } = await db().from('appointments').insert({
    branch_id: A.branchId, client_id: clientId, procedure_id: A.procedureId, professional_id: A.professionalId,
    status: 'COMPLETED', source: 'INTERNAL', duration_min: 30, price: 0,
    scheduled_at: quando.toISOString(), completed_at: quando.toISOString(),
  })
  expect(error, error?.message).toBeNull()
}

test.beforeAll(async () => {
  A = await criarOutraRede(`cpla${marca}`)
  B = await criarOutraRede(`cplb${marca}`)
  fichaA = await A.criarCliente('Ana na A')
  fichaB = await B.criarCliente('Ana na B')
  login = await criarLoginDeTeste(db(), `e2e-cli-f69-${marca}@bellaris.invalid`, 'o login da Ana')
  for (const f of [fichaA, fichaB]) expect((await db().from('clients').update({ auth_id: login }).eq('id', f)).error).toBeNull()
  // O app instalado pela clínica B.
  expect((await db().from('push_tokens').insert({ token: `e2e-f69-${marca}`, platform: 'android', client_id: fichaB })).error).toBeNull()

  voltou = await A.criarCliente('Voltou depois')
  naoVoltou = await A.criarCliente('Não voltou')
  await concluido(voltou, meioDiaHa(7))
  await concluido(voltou, meioDiaHa(2))
  await concluido(naoVoltou, meioDiaHa(7))

  const { data, error } = await db().from('notification_campaigns').insert({
    tenant_id: A.tenantId, name: `${PREFIXO} Pós-visita ${marca}`, status: 'DRAFT', type: 'AUTOMATED',
    title: 'Oi', body: 'Como ficou?', audience_rules: {}, trigger_type: 'DAYS_AFTER_VISIT', trigger_config: { days: 7 },
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  campanhaVisita = data!.id
  membro = await criarMembro(`cplm${marca}`, { tenant: A.tenantId, rotulo: 'Marketing', permissoes: [{ modulo: 'marketing', nivel: 'MANAGE' }] })
})

test.afterAll(async () => {
  await db().from('push_tokens').delete().eq('token', `e2e-f69-${marca}`)
  await db().from('notification_campaigns').delete().eq('tenant_id', A.tenantId)
  await membro?.limpar()
  await A?.limpar(); await B?.limpar()
  if (login) await db().auth.admin.deleteUser(login)
})

test('C51: o "vai receber" conta o aparelho que ela registrou pela outra clínica', async () => {
  const { data: n, error } = await db().rpc('publico_com_aparelho', { p_tenant: A.tenantId, p_filtros: { client_ids: [fichaA] } })
  expect(error, error?.message).toBeNull()
  expect(n, 'a Ana da A tem o celular registrado pela B').toBe(1)
  const { data: aparelhos, error: e2 } = await db().rpc('aparelhos_das_clientes', { p_clientes: [fichaA] })
  expect(e2, e2?.message).toBeNull()
  expect((aparelhos ?? []).map((a: { client_id: string; token: string | null }) => [a.client_id, a.token]))
    .toEqual([[fichaA, `e2e-f69-${marca}`]])
})

test('C52: o Pós-visita 7 dias não conta quem voltou depois', async ({ browser }) => {
  await como(browser, async p => {
    await p.goto(`/admin/notificacoes/${campanhaVisita}`)
    await expect(p.locator('[data-receberiam-hoje]')).toContainText('1 cliente fez 7 dias', { timeout: 20_000 })
  })
})

test('C56: o aparelho é de uma pessoa OU de uma cliente, nunca dos dois', async () => {
  const { error } = await db().from('push_tokens').insert({
    token: `e2e-f69-dois-${marca}`, platform: 'android', client_id: fichaA, user_id: A.professionalId,
  })
  await db().from('push_tokens').delete().eq('token', `e2e-f69-dois-${marca}`)
  expect(error, 'o banco recusa o aparelho dos dois').not.toBeNull()
})

test('C56: um disparo por campanha, cliente e dia — o segundo é recusado no banco', async () => {
  const linha = { campaign_id: campanhaVisita, client_id: naoVoltou, status: 'SENT' }
  const um = await db().from('campaign_dispatches').insert(linha)
  expect(um.error).toBeNull()
  const dois = await db().from('campaign_dispatches').insert(linha)
  await db().from('campaign_dispatches').delete().eq('campaign_id', campanhaVisita)
  expect(dois.error, 'o mesmo dia, a mesma cliente: recusado').not.toBeNull()
})

test('C74: o lembrete diz quando cai de madrugada e oferece a véspera às 20:00, desligada', async ({ browser }) => {
  await como(browser, async p => {
    await p.goto('/admin/notificacoes/nova')
    await p.getByRole('button', { name: /Automática/ }).first().click()
    await p.getByRole('button', { name: /Lembrete de agenda/ }).click()
    await expect(p.getByRole('button', { name: /Lembrete de agenda/ })).toContainText('agendado ou confirmado')
    await p.getByRole('button', { name: '2h', exact: true }).click()
    const aviso = p.locator('[data-lembrete-de-madrugada]')
    await expect(aviso).toContainText('entre 23:00 e 10:00')
    const vespera = p.getByRole('checkbox', { name: /Se cair de madrugada, mandar na véspera às 20:00/ })
    await expect(vespera).not.toBeChecked()
  })
})
