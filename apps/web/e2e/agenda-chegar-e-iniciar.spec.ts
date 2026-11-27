import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'
import { haMinutosHoje } from './apoio/datas'

/**
 * A21 da simulação de 2026-10-27: a profissional (agenda "só os meus") não via
 * "Iniciar atendimento" no agendamento só "Agendado" — o botão aparece em
 * Confirmado ou Chegou, e a janela não explicava. A Lívia contornou fazendo o
 * check-in ela mesma pela tela do atendimento.
 *
 * Agora a janela da agenda oferece a ela "Marcar chegada e iniciar": o MESMO
 * check-in (checkinCore) e depois o MESMO início (startAppointment). O botão
 * aparece no agendamento DELA; a ação é de quem tem a Agenda e o Atendimento
 * em Gerenciar, de quem for o agendamento (sem o "só os meus" — SM1, UM2,
 * o Heitor, 2026-11-23).
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let profissional: MembroDeTeste | null = null
let slug = ''
const HOJE = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
let hora = 8

async function agendado(rotulo: string, professionalId: string) {
  const cliente = await rede!.criarCliente(rotulo)
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: cliente, procedure_id: rede!.procedureId, professional_id: professionalId,
    status: 'SCHEDULED', source: 'INTERNAL', duration_min: 30, price: 0,
    // Agora, minutos atrás: iniciar mais de 30 min antes do horário pergunta (A32), e o teste é do gesto.
    scheduled_at: haMinutosHoje(hora++),
  }).select('id').single<{ id: string }>()
  expect(error, 'agendar').toBeNull()
  return data!.id
}
const situacao = async (id: string) => (await db().from('appointments').select('status, arrived_at, started_at').eq('id', id)
  .single<{ status: string; arrived_at: string | null; started_at: string | null }>()).data!

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: profissional!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`ce${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  profissional = await criarMembro(`cep${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Profissional',
    // Agenda e Prontuário em Gerenciar: o Atendimento em Gerenciar vem junto (comAtendimento).
    permissoes: [
      { modulo: 'agenda', nivel: 'MANAGE' },
      { modulo: 'clients', nivel: 'VIEW' },
      { modulo: 'medical_records', nivel: 'MANAGE' },
    ],
  })
  expect((await db().from('users').update({ provides_services: true }).eq('id', profissional.userId)).error).toBeNull()
})
test.afterAll(async () => {
  if (rede) await db().from('appointments').delete().eq('branch_id', rede.branchId)
  await profissional?.limpar(); await rede?.limpar()
})

test('a profissional marca a chegada e inicia, pela tela do atendimento, o agendamento só "Agendado"', async ({ browser }) => {
  const id = await agendado('Lívia', profissional!.userId)
  await como(browser, async p => {
    // Na "Minha agenda" o bloco é o link para a tela do atendimento.
    await p.goto(`/${slug}/agenda/${id}`)
    await expect(p.getByRole('button', { name: 'Iniciar atendimento' }), 'o "Agendado" não começa sem a chegada').toHaveCount(0)
    await p.getByRole('button', { name: 'Check-in e iniciar' }).click()
    await expect(p).toHaveURL(new RegExp(`/${slug}/agenda/${id}`))
    await expect.poll(async () => (await situacao(id)).status).toBe('IN_PROGRESS')
  })
  const depois = await situacao(id)
  expect(depois.status).toBe('IN_PROGRESS')
  expect(depois.arrived_at, 'passou pelo check-in').toBeTruthy()
  expect(depois.started_at).toBeTruthy()
  const { data: hist } = await db().from('appointment_history').select('action').eq('appointment_id', id)
  expect((hist ?? []).map(h => h.action)).toEqual(expect.arrayContaining(['CHECKIN', 'STARTED']))
})

test('a profissional da REDE marca a chegada e inicia pela janela da agenda', async ({ browser }) => {
  const daRede = await criarMembro(`cer${marca}`, {
    tenant: rede!.tenantId, rotulo: 'Profissional da rede',
    // Iniciar pede o Atendimento em Gerenciar (o Heitor, 18/11: "Só inicia e
    // conclui atendimento quem tem gerenciar no atendimento").
    permissoes: [
      { modulo: 'agenda', nivel: 'MANAGE' },
      { modulo: 'atendimento', nivel: 'MANAGE' },
      { modulo: 'clients', nivel: 'VIEW' },
    ],
  })
  try {
    expect((await db().from('users').update({ provides_services: true }).eq('id', daRede.userId)).error).toBeNull()
    const id = await agendado('Janela', daRede.userId)
    const ctx = await browser.newContext({ storageState: daRede.estado })
    try {
      const p = await ctx.newPage()
      await p.goto(`/admin/agenda?date=${HOJE}`)
      await p.locator(`[title*="Janela ce${marca}"]`).first().click()
      await expect(p.getByRole('button', { name: 'Iniciar atendimento' }), 'o "Agendado" não começa sem a chegada').toHaveCount(0)
      await p.getByRole('button', { name: 'Check-in e iniciar' }).click()
      await expect(p).toHaveURL(new RegExp(`/admin/agenda/${id}`))
    } finally { await ctx.close() }
    await expect.poll(async () => (await situacao(id)).status).toBe('IN_PROGRESS')
    expect((await situacao(id)).arrived_at).toBeTruthy()
  } finally {
    if (rede) await db().from('appointments').delete().eq('branch_id', rede.branchId).eq('professional_id', daRede.userId)
    await daRede.limpar()
  }
})

test('com a Agenda e o Atendimento em Gerenciar, marca a chegada e inicia também o agendamento de OUTRA profissional', async ({ browser }) => {
  // Sem o "só os meus" (SM1, o Heitor, 2026-11-23): Gerenciar mexe em todos;
  // a chegada é da Agenda e o início, do Atendimento (UM2).
  const id = await agendado('Outra', rede!.professionalId)
  await como(browser, async p => {
    const r = await chamarAcao(p, 'actions/appointments.ts', 'chegarEIniciar', `/${slug}/agenda`, [id, slug])
    expect(r.status).toBe(200)
  })
  await expect.poll(async () => (await situacao(id)).status).toBe('IN_PROGRESS')
  expect((await situacao(id)).arrived_at, 'passou pelo check-in').toBeTruthy()
})
