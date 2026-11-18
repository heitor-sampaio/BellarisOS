import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { clienteComSessao, criarMembro, type ClienteDeTeste, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * 22ª A42 (princípio 7): o Remarcar do app só oferecia "Só com X" ou "Sem
 * preferência", e a cliente abria dia por dia para achar um horário. Agora ele
 * lista as outras pessoas que realizam o procedimento na unidade
 * (`[data-com-quem]`) e marca os dias com horário livre (`[data-dias-livres]`),
 * pela escolha — como o Agendar do app.
 */

const marca = `rq${Date.now().toString(36)}`
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

test.beforeAll(async () => {
  rede = await criarOutraRede(marca)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  expect((await db().from('users').update({ branch_id: rede.branchId, provides_services: true, name: `[e2e] Ana ${marca}` }).eq('id', rede.professionalId)).error).toBeNull()
  expect((await db().from('procedures').update({ visible_on_client_app: true, duration_min: 30 }).eq('id', rede.procedureId)).error).toBeNull()
  bia = await criarMembro(`b${marca}`, { tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Bia', permissoes: [{ modulo: 'agenda', nivel: 'VIEW' }] })
  expect((await db().from('users').update({ provides_services: true, name: `[e2e] Bia ${marca}` }).eq('id', bia.userId)).error).toBeNull()
  cliente = await clienteComSessao(`k${marca}`, { id: rede.branchId, slug }, { tenant: rede.tenantId })
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

test('A42: o remarcar lista quem realiza e marca os dias livres; escolhida a Ana, o horário fica com ela', async ({ browser }) => {
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: cliente!.clientId, procedure_id: rede!.procedureId, professional_id: bia!.userId,
    status: 'SCHEDULED', source: 'CLIENT_APP', duration_min: 30, price: 0, scheduled_at: em(dia(5), '10:00'),
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  const id = data!.id

  await como(browser, async p => {
    await p.goto(`/${slug}/cliente/agendamentos/${id}`)
    await p.getByRole('button', { name: 'Remarcar', exact: true }).click()
    // A lista traz a outra pessoa que realiza (a de hoje, a Bia, é o "Só com").
    const comQuem = p.locator('[data-com-quem]')
    await expect(comQuem.locator('option', { hasText: `Ana ${marca}` })).toHaveCount(1)
    await expect(comQuem.locator('option', { hasText: `Bia ${marca}` })).toHaveCount(0)
    await comQuem.selectOption({ label: `[e2e] Ana ${marca}` })
    // Os dias com horário da Ana, sem abrir dia por dia.
    const dias = p.locator('[data-dias-livres]')
    await expect(dias.getByRole('button').first()).toBeVisible()
    await dias.getByRole('button').last().click()
    await p.getByRole('button', { name: '11:00', exact: true }).click()
    await p.getByRole('button', { name: 'Confirmar novo horário' }).click()
    await expect(p.getByText(/Agendamento remarcado/)).toBeVisible()
  })
  const depois = (await db().from('appointments').select('professional_id, sem_preferencia').eq('id', id).single()).data
  expect(depois?.professional_id).toBe(rede!.professionalId)
  expect(depois?.sem_preferencia).toBe(false)
})
