import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'

/**
 * O check-in: "Chegou" (2026-10-21, decisão do Heitor; atrito da simulação de
 * um dia de clínica). Confirmar e fazer check-in gravavam o MESMO status
 * (CONFIRMED): a recepção não distinguia quem confirmou presença de quem já
 * está na sala de espera.
 *
 * Agora: Agendado → Confirmado (a cliente confirmou) → Chegou (está na
 * clínica, com a hora) → Em atendimento. O check-in vale de Agendado ou de
 * Confirmado; o atendimento começa de Confirmado ou de Chegou, como antes.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let recepcao: MembroDeTeste | null = null
const HOJE = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
let hora = 8

async function agendado(rotulo: string) {
  const cliente = await rede!.criarCliente(rotulo)
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: cliente, procedure_id: rede!.procedureId, professional_id: rede!.professionalId,
    status: 'SCHEDULED', source: 'INTERNAL', duration_min: 30, price: 0,
    scheduled_at: new Date(`${HOJE}T${String(hora++).padStart(2, '0')}:00:00-03:00`).toISOString(),
  }).select('id').single<{ id: string }>()
  expect(error, 'agendar').toBeNull()
  return data!.id
}
const situacao = async (id: string) => (await db().from('appointments').select('status, confirmed_at, arrived_at').eq('id', id)
  .single<{ status: string; confirmed_at: string | null; arrived_at: string | null }>()).data!

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: recepcao!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`ci${marca}`)
  recepcao = await criarMembro(`cir${marca}`, {
    tenant: rede.tenantId, rotulo: 'Recepção', permissoes: [{ modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'VIEW' }],
  })
})
test.afterAll(async () => { await recepcao?.limpar(); await rede?.limpar() })

test.describe.serial('o check-in', () => {
  test('confirmar e chegar são passos diferentes: Confirmado, depois Chegou, com a hora', async ({ browser }) => {
    const id = await agendado('Chegada')
    await como(browser, async p => {
      await p.goto(`/admin/agenda?date=${HOJE}`)
      const bloco = p.locator(`[title*="Chegada ci${marca}"]`).first()
      await bloco.click()
      await p.getByRole('button', { name: 'Confirmar agendamento' }).click()
      await expect.poll(async () => (await situacao(id)).status).toBe('CONFIRMED')

      await p.reload()
      await p.locator(`[title*="Chegada ci${marca}"]`).first().click()
      await p.getByRole('button', { name: 'Chegou' }).click()
      await expect.poll(async () => (await situacao(id)).status).toBe('ARRIVED')
      await p.reload()
      await expect(p.locator(`[title*="Chegada ci${marca}"]`).first(), 'a grade mostra quem está na espera').toContainText('Chegou')
    })
    expect((await situacao(id)).arrived_at, 'a hora da chegada').toBeTruthy()
  })

  test('o check-in vale direto de Agendado, e o atendimento começa de quem chegou', async ({ browser }) => {
    const id = await agendado('Direto')
    await como(browser, async p => {
      const r = await chamarAcao(p, 'actions/appointments.ts', 'checkinAppointment', `/admin/agenda/${id}`, [id, ''])
      expect(r.texto).not.toMatch(/só é possível/)
    })
    const depois = await situacao(id)
    expect(depois.status).toBe('ARRIVED')
    expect(depois.confirmed_at, 'chegar também confirma').toBeTruthy()

    await como(browser, async p => {
      await chamarAcao(p, 'actions/appointments.ts', 'startAppointment', `/admin/agenda/${id}`, [id, ''])
    })
    expect((await situacao(id)).status).toBe('IN_PROGRESS')
  })
})
