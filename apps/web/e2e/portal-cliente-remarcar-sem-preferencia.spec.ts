import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { clienteComSessao, criarMembro, type ClienteDeTeste, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'

/**
 * A59 da 5ª simulação ("Reforça", item 11): o agendamento feito em "Sem
 * preferência" remarcava PRESO à profissional que o sistema escolheu (a Renata
 * só tinha manhãs, e a Tatiane atende à tarde). Agora o remarcar do app começa
 * por "Sem preferência" e escolhe de novo, entre quem realiza.
 * A61: sem motivo digitado, o cancelamento grava "Pela cliente no app", sem o
 * "Cancelado pela cliente no app" repetido.
 */

const marca = `rs${Date.now().toString(36)}`
const db = () => banco()
let rede: OutraRede | null = null
let slug = ''
let bia: MembroDeTeste | null = null
let cliente: ClienteDeTeste | null = null

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

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: cliente!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

async function ocupar(professionalId: string, quando: string) {
  const clientId = await rede!.criarCliente(`Ocupa ${quando}`)
  const { error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: clientId, procedure_id: rede!.procedureId, professional_id: professionalId,
    status: 'SCHEDULED', source: 'INTERNAL', duration_min: 30, price: 0, scheduled_at: quando,
  })
  expect(error, 'ocupar o horário').toBeNull()
}

function devolvido(texto: string): unknown {
  for (const l of texto.split(/\r?\n/).filter(x => x.startsWith('1:'))) {
    try { return JSON.parse(l.slice(2)) } catch { /* linha de depuração */ }
  }
  return undefined
}

test.beforeAll(async () => {
  rede = await criarOutraRede(marca)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  expect((await db().from('users').update({ branch_id: rede.branchId, provides_services: true, name: `[e2e] Ana ${marca}` }).eq('id', rede.professionalId)).error).toBeNull()
  expect((await db().from('procedures').update({ visible_on_client_app: true, duration_min: 30 }).eq('id', rede.procedureId)).error).toBeNull()
  bia = await criarMembro(`b${marca}`, { tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Bia', permissoes: [{ modulo: 'agenda', nivel: 'VIEW' }] })
  expect((await db().from('users').update({ provides_services: true }).eq('id', bia.userId)).error).toBeNull()
  cliente = await clienteComSessao(`k${marca}`, { id: rede.branchId, slug }, { tenant: rede.tenantId })
  // A Ana tem dois atendimentos no dia(3): o "Sem preferência" das 10:00 vai para a Bia.
  await ocupar(rede.professionalId, em(dia(3), '08:00'))
  await ocupar(rede.professionalId, em(dia(3), '13:00'))
})

test.afterAll(async () => {
  if (rede) {
    const { data } = await db().from('appointments').select('id').eq('branch_id', rede.branchId)
    const ids = (data ?? []).map(a => a.id as string)
    if (ids.length) {
      await db().from('domain_events').delete().in('entidade_id', ids)
      await db().from('appointment_history').delete().in('appointment_id', ids)
      await db().from('appointments').delete().in('id', ids)
    }
  }
  await cliente?.limpar(); await bia?.limpar(); await rede?.limpar()
})

test('o "Sem preferência" remarca com quem estiver livre, não preso à escolhida', async ({ browser }) => {
  let id = ''
  await como(browser, async p => {
    await p.goto(`/${slug}/cliente/agendamentos/novo`)
    const r = await chamarAcao(p, 'actions/appointments.ts', 'createClientAppointment', `/${slug}/cliente/agendamentos/novo`, [{
      branchId: rede!.branchId, procedureId: rede!.procedureId, professionalId: null, scheduledAt: em(dia(3), '10:00'), slug,
    }])
    id = (devolvido(r.texto) as { id: string }).id
  })
  const antes = (await db().from('appointments').select('professional_id, sem_preferencia').eq('id', id).single()).data
  expect(antes?.professional_id).toBe(bia!.userId)
  expect(antes?.sem_preferencia).toBe(true)

  // A Bia fica ocupada às 15:00; a Ana, livre.
  await ocupar(bia!.userId, em(dia(3), '15:00'))

  await como(browser, async p => {
    await p.goto(`/${slug}/cliente/agendamentos/${id}`)
    await p.getByRole('button', { name: 'Remarcar' }).click()
    const quem = p.getByRole('group', { name: 'Com quem?' })
    await expect(quem.getByRole('button', { name: 'Sem preferência' })).toHaveAttribute('aria-pressed', 'true')
    await p.getByLabel('Novo dia').fill(dia(3))
    await p.getByRole('button', { name: '15:00', exact: true }).click()
    await p.getByRole('button', { name: 'Confirmar novo horário' }).click()
    await expect(p.getByText('Agendamento remarcado.')).toBeVisible()
  })
  const depois = (await db().from('appointments').select('professional_id, scheduled_at').eq('id', id).single()).data
  expect(new Date(depois!.scheduled_at as string).toISOString()).toBe(em(dia(3), '15:00'))
  expect(depois?.professional_id).toBe(rede!.professionalId)
})

test('A61: o cancelamento sem motivo não repete "cancelado pela cliente no app"', async ({ browser }) => {
  let id = ''
  await como(browser, async p => {
    await p.goto(`/${slug}/cliente/agendamentos/novo`)
    const r = await chamarAcao(p, 'actions/appointments.ts', 'createClientAppointment', `/${slug}/cliente/agendamentos/novo`, [{
      branchId: rede!.branchId, procedureId: rede!.procedureId, professionalId: bia!.userId, scheduledAt: em(dia(4), '10:00'), slug,
    }])
    id = (devolvido(r.texto) as { id: string }).id
    await p.goto(`/${slug}/cliente/agendamentos/${id}`)
    await p.getByRole('button', { name: 'Cancelar agendamento' }).click()
    await p.getByRole('button', { name: 'Confirmar cancelamento' }).click()
    // O que a cliente vê e FICA: a linha "Cancelado — <motivo>" do cartão. O
    // "Agendamento cancelado." é do bloco de alterar, que some no refresh
    // (agendamento cancelado não se altera) — na completa de 04/11 ele
    // apareceu e sumiu antes de o teste olhar, com o cancelamento gravado.
    await expect(p.getByText('Cancelado — Pela cliente no app', { exact: true })).toBeVisible()
    await expect(p.getByRole('button', { name: 'Cancelar agendamento' })).toHaveCount(0)
  })
  const a = (await db().from('appointments').select('cancellation_reason, sem_preferencia').eq('id', id).single()).data
  expect(a?.cancellation_reason).toBe('Pela cliente no app')
  expect(a?.sem_preferencia).toBe(false)
})
