import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { chamarAcao, chamarAcaoComFormulario } from './apoio/acao-direta'
import { addDaysTZ, dayKeyTZ } from '../lib/datetime'

/**
 * D3 da 11ª simulação (2026-11-10): o atendimento CONCLUÍDO antes de começar
 * ainda bloqueava o horário, e a recusa citava um intervalo invertido — "Carla
 * Azaleia já tem atendimento das 10:30 às 10:14" ao remarcar a Fernanda para
 * as 10:07. `fimDaOcupacao` devolve a conclusão (10:14), antes do início
 * (10:30): esse atendimento não ocupa nada (A31 da 5ª). A grade já o mostrava
 * livre (A16 da 10ª); a recusa e os livres do app, não. Princípio 3: a régua
 * da recusa é a mesma da grade.
 * Numa rede [e2e] própria, de unidade 24 h.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let slug = ''
let recepcao: MembroDeTeste | null = null
const DEPOIS = dayKeyTZ(addDaysTZ(new Date(), 2))
const em = (dia: string, hhmm: string) => new Date(`${dia}T${hhmm}:00-03:00`).toISOString()

async function como(browser: Browser, quem: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: quem.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

async function agendar(o: { cliente: string; quando: string; min?: number; status?: string; concluidoEm?: string }) {
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: o.cliente, procedure_id: rede!.procedureId,
    professional_id: rede!.professionalId, scheduled_at: o.quando, duration_min: o.min ?? 30,
    price: 0, status: o.status ?? 'SCHEDULED', source: 'INTERNAL',
    ...(o.concluidoEm ? { completed_at: o.concluidoEm, started_at: o.concluidoEm } : {}),
  }).select('id').single<{ id: string }>()
  expect(error, 'agendar').toBeNull()
  return data!.id
}

test.beforeAll(async () => {
  test.setTimeout(150_000)
  rede = await criarOutraRede(`ad11${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  const todoDia = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(d => [d, [{ de: '00:00', ate: '24:00' }]]))
  expect((await db().from('branches').update({ horario: { dias: todoDia } }).eq('id', rede.branchId)).error).toBeNull()
  expect((await db().from('users').update({ provides_services: true, branch_id: rede.branchId }).eq('id', rede.professionalId)).error).toBeNull()
  recepcao = await criarMembro(`ad11r${marca}`, {
    tenant: rede.tenantId, rotulo: 'Recepção',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'VIEW' }],
  })
})

test.afterAll(async () => {
  if (rede) await db().from('appointments').delete().eq('branch_id', rede.branchId)
  await recepcao?.limpar(); await rede?.limpar()
})

test('D3: o concluído antes de começar não bloqueia o horário — nem no aviso, nem na remarcação', async ({ browser }) => {
  const carla = await rede!.criarCliente(`Carla ${PREFIXO}`)
  const fernanda = await rede!.criarCliente(`Fernanda ${PREFIXO}`)
  // Marcado às 10:30 e concluído às 10:14: não ocupa nada.
  await agendar({ cliente: carla, quando: em(DEPOIS, '10:30'), min: 30, status: 'COMPLETED', concluidoEm: em(DEPOIS, '10:14') })
  const daFernanda = await agendar({ cliente: fernanda, quando: em(DEPOIS, '08:00'), min: 60 })

  await como(browser, recepcao!, async p => {
    // O aviso do modal (a régua de primeiroConflito): nada bate.
    const aviso = await chamarAcao(p, 'actions/appointments.ts', 'avisosDoHorario', `/${slug}/agenda`,
      [rede!.branchId, rede!.professionalId, em(DEPOIS, '10:07'), null, 60])
    expect.soft(aviso.texto, 'o aviso não cita o concluído antes da hora').not.toContain('já tem atendimento')
    expect.soft(aviso.texto, 'nunca um intervalo invertido').not.toContain('10:14')

    // A remarcação da Fernanda para as 10:07 (60 min) passa.
    const r = await chamarAcaoComFormulario(p, 'actions/appointments.ts', 'rescheduleAppointment', `/${slug}/agenda`, [undefined], {
      _appointmentId: daFernanda, scheduled_at: em(DEPOIS, '10:07'), professional_id: rede!.professionalId, _slug: slug,
    })
    expect(r.texto, 'a remarcação não é recusada').not.toContain('já tem agendamento')
    expect(r.texto).toContain('"success":true')
  })
  const { data } = await db().from('appointments').select('scheduled_at').eq('id', daFernanda).single<{ scheduled_at: string }>()
  expect(new Date(data!.scheduled_at).toISOString()).toBe(em(DEPOIS, '10:07'))
})
