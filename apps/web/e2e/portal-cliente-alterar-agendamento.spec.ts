import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { clienteComSessao, type ClienteDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'

/**
 * A cliente abre o agendamento no portal, e até o prazo da rede (24h por
 * padrão) cancela ou remarca sozinha (2026-10-21, decisão do Heitor; na
 * simulação, os cartões da agenda do portal não abriam). Dentro do prazo, só
 * o caminho para falar com a clínica. E cancelar devolve a sessão do plano.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let cliente: ClienteDeTeste | null = null
let outra: ClienteDeTeste | null = null
let slug = ''
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

async function agendado(clientId: string, quando: Date, extra: Record<string, unknown> = {}) {
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: clientId, procedure_id: rede!.procedureId, professional_id: rede!.professionalId,
    status: 'SCHEDULED', source: 'CLIENT_APP', duration_min: 30, price: 0, scheduled_at: quando.toISOString(), ...extra,
  }).select('id').single<{ id: string }>()
  expect(error, 'agendar').toBeNull()
  return data!.id
}
const linha = async (id: string) => (await db().from('appointments').select('status, scheduled_at, cancellation_reason').eq('id', id).single()).data!

async function como(browser: Browser, quem: ClienteDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: quem.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`pa${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  expect((await db().from('users').update({ branch_id: rede.branchId, provides_services: true }).eq('id', rede.professionalId)).error).toBeNull()
  expect((await db().from('procedures').update({ visible_on_client_app: true, duration_min: 30 }).eq('id', rede.procedureId)).error).toBeNull()
  cliente = await clienteComSessao(`pac${marca}`, { id: rede.branchId, slug }, { tenant: rede.tenantId })
  outra = await clienteComSessao(`pao${marca}`, { id: rede.branchId, slug }, { tenant: rede.tenantId })
})
test.afterAll(async () => {
  if (rede) {
    await db().from('treatment_plan_sessions').delete().in('plan_id', ((await db().from('treatment_plans').select('id').eq('branch_id', rede.branchId)).data ?? []).map(p => p.id as string))
    await db().from('appointments').delete().eq('branch_id', rede.branchId)
    await db().from('treatment_plans').delete().eq('branch_id', rede.branchId)
  }
  await outra?.limpar(); await cliente?.limpar(); await rede?.limpar()
})

test.describe.serial('o agendamento no portal', () => {
  test('o cartão abre o detalhe; com prazo, ela remarca e cancela sozinha', async ({ browser }) => {
    const id = await agendado(cliente!.clientId, new Date(`${dia(3)}T10:00:00-03:00`))
    await como(browser, cliente!, async p => {
      await p.goto(`/${slug}/cliente/agendamentos`)
      await p.locator(`a[href$="/cliente/agendamentos/${id}"]`).first().click()
      await expect(p).toHaveURL(new RegExp(`/cliente/agendamentos/${id}`))

      await expect(async () => {
        await p.getByRole('button', { name: 'Remarcar' }).click({ timeout: 1000 })
        await expect(p.getByLabel('Novo dia')).toBeVisible({ timeout: 1000 })
      }).toPass()
      await p.getByLabel('Novo dia').fill(dia(4))
      await p.getByRole('button', { name: '15:00' }).click()
      await p.getByRole('button', { name: 'Confirmar novo horário' }).click()
      await expect.poll(async () => new Date((await linha(id)).scheduled_at).toISOString())
        .toBe(new Date(`${dia(4)}T15:00:00-03:00`).toISOString())

      await p.reload()
      await expect(async () => {
        await p.getByRole('button', { name: 'Cancelar agendamento' }).click({ timeout: 1000 })
        await expect(p.getByLabel('Motivo')).toBeVisible({ timeout: 1000 })
      }).toPass()
      await p.getByLabel('Motivo').fill('Viagem')
      await p.getByRole('button', { name: 'Confirmar cancelamento' }).click()
      await expect.poll(async () => (await linha(id)).status).toBe('CANCELLED')
    })
    expect((await linha(id)).cancellation_reason).toContain('Viagem')
  })

  test('dentro do prazo, só o caminho para falar com a clínica — e a action recusa', async ({ browser }) => {
    const id = await agendado(cliente!.clientId, new Date(Date.now() + 5 * 3600_000))
    await como(browser, cliente!, async p => {
      await p.goto(`/${slug}/cliente/agendamentos/${id}`)
      await expect(p.getByText(/fale com a clínica/i)).toBeVisible()
      await expect(p.getByRole('button', { name: 'Cancelar agendamento' })).toHaveCount(0)
      const r = await chamarAcao(p, 'actions/portal-agendamentos.ts', 'cancelarPelaCliente', `/${slug}/cliente/agendamentos/${id}`, [id, 'x'])
      expect(r.texto).toContain('horas antes')
    })
    expect((await linha(id)).status).toBe('SCHEDULED')
  })

  test('o agendamento de outra cliente não abre nem se cancela', async ({ browser }) => {
    const id = await agendado(outra!.clientId, new Date(`${dia(5)}T10:00:00-03:00`))
    await como(browser, cliente!, async p => {
      // Com o loading.tsx da pasta, a resposta já começou em streaming (200): o
      // notFound() aparece no CONTEÚDO.
      await p.goto(`/${slug}/cliente/agendamentos/${id}`)
      await expect(p.getByText(/não encontrada|could not be found|404/i).first(), 'não existe para ela').toBeVisible()
      await expect(p.getByRole('button', { name: 'Cancelar agendamento' })).toHaveCount(0)
      const r = await chamarAcao(p, 'actions/portal-agendamentos.ts', 'cancelarPelaCliente', `/${slug}/cliente/agendamentos/${id}`, [id, 'x'])
      expect(r.texto).toContain('não encontrado')
    })
    expect((await linha(id)).status).toBe('SCHEDULED')
  })

  test('cancelar devolve a sessão do plano (fica livre para agendar de novo)', async ({ browser }) => {
    const { data: pl } = await db().from('treatment_plans').insert({
      branch_id: rede!.branchId, professional_id: rede!.professionalId, client_id: cliente!.clientId, status: 'ACCEPTED', name: `[e2e] Plano ${marca}`,
    }).select('id').single<{ id: string }>()
    const id = await agendado(cliente!.clientId, new Date(`${dia(6)}T10:00:00-03:00`), { treatment_plan_id: pl!.id })
    const { data: se } = await db().from('treatment_plan_sessions').insert({ plan_id: pl!.id, sort_order: 1, appointment_id: id }).select('id').single<{ id: string }>()
    await como(browser, cliente!, async p => {
      await p.goto(`/${slug}/cliente/agendamentos/${id}`)
      await chamarAcao(p, 'actions/portal-agendamentos.ts', 'cancelarPelaCliente', `/${slug}/cliente/agendamentos/${id}`, [id, 'Mudou o plano'])
    })
    expect((await linha(id)).status).toBe('CANCELLED')
    expect((await db().from('treatment_plan_sessions').select('appointment_id').eq('id', se!.id).single()).data?.appointment_id).toBeNull()
  })
})

test.describe('atritos da remarcação (frente 8)', () => {
  test('A40: a regra do prazo aparece já na lista de agendamentos', async ({ browser }) => {
    await agendado(cliente!.clientId, new Date(`${dia(7)}T10:00:00-03:00`))
    await como(browser, cliente!, async p => {
      await p.goto(`/${slug}/cliente/agendamentos`)
      await expect(p.getByText(/pelo app, até 24 horas antes/i)).toBeVisible()
    })
  })

  test('A41: dentro do prazo, o agendamento diz por quê e mostra o contato da clínica', async ({ browser }) => {
    expect((await db().from('branches').update({ phone: '11987654321' }).eq('id', rede!.branchId)).error).toBeNull()
    const id = await agendado(cliente!.clientId, new Date(Date.now() + 4 * 3600_000))
    await como(browser, cliente!, async p => {
      await p.goto(`/${slug}/cliente/agendamentos/${id}`)
      await expect(p.getByText(/terminou em .* \(24 horas antes do horário\)/i)).toBeVisible()
      await expect(p.getByText('(11) 98765-4321')).toBeVisible()
    })
  })

  test('A42: atalhos Hoje/Amanhã e horários agrupados em Manhã, Tarde e Noite', async ({ browser }) => {
    const id = await agendado(cliente!.clientId, new Date(`${dia(8)}T10:00:00-03:00`))
    await como(browser, cliente!, async p => {
      await p.goto(`/${slug}/cliente/agendamentos/${id}`)
      await expect(async () => {
        await p.getByRole('button', { name: 'Remarcar' }).click({ timeout: 1000 })
        await expect(p.getByLabel('Novo dia')).toBeVisible({ timeout: 1000 })
      }).toPass()
      await p.getByRole('button', { name: 'Amanhã' }).click()
      const amanha = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(Date.now() + 86_400_000))
      await expect(p.getByLabel('Novo dia')).toHaveValue(amanha)
      await expect(p.getByRole('button', { name: 'Hoje' })).toBeVisible()
      await p.getByLabel('Novo dia').fill(dia(9))
      await expect(p.getByRole('group', { name: 'Manhã' })).toBeVisible()
      await expect(p.getByRole('group', { name: 'Tarde' })).toBeVisible()
    })
  })

  test('A44: ao remarcar, o próprio agendamento não bloqueia os horários vizinhos', async ({ browser }) => {
    const id = await agendado(cliente!.clientId, new Date(`${dia(10)}T10:00:00-03:00`), { duration_min: 60 })
    await como(browser, cliente!, async p => {
      await p.goto(`/${slug}/cliente/agendamentos/${id}`)
      await expect(async () => {
        await p.getByRole('button', { name: 'Remarcar' }).click({ timeout: 1000 })
        await expect(p.getByLabel('Novo dia')).toBeVisible({ timeout: 1000 })
      }).toPass()
      await p.getByLabel('Novo dia').fill(dia(10))
      await expect(p.getByRole('button', { name: '10:30' }), 'o 10:30 só se sobrepõe a ele mesmo').toBeVisible()
      await p.getByRole('button', { name: '10:30' }).click()
      await p.getByRole('button', { name: 'Confirmar novo horário' }).click()
      await expect.poll(async () => new Date((await linha(id)).scheduled_at).toISOString())
        .toBe(new Date(`${dia(10)}T10:30:00-03:00`).toISOString())
    })
  })
})
