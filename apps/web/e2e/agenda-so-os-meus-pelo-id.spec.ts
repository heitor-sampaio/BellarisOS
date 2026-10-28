import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao, chamarAcaoComFormulario } from './apoio/acao-direta'

/**
 * D4 da simulação de 2026-10-28: a profissional com a agenda "só os meus"
 * abria PELA URL o atendimento de outra profissional (`/<unidade>/agenda/<id>`)
 * e registrava o check-in. A página só pedia `agenda: VIEW`, e o check-in não
 * conferia o dono ("é da recepção"). O clínico não vazou — mas o §11 diz que
 * o escopo vale também para o id, não só para a lista.
 *
 * Decisão: com a agenda OWN, a tela do atendimento de outro profissional é
 * "sem acesso", e as actions pelo id recusam o agendamento de outro: check-in,
 * iniciar pelo status, trocar o profissional, remarcar, cancelar e salvar a
 * evolução. A recepção (ALL) segue fazendo o de todos — é o controle.
 */

const SEM_ACESSO = 'Você não tem acesso a esta área'
const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let slug = ''
let propria: MembroDeTeste | null = null
let recepcao: MembroDeTeste | null = null
const HOJE = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
let hora = 7

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
const situacao = async (id: string) => (await db().from('appointments')
  .select('status, professional_id, scheduled_at, arrived_at').eq('id', id)
  .single<{ status: string; professional_id: string; scheduled_at: string; arrived_at: string | null }>()).data!

