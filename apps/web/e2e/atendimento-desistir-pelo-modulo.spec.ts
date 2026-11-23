import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao, chamarAcaoComFormulario } from './apoio/acao-direta'

/**
 * ATD-A01 (varredura de 18/11): CLAUDE.md §11 (o Heitor, 2026-11-18: "Só inicia
 * e conclui atendimento quem tem gerenciar no atendimento"; o módulo
 * `atendimento` "inicia, conclui, desiste no meio"). Cancelar o Em atendimento
 * é DESISTIR dele: pede o Atendimento em Gerenciar — não a Agenda (UM2, o
 * Heitor, 2026-11-23). O agendado segue com a Agenda em Gerenciar.
 *
 * Até aqui as duas actions barravam pela Agenda em Gerenciar: quem só tinha a
 * Agenda desistia do atendimento de qualquer pessoa, e quem tinha o
 * Atendimento em Gerenciar (e a Agenda em Ver) não desistia do próprio.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let slug = ''
let soAgenda: MembroDeTeste | null = null
let atende: MembroDeTeste | null = null
const HOJE = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
let hora = 7

async function agendamento(rotulo: string, status: 'SCHEDULED' | 'IN_PROGRESS', professionalId: string) {
  const cliente = await rede!.criarCliente(rotulo)
  const quando = new Date(`${HOJE}T${String(hora++).padStart(2, '0')}:00:00-03:00`).toISOString()
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: cliente, procedure_id: rede!.procedureId, professional_id: professionalId,
    status, source: 'INTERNAL', duration_min: 30, price: 0, scheduled_at: quando,
    ...(status === 'IN_PROGRESS' ? { arrived_at: quando, started_at: quando } : {}),
  }).select('id').single<{ id: string }>()
  expect(error, 'agendar').toBeNull()
  return data!.id
}
const situacao = async (id: string) => (await db().from('appointments').select('status').eq('id', id).single<{ status: string }>()).data!.status

async function como(browser: Browser, quem: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: quem.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

/** As duas portas do cancelar: a da sessão (formulário) e a do status (a janela da agenda). */
/** `rota`: a tela de um atendimento que a pessoa abre (a action é a dela). */
function acoes(p: Page, rota: string) {
  return {
    pelaSessao: (id: string) => chamarAcaoComFormulario(p, 'actions/appointments.ts', 'cancelAppointmentSession', rota,
      [null], { appointment_id: id, cancellation_reason: `${marca} motivo`, slug }),
    pelaJanela: (id: string) => chamarAcao(p, 'actions/appointments.ts', 'updateAppointmentStatus', `/${slug}/agenda`,
      [id, 'CANCELLED', slug, `${marca} motivo`]),
  }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`ds${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  expect((await db().from('users').update({ branch_id: rede.branchId, provides_services: true }).eq('id', rede.professionalId)).error).toBeNull()
  soAgenda = await criarMembro(`dsa${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Agenda',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'VIEW' }],
  })
  atende = await criarMembro(`dst${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Atende',
    permissoes: [
      { modulo: 'agenda', nivel: 'VIEW' },
      { modulo: 'atendimento', nivel: 'MANAGE' },
      { modulo: 'clients', nivel: 'VIEW' },
    ],
  })
})
test.afterAll(async () => {
  if (rede) {
    const ids = ((await db().from('appointments').select('id').eq('branch_id', rede.branchId)).data ?? []).map(a => a.id)
    if (ids.length) await db().from('appointment_history').delete().in('appointment_id', ids)
    await db().from('appointments').delete().eq('branch_id', rede.branchId)
  }
  await soAgenda?.limpar(); await atende?.limpar(); await rede?.limpar()
})

test('só a Agenda em Gerenciar cancela o agendado, mas não desiste do Em atendimento (pelas duas portas)', async ({ browser }) => {
  const agendado = await agendamento('Ana', 'SCHEDULED', rede!.professionalId)
  const emCurso1 = await agendamento('Bia', 'IN_PROGRESS', rede!.professionalId)
  const emCurso2 = await agendamento('Cora', 'IN_PROGRESS', rede!.professionalId)
  await como(browser, soAgenda!, async p => {
    const a = acoes(p, `/${slug}/agenda/${agendado}`)
    await a.pelaSessao(emCurso1)
    await a.pelaJanela(emCurso2).catch(() => undefined)
    await a.pelaSessao(agendado)
  })
  expect.soft(await situacao(emCurso1), 'desistir pela sessão').toBe('IN_PROGRESS')
  expect.soft(await situacao(emCurso2), 'desistir pela janela').toBe('IN_PROGRESS')
  expect(await situacao(agendado), 'o controle: o agendado se cancela').toBe('CANCELLED')
})

test('o Atendimento em Gerenciar (e a Agenda em Ver) desiste do Em atendimento, e não cancela o agendado', async ({ browser }) => {
  const agendado = await agendamento('Dora', 'SCHEDULED', rede!.professionalId)
  const emCurso1 = await agendamento('Eva', 'IN_PROGRESS', rede!.professionalId)
  const emCurso2 = await agendamento('Flor', 'IN_PROGRESS', rede!.professionalId)
  await como(browser, atende!, async p => {
    const a = acoes(p, `/${slug}/agenda/${emCurso1}`)
    await a.pelaSessao(emCurso1)
    await a.pelaJanela(emCurso2)
    await a.pelaSessao(agendado)
  })
  expect.soft(await situacao(agendado), 'cancelar o agendado é da Agenda').toBe('SCHEDULED')
  expect.soft(await situacao(emCurso1), 'desistir pela sessão').toBe('CANCELLED')
  expect(await situacao(emCurso2), 'desistir pela janela').toBe('CANCELLED')
})
