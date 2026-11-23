import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao, chamarAcaoComFormulario } from './apoio/acao-direta'
import { haMinutosHoje } from './apoio/datas'

/**
 * D4 da simulação de 2026-10-28: a profissional com a agenda "só os meus"
 * abria PELA URL o atendimento de outra profissional (`/<unidade>/agenda/<id>`)
 * e registrava o check-in. A decisão era recusar pelo id o agendamento de
 * outra (a tela dizia "Este atendimento é de outra pessoa que atende").
 *
 * Sem o "só os meus" (SM1, o Heitor, 2026-11-23: "pode tirar, as vistas
 * pessoais resolvem"), o módulo dá TUDO, pelo id também: quem tem a Agenda em
 * Gerenciar marca a chegada, troca, remarca e cancela o de qualquer um; o
 * Atendimento em Ver abre a tela e em Gerenciar inicia (UM1, UM2); o
 * Prontuário em Gerenciar escreve a evolução (UM4). O que fica só "dela" é a
 * vista pessoal (SM2): quem atende e não tem o Atendimento abre só a tela do
 * atendimento DELA.
 */

const SEM_ACESSO = 'Você não tem acesso a esta área'
const NAO_ENCONTRADA = 'Página não encontrada'
const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let slug = ''
let propria: MembroDeTeste | null = null
let recepcao: MembroDeTeste | null = null
let pessoal: MembroDeTeste | null = null
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
    // Confirmado o início adiantado (A32): o teste é do alcance, e o horário de teste pode estar adiante.
    iniciar:   (id: string) => chamarAcao(p, 'actions/appointments.ts', 'updateAppointmentStatus', `/${slug}/agenda`, [id, 'IN_PROGRESS', slug, null, { inicioAdiantadoConfirmado: true }]),
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
    // Agenda e Prontuário em Gerenciar: o Atendimento em Gerenciar vem junto (comAtendimento).
    permissoes: [
      { modulo: 'agenda', nivel: 'MANAGE' },
      { modulo: 'clients', nivel: 'VIEW' },
      { modulo: 'medical_records', nivel: 'MANAGE' },
    ],
  })
  expect((await db().from('users').update({ provides_services: true }).eq('id', propria.userId)).error).toBeNull()
  // A vista pessoal (SM2): atende e não tem a Agenda nem o Atendimento.
  pessoal = await criarMembro(`omv${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Vista pessoal',
    permissoes: [{ modulo: 'agenda', nivel: 'NONE' }],
  })
  expect((await db().from('users').update({ provides_services: true }).eq('id', pessoal.userId)).error).toBeNull()
  recepcao = await criarMembro(`omr${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Recepção',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'VIEW' }],
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
  await pessoal?.limpar(); await propria?.limpar(); await recepcao?.limpar(); await rede?.limpar()
})