async function como(browser: Browser, quem: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: quem.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

/** As actions "pelo id" de um agendamento, como a pessoa logada. */
function acoes(p: Page, rotaDaSessao: string) {
  return {
    checkin:   (id: string) => chamarAcao(p, 'actions/appointments.ts', 'checkinAppointment', rotaDaSessao, [id, slug]),
    iniciar:   (id: string) => chamarAcao(p, 'actions/appointments.ts', 'updateAppointmentStatus', `/${slug}/agenda`, [id, 'IN_PROGRESS', slug]),
    trocar:    (id: string, para: string) => chamarAcao(p, 'actions/appointments.ts', 'reassignProfessional', rotaDaSessao, [id, para, slug]),
    remarcar:  (id: string, quando: string) => chamarAcaoComFormulario(p, 'actions/appointments.ts', 'rescheduleAppointment', `/${slug}/agenda`,
      [undefined], { _appointmentId: id, scheduled_at: quando, professional_id: '', _slug: slug }),
    cancelar:  (id: string) => chamarAcaoComFormulario(p, 'actions/appointments.ts', 'cancelAppointmentSession', rotaDaSessao,
      [null], { appointment_id: id, cancellation_reason: `${marca} motivo`, slug }),
    evolucao:  (id: string) => chamarAcaoComFormulario(p, 'actions/appointments.ts', 'saveDraftNotes', rotaDaSessao,
      [null], { appointment_id: id, notes: `evolução ${marca}`, intercurrences: '' }),
  }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`om${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  // A "outra" profissional: a do apoio, posta na unidade.
  expect((await db().from('users').update({ branch_id: rede.branchId, provides_services: true }).eq('id', rede.professionalId)).error).toBeNull()
  propria = await criarMembro(`omp${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Profissional',
    permissoes: [
      { modulo: 'agenda', nivel: 'MANAGE', escopo: 'OWN' },
      { modulo: 'clients', nivel: 'VIEW' },
      { modulo: 'medical_records', nivel: 'MANAGE', escopo: 'OWN' },
    ],
  })
  expect((await db().from('users').update({ provides_services: true }).eq('id', propria.userId)).error).toBeNull()
  recepcao = await criarMembro(`omr${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Recepção',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE', escopo: 'ALL' }, { modulo: 'clients', nivel: 'VIEW' }],
  })
})
test.afterAll(async () => {
  if (rede) {
    const ids = ((await db().from('appointments').select('id').eq('branch_id', rede.branchId)).data ?? []).map(a => a.id)
    if (ids.length) {
      await db().from('medical_record_entries').delete().in('appointment_id', ids)
      await db().from('appointment_history').delete().in('appointment_id', ids)
    }
    await db().from('appointments').delete().eq('branch_id', rede.branchId)
  }
  await propria?.limpar(); await recepcao?.limpar(); await rede?.limpar()
})

test('"só os meus": a tela do atendimento de outra profissional é sem acesso; a dela abre, e a recepção abre a de todas', async ({ browser }) => {
  const daOutra = await agendado('Bianca', rede!.professionalId)
  const dela    = await agendado('Helena', propria!.userId)
  await como(browser, propria!, async p => {
    await p.goto(`/${slug}/agenda/${daOutra}`)
    await expect(p.getByRole('heading', { name: SEM_ACESSO }), 'a de outra').toBeVisible()
    await p.goto(`/${slug}/agenda/${dela}`)
    await expect(p.getByText(`Helena om${marca}`).first(), 'a dela').toBeVisible()
    await expect(p.getByText(SEM_ACESSO)).toHaveCount(0)
  })
  await como(browser, recepcao!, async p => {
    await p.goto(`/${slug}/agenda/${daOutra}`)
    await expect(p.getByText(`Bianca om${marca}`).first(), 'a recepção abre a de outra').toBeVisible()
    await expect(p.getByText(SEM_ACESSO)).toHaveCount(0)
  })
})

test('"só os meus" não marca a chegada do agendamento de outra pelo id; a recepção marca', async ({ browser }) => {
  const daOutra = await agendado('Luíza', rede!.professionalId)
  const dela    = await agendado('Sessão', propria!.userId)
  await como(browser, propria!, async p => {
    const r = await acoes(p, `/${slug}/agenda/${dela}`).checkin(daOutra)
    expect(r.texto, 'a recusa diz por quê').toMatch(/outro profissional/)
  })
  expect((await situacao(daOutra)).status, 'continua agendado').toBe('SCHEDULED')
  await como(browser, recepcao!, async p => {
    await acoes(p, `/${slug}/agenda/${daOutra}`).checkin(daOutra)
  })
  expect((await situacao(daOutra)).status, 'a recepção marcou').toBe('ARRIVED')
})

test('"só os meus" não inicia, não troca, não remarca, não cancela nem escreve a evolução do agendamento de outra pelo id', async ({ browser }) => {
  const daOutra = await agendado('Mariana', rede!.professionalId)
  const dela    = await agendado('Própria', propria!.userId)
  const antes   = await situacao(daOutra)
  const outraHora = new Date(new Date(antes.scheduled_at).getTime() + 10 * 3600_000).toISOString()
  await como(browser, propria!, async p => {
    const a = acoes(p, `/${slug}/agenda/${dela}`)
    await a.iniciar(daOutra)
    expect.soft((await situacao(daOutra)).status, 'iniciar pelo status').toBe('SCHEDULED')
    await a.trocar(daOutra, propria!.userId)
    expect.soft((await situacao(daOutra)).professional_id, 'trocar para si').toBe(rede!.professionalId)
    await a.remarcar(daOutra, outraHora)
    expect.soft((await situacao(daOutra)).scheduled_at, 'remarcar').toBe(antes.scheduled_at)
    await a.cancelar(daOutra)
    expect.soft((await situacao(daOutra)).status, 'cancelar').toBe('SCHEDULED')
    await a.evolucao(daOutra)
    const { data: entrada } = await db().from('medical_record_entries').select('id').eq('appointment_id', daOutra).maybeSingle()
    expect.soft(entrada, 'a evolução no atendimento de outra').toBeNull()
  })

  // Controle: a recepção (ALL) faz o mesmo no de outra — o argumento estava certo.
  const controle = await agendado('Controle', rede!.professionalId)
  const doControle = await situacao(controle)
  await como(browser, recepcao!, async p => {
    const a = acoes(p, `/${slug}/agenda/${controle}`)
    await a.remarcar(controle, new Date(new Date(doControle.scheduled_at).getTime() + 11 * 3600_000).toISOString())
    expect((await situacao(controle)).scheduled_at, 'a recepção remarca').not.toBe(doControle.scheduled_at)
    await a.trocar(controle, propria!.userId)
    expect((await situacao(controle)).professional_id, 'a recepção troca').toBe(propria!.userId)
    await a.cancelar(controle)
    expect((await situacao(controle)).status, 'a recepção cancela').toBe('CANCELLED')
  })
})

test('"só os meus" segue fazendo tudo isso no agendamento DELA', async ({ browser }) => {
  const dela = await agendado('Dela', propria!.userId)
  await como(browser, propria!, async p => {
    const a = acoes(p, `/${slug}/agenda/${dela}`)
    await a.evolucao(dela)
    const { data: entrada } = await db().from('medical_record_entries').select('notes').eq('appointment_id', dela).maybeSingle()
    expect(entrada?.notes, 'a evolução no dela').toBe(`evolução ${marca}`)
    await a.iniciar(dela)
    expect((await situacao(dela)).status, 'iniciar o dela').toBe('IN_PROGRESS')
  })
})
