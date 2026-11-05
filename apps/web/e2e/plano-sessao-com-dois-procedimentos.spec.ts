import { test, expect, type Browser } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, clienteComSessao, type MembroDeTeste, type ClienteDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { apagarAgendamentos } from './apoio/limpeza'

/**
 * A36 da 6ª simulação (2026-11-04): a sessão de plano com Botox +
 * Preenchimento aparecia só como "Botox" na tela do atendimento e no app (o
 * procedimento do agendamento é um só), e o plano se chamava "Botox + 1 mais".
 *
 * Agora a sessão diz os dois — no título do atendimento, na Agenda e na home
 * do app — e o plano se chama pelos procedimentos ("Botox + Preenchimento").
 */
const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let equipe: MembroDeTeste | null = null
let cliente: ClienteDeTeste | null = null
let slug = ''
let agendamento = ''
let plano = ''
const BOTOX = `${PREFIXO} Botox ${marca}`
const PREENCHIMENTO = `${PREFIXO} Preenchimento ${marca}`
let preenchimentoId = ''

async function como<T>(browser: Browser, estado: string, fn: (p: import('@playwright/test').Page) => Promise<T>) {
  const ctx = await browser.newContext({ storageState: estado })
  try { return await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  test.setTimeout(120_000)
  rede = await criarOutraRede(`psd${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  expect((await db().from('procedures').update({ name: BOTOX, price: 800 }).eq('id', rede.procedureId)).error).toBeNull()
  const { data: pr, error: ePr } = await db().from('procedures')
    .insert({ tenant_id: rede.tenantId, name: PREENCHIMENTO, category: 'e2e', duration_min: 30, price: 1200 }).select('id').single<{ id: string }>()
  expect(ePr).toBeNull()
  preenchimentoId = pr!.id
  equipe = await criarMembro(`psde${marca}`, {
    tenant: rede.tenantId, rotulo: 'Equipe',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'medical_records', nivel: 'MANAGE' }],
  })
  cliente = await clienteComSessao(`psd${marca}`, { id: rede.branchId, slug }, { tenant: rede.tenantId })
  const { data: pl, error: ePl } = await db().from('treatment_plans').insert({
    branch_id: rede.branchId, professional_id: rede.professionalId, client_id: cliente.clientId, status: 'ACCEPTED', name: `${PREFIXO} Plano ${marca}`,
  }).select('id').single<{ id: string }>()
  expect(ePl).toBeNull()
  plano = pl!.id
  const { data: ap, error: eAp } = await db().from('appointments').insert({
    branch_id: rede.branchId, client_id: cliente.clientId, professional_id: rede.professionalId, procedure_id: rede.procedureId,
    scheduled_at: new Date(Date.now() + 3 * 86_400_000).toISOString(), duration_min: 110, price: 0, status: 'SCHEDULED', source: 'INTERNAL',
    treatment_plan_id: plano,
  }).select('id').single<{ id: string }>()
  expect(eAp).toBeNull()
  agendamento = ap!.id
  const { data: s, error: eS } = await db().from('treatment_plan_sessions').insert({ plan_id: plano, sort_order: 0, appointment_id: agendamento }).select('id').single<{ id: string }>()
  expect(eS).toBeNull()
  expect((await db().from('treatment_plan_session_procedures').insert([
    { session_id: s!.id, procedure_id: rede.procedureId, price: 800, sort_order: 0 },
    { session_id: s!.id, procedure_id: preenchimentoId, price: 1200, sort_order: 1 },
  ])).error).toBeNull()
})

test.afterAll(async () => {
  if (plano) {
    await db().from('treatment_plan_sessions').update({ appointment_id: null }).eq('plan_id', plano)
    expect(await apagarAgendamentos([agendamento])).toEqual([])
    await db().from('treatment_plans').delete().eq('id', plano)
  }
  if (preenchimentoId) await db().from('procedures').delete().eq('id', preenchimentoId)
  await cliente?.limpar(); await equipe?.limpar(); await rede?.limpar()
})

// D5 da 7ª simulação: a sessão Criolipólise + Drenagem grava 110 min, e a
// tela do atendimento dizia "Duração prevista 60 min" (a do procedimento
// principal). A duração é a do AGENDAMENTO.
test('a duração prevista da sessão é a do agendamento, não a do procedimento principal (D5)', async ({ browser }) => {
  const { data: proc } = await db().from('procedures').select('duration_min').eq('id', rede!.procedureId).single<{ duration_min: number }>()
  expect(proc!.duration_min, 'o procedimento principal tem outra duração').not.toBe(110)
  await como(browser, equipe!.estado, async p => {
    await p.goto(`/admin/agenda/${agendamento}`)
    const duracao = p.getByText('Duração prevista').locator('..')
    await expect(duracao).toContainText('110 min')
  })
})

test('a sessão diz os dois procedimentos — no atendimento, na ficha e no app', async ({ browser }) => {
  const dois = `${BOTOX} + ${PREENCHIMENTO}`
  await como(browser, equipe!.estado, async p => {
    await p.goto(`/admin/agenda/${agendamento}`)
    await expect(p.getByRole('heading', { level: 1 })).toHaveText(dois)
    await p.goto(`/admin/clients/${cliente!.clientId}`)
    await expect(p.getByText(dois).first(), 'o plano se chama pelos procedimentos').toBeVisible()
    await expect(p.getByText(/\+ 1 mais/)).toHaveCount(0)
  })
  await como(browser, cliente!.estado, async p => {
    await p.goto(`/${slug}/cliente/agendamentos`)
    await expect(p.getByText(dois).first()).toBeVisible()
    await p.goto(`/${slug}/cliente/home`)
    await expect(p.getByText(dois).first()).toBeVisible()
  })
})
