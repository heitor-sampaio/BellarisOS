import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'

/**
 * A21 da simulação de 2026-10-27: a profissional (agenda "só os meus") não via
 * "Iniciar atendimento" no agendamento só "Agendado" — o botão aparece em
 * Confirmado ou Chegou, e a janela não explicava. A Lívia contornou fazendo o
 * check-in ela mesma pela tela do atendimento.
 *
 * Agora a janela da agenda oferece a ela "Marcar chegada e iniciar": o MESMO
 * check-in (checkinCore) e depois o MESMO início (startAppointment). Só no
 * agendamento DELA.
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
    scheduled_at: new Date(`${HOJE}T${String(hora++).padStart(2, '0')}:00:00-03:00`).toISOString(),
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
    permissoes: [
      { modulo: 'agenda', nivel: 'MANAGE', escopo: 'OWN' },
      { modulo: 'clients', nivel: 'VIEW' },
      { modulo: 'medical_records', nivel: 'MANAGE', escopo: 'OWN' },
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
    await p.getByRole('button', { name: 'Marcar chegada e iniciar' }).click()
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

test('a profissional da REDE ("só os meus") marca a chegada e inicia pela janela da agenda', async ({ browser }) => {
  const daRede = await criarMembro(`cer${marca}`, {
    tenant: rede!.tenantId, rotulo: 'Profissional da rede',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE', escopo: 'OWN' }, { modulo: 'clients', nivel: 'VIEW' }],
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
      await p.getByRole('button', { name: 'Marcar chegada e iniciar' }).click()
      await expect(p).toHaveURL(new RegExp(`/admin/agenda/${id}`))
    } finally { await ctx.close() }
    await expect.poll(async () => (await situacao(id)).status).toBe('IN_PROGRESS')
    expect((await situacao(id)).arrived_at).toBeTruthy()
  } finally {
    if (rede) await db().from('appointments').delete().eq('branch_id', rede.branchId).eq('professional_id', daRede.userId)
    await daRede.limpar()
  }
})

test('no agendamento de OUTRA profissional, "só os meus" não marca a chegada nem inicia', async ({ browser }) => {
  const id = await agendado('Outra', rede!.professionalId)
  await como(browser, async p => {
    const r = await chamarAcao(p, 'actions/appointments.ts', 'chegarEIniciar', `/${slug}/agenda`, [id, slug])
    expect(r.texto).toMatch(/responsável/)
  })
  expect((await situacao(id)).status).toBe('SCHEDULED')
})
