import { test, expect, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { clienteComSessao, type ClienteDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'
import { diaEmQueAUnidadeAbre } from './apoio/datas'

/**
 * A cliente agenda pelo app um procedimento que ela JÁ PAGOU (2026-10-21,
 * decisão do Heitor; risco visto na simulação de um dia de clínica): o
 * agendamento nascia solto, com o preço de tabela, e o checkout cobraria de
 * novo. Agora nasce ligado à sessão paga e livre — a do plano vendido
 * (ACCEPTED); sem ela, o crédito de pacote ou de pré-pago, como a equipe faz.
 * Sem nada pago, segue avulso.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let cliente: ClienteDeTeste | null = null
let slug = ''
let plano = ''
let sessao = ''
// Amanhã, ou o seguinte em que a unidade abre (num sábado, amanhã é domingo).
const AMANHA = diaEmQueAUnidadeAbre(1)

async function agendar(p: Page, hora: string) {
  const r = await chamarAcao(p, 'actions/appointments.ts', 'createClientAppointment', `/${slug}/cliente/agendamentos/novo`, [{
    branchId: rede!.branchId, procedureId: rede!.procedureId, professionalId: rede!.professionalId,
    scheduledAt: new Date(`${AMANHA}T${hora}:00-03:00`).toISOString(), slug,
  }])
  const id = /"id":"([0-9a-f-]{36})"/.exec(r.texto)?.[1]
  expect(id, `agendou: ${r.texto.slice(0, 200)}`).toBeTruthy()
  return id!
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`pg${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  expect((await db().from('users').update({ branch_id: rede.branchId, provides_services: true }).eq('id', rede.professionalId)).error).toBeNull()
  expect((await db().from('procedures').update({ visible_on_client_app: true, price: 200, duration_min: 30 }).eq('id', rede.procedureId)).error).toBeNull()
  cliente = await clienteComSessao(`pgc${marca}`, { id: rede.branchId, slug }, { tenant: rede.tenantId })
  const { data: pl, error } = await db().from('treatment_plans').insert({
    branch_id: rede.branchId, professional_id: rede.professionalId, client_id: cliente.clientId, status: 'ACCEPTED', name: `[e2e] Plano ${marca}`,
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  plano = pl!.id
  const { data: se, error: eS } = await db().from('treatment_plan_sessions').insert({ plan_id: plano, sort_order: 1 }).select('id').single<{ id: string }>()
  expect(eS).toBeNull()
  sessao = se!.id
  expect((await db().from('treatment_plan_session_procedures').insert({ session_id: sessao, procedure_id: rede.procedureId, price: 150, sort_order: 0 })).error).toBeNull()
})
test.afterAll(async () => {
  if (plano) {
    await db().from('treatment_plan_sessions').update({ appointment_id: null }).eq('plan_id', plano)
    await db().from('appointments').delete().eq('client_id', cliente!.clientId)
    await db().from('treatment_plan_session_procedures').delete().eq('session_id', sessao)
    await db().from('treatment_plan_sessions').delete().eq('plan_id', plano)
    await db().from('treatment_plans').delete().eq('id', plano)
  }
  await cliente?.limpar(); await rede?.limpar()
})

test('com sessão paga no plano, o agendamento pelo app nasce como ela — e o segundo, sem sessão livre, avulso', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: cliente!.estado })
  try {
    const p = await ctx.newPage()
    await p.goto(`/${slug}/cliente/home`)
    const primeiro = await agendar(p, '10:00')
    const { data: ap } = await db().from('appointments').select('treatment_plan_id, price').eq('id', primeiro).single()
    expect(ap, 'ligado ao plano, com o preço da sessão').toEqual({ treatment_plan_id: plano, price: 150 })
    expect((await db().from('treatment_plan_sessions').select('appointment_id').eq('id', sessao).single()).data?.appointment_id).toBe(primeiro)

    const segundo = await agendar(p, '11:00')
    const { data: ap2 } = await db().from('appointments').select('treatment_plan_id, price').eq('id', segundo).single()
    expect(ap2, 'sem sessão livre: avulso, preço de tabela').toEqual({ treatment_plan_id: null, price: 200 })
  } finally {
    await ctx.close()
  }
})