test('com o Atendimento, a tela do atendimento de outra profissional abre; na vista pessoal, só a dela', async ({ browser }) => {
  // Sem o "só os meus" (SM1) e a tela abre com o Atendimento em Ver (UM1); a
  // vista pessoal (SM2) abre só o atendimento DELA (o Heitor, 2026-11-23).
  const daOutra = await agendado('Bianca', rede!.professionalId)
  const dela    = await agendado('Helena', pessoal!.userId)
  await como(browser, propria!, async p => {
    await p.goto(`/${slug}/agenda/${daOutra}`)
    await expect(p.getByText(`Bianca om${marca}`).first(), 'a de outra abre').toBeVisible()
    await expect(p.getByText(SEM_ACESSO)).toHaveCount(0)
    await expect(p.getByRole('heading', { name: NAO_ENCONTRADA })).toHaveCount(0)
  })
  await como(browser, pessoal!, async p => {
    await p.goto(`/${slug}/agenda/${daOutra}`)
    await expect(p.getByText(SEM_ACESSO), 'a vista pessoal não abre a de outra').toBeVisible()
    await expect(p.getByText(`Bianca om${marca}`), 'nada do atendimento vaza: nem a cliente').toHaveCount(0)
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

test('com a Agenda em Gerenciar, a profissional marca a chegada do agendamento de outra pelo id', async ({ browser }) => {
  // Sem o "só os meus" (SM1, o Heitor, 2026-11-23): a chegada é da Agenda, de qualquer um.
  const daOutra = await agendado('Luíza', rede!.professionalId)
  const dela    = await agendado('Sessão', propria!.userId)
  await como(browser, propria!, async p => {
    await acoes(p, `/${slug}/agenda/${dela}`).checkin(daOutra)
  })
  expect((await situacao(daOutra)).status, 'ela marcou').toBe('ARRIVED')
})

test('com a Agenda, o Atendimento e o Prontuário em Gerenciar, inicia, troca, remarca, cancela e escreve a evolução do agendamento de outra pelo id', async ({ browser }) => {
  // Sem o "só os meus" (SM1, o Heitor, 2026-11-23): cada passo é do seu
  // módulo (UM2, UM4), em qualquer agendamento ao alcance. Um agendamento por passo.
  const paraIniciar  = await agendado('Mariana', rede!.professionalId)
  const paraTrocar   = await agendado('Troca', rede!.professionalId)
  const paraRemarcar = await agendado('Remarca', rede!.professionalId)
  const paraCancelar = await agendado('Cancela de outra', rede!.professionalId)
  const paraEvoluir  = await agendado('Evolução', rede!.professionalId)
  const dela         = await agendado('Própria', propria!.userId)
  // Iniciar é do Confirmado ou do Chegou (C11, F65).
  expect((await db().from('appointments').update({ status: 'CONFIRMED' }).eq('id', paraIniciar)).error).toBeNull()
  const antes     = await situacao(paraRemarcar)
  const outraHora = new Date(new Date(antes.scheduled_at).getTime() + 10 * 3600_000).toISOString()
  await como(browser, propria!, async p => {
    const a = acoes(p, `/${slug}/agenda/${dela}`)
    await a.iniciar(paraIniciar)
    expect.soft((await situacao(paraIniciar)).status, 'iniciar pelo status').toBe('IN_PROGRESS')
    await a.trocar(paraTrocar, propria!.userId)
    expect.soft((await situacao(paraTrocar)).professional_id, 'trocar para si').toBe(propria!.userId)
    await a.remarcar(paraRemarcar, outraHora)
    expect.soft((await situacao(paraRemarcar)).scheduled_at, 'remarcar').not.toBe(antes.scheduled_at)
    await a.cancelar(paraCancelar)
    expect.soft((await situacao(paraCancelar)).status, 'cancelar').toBe('CANCELLED')
    await a.evolucao(paraEvoluir)
    const { data: entrada } = await db().from('medical_record_entries').select('notes').eq('appointment_id', paraEvoluir).maybeSingle()
    expect.soft(entrada?.notes, 'a evolução no atendimento de outra').toBe(`evolução ${marca}`)
  })

  // A recepção (a Agenda em Gerenciar) faz o mesmo no de outra.
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

test('a profissional faz tudo isso também no agendamento DELA', async ({ browser }) => {
  const dela = await agendado('Dela', propria!.userId)
  // Iniciar é do Confirmado ou do Chegou (C11, F65): pelo status, o Agendado não pula a chegada.
  expect((await db().from('appointments').update({ status: 'CONFIRMED' }).eq('id', dela)).error).toBeNull()
  await como(browser, propria!, async p => {
    const a = acoes(p, `/${slug}/agenda/${dela}`)
    await a.evolucao(dela)
    const { data: entrada } = await db().from('medical_record_entries').select('notes').eq('appointment_id', dela).maybeSingle()
    expect(entrada?.notes, 'a evolução no dela').toBe(`evolução ${marca}`)
    await a.iniciar(dela)
    expect((await situacao(dela)).status, 'iniciar o dela').toBe('IN_PROGRESS')
  })
})

// agenda-06 (revisão do Heitor, 2026-11-02; em 28/10 ele confirmou que a
// profissional cancela o que é dela): a JANELA da agenda (`/admin/agenda`, a
// da profissional da rede) mostra "Cancelar" e "Não compareceu" no agendamento
// DELA. Sem o "só os meus" (SM1, o Heitor, 2026-11-23), a Agenda em Gerenciar
// cancela também o de outra pelo id.
test('agenda-06: com a Agenda em Gerenciar, cancela e marca a falta do agendamento DELA pela janela, e cancela o de outra pelo id', async ({ browser }) => {
  const daRede = await criarMembro(`omd${marca}`, {
    tenant: rede!.tenantId, rotulo: 'Profissional da rede',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'VIEW' }],
  })
  try {
    expect((await db().from('users').update({ provides_services: true }).eq('id', daRede.userId)).error).toBeNull()
    const paraCancelar = await agendado('Cancela', daRede.userId)
    // A falta é só depois do início: um que começou há uma hora.
    const cliente = await rede!.criarCliente('Faltou')
    const { data: passado, error } = await db().from('appointments').insert({
      branch_id: rede!.branchId, client_id: cliente, procedure_id: rede!.procedureId, professional_id: daRede.userId,
      status: 'SCHEDULED', source: 'INTERNAL', duration_min: 30, price: 0,
      scheduled_at: haMinutosHoje(60),
    }).select('id').single<{ id: string }>()
    expect(error).toBeNull()
    const daOutra = await agendado('Outra', rede!.professionalId)

    await como(browser, daRede, async p => {
      await p.goto(`/admin/agenda?date=${HOJE}`)
      await p.locator(`[data-agendamento="${paraCancelar}"]`).first().click()
      let janela = p.getByRole('dialog', { name: 'Agendamento' })
      await janela.getByRole('button', { name: 'Cancelar', exact: true }).click()
      await janela.getByLabel('Motivo do cancelamento *').fill(`${marca} pediu para desmarcar`)
      await janela.getByRole('button', { name: 'Confirmar cancelamento' }).click()
      await expect.poll(async () => (await situacao(paraCancelar)).status).toBe('CANCELLED')

      await p.goto(`/admin/agenda?date=${HOJE}`)
      await p.locator(`[data-agendamento="${passado!.id}"]`).first().click()
      janela = p.getByRole('dialog', { name: 'Agendamento' })
      await janela.getByRole('button', { name: 'Não compareceu' }).click()
      // A falta pede a confirmação (A25 da 7ª simulação).
      await janela.getByRole('button', { name: 'Confirmar a falta' }).click()
      await expect.poll(async () => (await situacao(passado!.id)).status).toBe('NO_SHOW')

      // No de outra, pelo id: cancela também (SM1).
      await chamarAcao(p, 'actions/appointments.ts', 'updateAppointmentStatus', '/admin/agenda', [daOutra, 'CANCELLED', slug, 'motivo'])
      await expect.poll(async () => (await situacao(daOutra)).status).toBe('CANCELLED')
    })
  } finally {
    if (rede) {
      const ids = ((await db().from('appointments').select('id').eq('professional_id', daRede.userId)).data ?? []).map(a => a.id)
      if (ids.length) await db().from('appointment_history').delete().in('appointment_id', ids)
      await db().from('appointments').delete().eq('professional_id', daRede.userId)
    }
    await daRede.limpar()
  }
})
