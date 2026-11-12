import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { clienteComSessao, criarMembro, type ClienteDeTeste, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao, chamarAcaoComFormulario } from './apoio/acao-direta'

/**
 * F65 — o remarcar do app e o da equipe (C8, H3 = c, A15, C15).
 *
 * - H3 (o Heitor, 2026-11-11, opção c): a cliente que remarca pelo app escolheu
 *   o horário novo — ele nasce CONFIRMADO. Quando a equipe (ou o Copilot)
 *   remarca, ninguém ouviu a cliente: volta a Agendado e a confirmação é
 *   pedida de novo. Era o inverso.
 * - C8: o remarcar do app passa pelo núcleo (`conferirPecasDoAgendamento`: a
 *   arquivada não remarca) e o "Sem preferência" que troca a profissional
 *   escreve no histórico DE QUEM PARA QUEM.
 * - C15: o que a cliente faz pelo app fica no histórico (o "Agendamento
 *   criado" e o remarcado não se gravavam: o histórico pedia um membro).
 * - A15: com mais de uma unidade, o remarcar do app pergunta "Em qual unidade?".
 */

const marca = `rn${Date.now().toString(36)}`
const db = () => banco()
let rede: OutraRede | null = null
let slug = ''
let unidadeB = ''
let bia: MembroDeTeste | null = null
let recepcao: MembroDeTeste | null = null
let cliente: ClienteDeTeste | null = null
let nomeDaAna = ''

/** O n-ésimo dia ÚTIL a partir de amanhã (a grade padrão não abre no fim de semana). */
const dia = (n: number) => {
  const uteis: string[] = []
  for (let i = 1; uteis.length < n; i++) {
    const d = new Date(Date.now() + i * 86_400_000)
    const semana = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', weekday: 'short' }).format(d)
    if (semana !== 'Sat' && semana !== 'Sun') uteis.push(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d))
  }
  return uteis[n - 1]!
}
const em = (d: string, h: string) => new Date(`${d}T${h}:00-03:00`).toISOString()

async function como(browser: Browser, quem: { estado: string }, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: quem.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}
function devolvido(texto: string): unknown {
  for (const l of texto.split(/\r?\n/).filter(x => x.startsWith('1:'))) {
    try { return JSON.parse(l.slice(2)) } catch { /* linha de depuração */ }
  }
  return undefined
}
async function agendarPeloApp(p: Page, professionalId: string | null, quando: string) {
  await p.goto(`/${slug}/cliente/agendamentos/novo`)
  const r = await chamarAcao(p, 'actions/appointments.ts', 'createClientAppointment', `/${slug}/cliente/agendamentos/novo`, [{
    branchId: rede!.branchId, procedureId: rede!.procedureId, professionalId, scheduledAt: quando, slug,
  }])
  const id = (devolvido(r.texto) as { id?: string } | undefined)?.id
  expect(id, r.texto.slice(0, 300)).toBeTruthy()
  return id!
}
const remarcar = (p: Page, id: string, quando: string, semPreferencia: boolean, branchId?: string) =>
  chamarAcao(p, 'actions/portal-agendamentos.ts', 'remarcarPelaCliente', `/${slug}/cliente/agendamentos/${id}`,
    branchId ? [id, quando, semPreferencia, branchId] : [id, quando, semPreferencia])
const historico = async (id: string) => ((await db().from('appointment_history').select('action, description')
  .eq('appointment_id', id).order('created_at')).data ?? []) as { action: string; description: string }[]
const linha = async (id: string) => (await db().from('appointments')
  .select('status, confirmed_at, professional_id, branch_id, scheduled_at').eq('id', id)
  .single<{ status: string; confirmed_at: string | null; professional_id: string; branch_id: string; scheduled_at: string }>()).data!

test.beforeAll(async () => {
  rede = await criarOutraRede(marca)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  const { data: b2, error } = await db().from('branches')
    .insert({ tenant_id: rede.tenantId, name: `${PREFIXO} Batel ${marca}`, slug: `e2e-rn2-${marca}` }).select('id').single<{ id: string }>()
  expect(error, 'a segunda unidade').toBeNull()
  unidadeB = b2!.id
  nomeDaAna = `${PREFIXO} Ana ${marca}`
  expect((await db().from('users').update({ branch_id: rede.branchId, name: nomeDaAna, atende_em: [rede.branchId, unidadeB] }).eq('id', rede.professionalId)).error).toBeNull()
  expect((await db().from('procedures').update({ visible_on_client_app: true, duration_min: 30 }).eq('id', rede.procedureId)).error).toBeNull()
  bia = await criarMembro(`b${marca}`, { tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Bia', permissoes: [{ modulo: 'agenda', nivel: 'VIEW' }] })
  expect((await db().from('users').update({ atende_em: [rede.branchId] }).eq('id', bia.userId)).error).toBeNull()
  recepcao = await criarMembro(`r${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Recepção',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE', escopo: 'ALL' }, { modulo: 'clients', nivel: 'VIEW' }],
  })
  cliente = await clienteComSessao(`k${marca}`, { id: rede.branchId, slug }, { tenant: rede.tenantId })
})

test.afterAll(async () => {
  if (rede) {
    const { data } = await db().from('appointments').select('id').in('branch_id', [rede.branchId, unidadeB].filter(Boolean))
    const ids = (data ?? []).map(a => a.id as string)
    if (ids.length) {
      await db().from('domain_events').delete().in('entidade_id', ids)
      await db().from('appointment_history').delete().in('appointment_id', ids)
      await db().from('appointments').delete().in('id', ids)
    }
  }
  await cliente?.limpar(); await bia?.limpar(); await recepcao?.limpar(); await rede?.limpar()
})

test('H3 + C8 + C15: o remarcar do app nasce Confirmado, e o "Sem preferência" que troca a profissional diz de quem para quem', async ({ browser }) => {
  let id = ''
  await como(browser, cliente!, async p => {
    id = await agendarPeloApp(p, bia!.userId, em(dia(3), '10:00'))
  })
  expect((await historico(id)).map(h => h.action), 'C15: o agendamento pelo app fica no histórico').toContain('CREATED')
  // A Bia ocupada às 15:00: o "Sem preferência" das 15:00 vai para a Ana.
  const outro = await rede!.criarCliente('Ocupa')
  expect((await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: outro, procedure_id: rede!.procedureId, professional_id: bia!.userId,
    status: 'SCHEDULED', source: 'INTERNAL', duration_min: 30, price: 0, scheduled_at: em(dia(3), '15:00'),
  })).error).toBeNull()
  await como(browser, cliente!, async p => {
    const r = await remarcar(p, id, em(dia(3), '15:00'), true)
    expect(r.texto).toContain('"ok":true')
  })
  const depois = await linha(id)
  expect(depois.professional_id, 'ficou com a Ana').toBe(rede!.professionalId)
  expect(depois.status, 'H3: a cliente escolheu o horário — nasce confirmado').toBe('CONFIRMED')
  expect(depois.confirmed_at).not.toBeNull()
  const h = await historico(id)
  expect(h.map(x => x.action), 'o remarcado pela cliente fica no histórico').toContain('RESCHEDULED')
  const troca = h.find(x => x.action === 'REASSIGNED')
  expect(troca?.description, 'C8: de quem para quem').toContain(nomeDaAna)
})

test('H3: quando a equipe remarca, volta a Agendado e a confirmação é pedida de novo', async ({ browser }) => {
  let id = ''
  await como(browser, cliente!, async p => { id = await agendarPeloApp(p, rede!.professionalId, em(dia(4), '10:00')) })
  expect((await db().from('appointments').update({ status: 'CONFIRMED', confirmed_at: new Date().toISOString() }).eq('id', id)).error).toBeNull()
  await como(browser, recepcao!, async p => {
    const r = await chamarAcaoComFormulario(p, 'actions/appointments.ts', 'rescheduleAppointment', `/${slug}/agenda`,
      [undefined], { _appointmentId: id, scheduled_at: em(dia(4), '11:00'), professional_id: '', _slug: slug })
    expect(r.texto).toContain('"success":true')
  })
  const depois = await linha(id)
  expect(depois.status, 'ninguém ouviu a cliente').toBe('SCHEDULED')
  expect(depois.confirmed_at).toBeNull()
})

test('A15: com mais de uma unidade, o remarcar do app pergunta "Em qual unidade?" e muda a unidade', async ({ browser }) => {
  let id = ''
  await como(browser, cliente!, async p => {
    id = await agendarPeloApp(p, rede!.professionalId, em(dia(5), '10:00'))
    await p.goto(`/${slug}/cliente/agendamentos/${id}`)
    await p.getByRole('button', { name: 'Remarcar' }).click()
    const onde = p.getByLabel('Em qual unidade?')
    await expect(onde).toBeVisible()
    await onde.selectOption({ label: `${PREFIXO} Batel ${marca}` })
    await p.getByLabel('Novo dia').fill(dia(5))
    await p.getByRole('button', { name: '14:00', exact: true }).click()
    await p.getByRole('button', { name: 'Confirmar novo horário' }).click()
    await expect(p.getByText(/Agendamento remarcado/)).toBeVisible()
  })
  const depois = await linha(id)
  expect(depois.branch_id, 'mudou para o Batel').toBe(unidadeB)
  expect(new Date(depois.scheduled_at).toISOString()).toBe(em(dia(5), '14:00'))
  expect((await historico(id)).map(h => h.action)).toContain('BRANCH_CHANGED')
})

test('C8: o remarcar do app passa pelo núcleo — a ficha arquivada não remarca', async ({ browser }) => {
  let id = ''
  await como(browser, cliente!, async p => { id = await agendarPeloApp(p, rede!.professionalId, em(dia(6), '10:00')) })
  const antes = await linha(id)
  expect((await db().from('clients').update({ is_active: false }).eq('id', cliente!.clientId)).error).toBeNull()
  try {
    await como(browser, cliente!, async p => {
      const r = await remarcar(p, id, em(dia(6), '11:00'), false)
      expect(r.texto).toContain('"error"')
    })
    expect((await linha(id)).scheduled_at, 'o horário ficou').toBe(antes.scheduled_at)
  } finally {
    await db().from('clients').update({ is_active: true }).eq('id', cliente!.clientId)
  }
})
