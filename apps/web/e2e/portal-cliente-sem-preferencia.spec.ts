import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { clienteComSessao, criarMembro, type ClienteDeTeste, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'

/**
 * D-16 (decisão do Heitor, 2026-10-30): no agendamento do app, "Sem
 * preferência" junta os horários de todas as profissionais da unidade e, ao
 * confirmar, o sistema escolhe quem está livre naquele horário, com menos
 * atendimentos no dia. O horário continua sendo um dos livres (a mesma conta
 * de `computeAvailableSlots`), e o procedimento, um dos do app.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let cliente: ClienteDeTeste | null = null
let bia: MembroDeTeste | null = null
let slug = ''
const criados: string[] = []

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

async function ocupar(professionalId: string, quando: string) {
  const clientId = await rede!.criarCliente(`Ocupa ${quando}`)
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: clientId, procedure_id: rede!.procedureId, professional_id: professionalId,
    status: 'SCHEDULED', source: 'INTERNAL', duration_min: 30, price: 0, scheduled_at: new Date(quando).toISOString(),
  }).select('id').single<{ id: string }>()
  expect(error, 'ocupar o horário').toBeNull()
  criados.push(data!.id)
}

async function como(browser: Browser, quem: ClienteDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: quem.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

/** O clique antes da hidratação se perde: repete até o passo 2 aparecer. */
async function abrirOAgendar(p: Page) {
  await p.goto(`/${slug}/cliente/agendamentos/novo`)
  const passo2 = p.getByText('Tem preferência de profissional?')
  await expect(async () => {
    if (!(await passo2.isVisible())) await p.getByRole('button', { name: new RegExp(`Proc sp${marca}`) }).click({ timeout: 2000 })
    await expect(passo2).toBeVisible({ timeout: 2000 })
  }).toPass({ timeout: 30_000 })
}

async function agendarSemPreferencia(p: Page, data: string, hora: string) {
  await abrirOAgendar(p)
  await p.getByRole('button', { name: /Sem preferência/ }).click()
  await p.getByLabel('Data').fill(data)
  await p.getByRole('button', { name: hora, exact: true }).click()
  await expect(p.getByText('A clínica escolhe quem estiver livre')).toBeVisible()
  await p.getByRole('button', { name: 'Confirmar agendamento' }).click()
  await expect(p).toHaveURL(new RegExp(`/${slug}/cliente/agendamentos$`))
}

const doDia = async (data: string, hora: string) => (await db().from('appointments')
  .select('id, professional_id, source').eq('client_id', cliente!.clientId)
  .eq('scheduled_at', new Date(`${data}T${hora}:00-03:00`).toISOString()).maybeSingle()).data

test.beforeAll(async () => {
  rede = await criarOutraRede(`sp${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  expect((await db().from('users').update({ branch_id: rede.branchId, provides_services: true, name: `[e2e] Ana ${marca}` }).eq('id', rede.professionalId)).error).toBeNull()
  expect((await db().from('procedures').update({ visible_on_client_app: true, duration_min: 30 }).eq('id', rede.procedureId)).error).toBeNull()
  bia = await criarMembro(`spb${marca}`, { tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Bia', permissoes: [{ modulo: 'agenda', nivel: 'VIEW' }] })
  expect((await db().from('users').update({ provides_services: true }).eq('id', bia.userId)).error).toBeNull()
  cliente = await clienteComSessao(`spc${marca}`, { id: rede.branchId, slug }, { tenant: rede.tenantId })

  // Ana: dois atendimentos no dia (8h e 9h). Bia: um (14h).
  await ocupar(rede.professionalId, `${dia(3)}T08:00:00-03:00`)
  await ocupar(rede.professionalId, `${dia(3)}T09:00:00-03:00`)
  await ocupar(bia.userId, `${dia(3)}T14:00:00-03:00`)
})
test.afterAll(async () => {
  if (rede) await db().from('appointments').delete().eq('branch_id', rede.branchId)
  await bia?.limpar(); await cliente?.limpar(); await rede?.limpar()
})

test.describe.serial('agendar sem preferência de profissional', () => {
  test('os horários de todas aparecem juntos', async ({ browser }) => {
    await como(browser, cliente!, async p => {
      await abrirOAgendar(p)
      await p.getByRole('button', { name: /Sem preferência/ }).click()
      await p.getByLabel('Data').fill(dia(3))
      // 8h: só a Bia está livre; 14h: só a Ana. Os dois aparecem.
      await expect(p.getByRole('button', { name: '08:00', exact: true })).toBeVisible()
      await expect(p.getByRole('button', { name: '14:00', exact: true })).toBeVisible()
    })
  })

  test('ao confirmar, vai para quem tem MENOS atendimentos no dia', async ({ browser }) => {
    await como(browser, cliente!, p => agendarSemPreferencia(p, dia(3), '10:00'))
    const ag = await doDia(dia(3), '10:00')
    expect(ag?.professional_id).toBe(bia!.userId)
    expect(ag?.source).toBe('CLIENT_APP')
  })

  test('e para quem está LIVRE naquele horário, mesmo com mais atendimentos', async ({ browser }) => {
    // Bia ocupada às 14h: só a Ana (com mais atendimentos) pode.
    await como(browser, cliente!, p => agendarSemPreferencia(p, dia(3), '14:00'))
    const ag = await doDia(dia(3), '14:00')
    expect(ag?.professional_id).toBe(rede!.professionalId)
  })

  test('pelo id, horário que ninguém tem livre é recusado', async ({ browser }) => {
    await como(browser, cliente!, async p => {
      const r = await chamarAcao(p, 'actions/appointments.ts', 'createClientAppointment', `/${slug}/cliente/agendamentos/novo`, [{
        branchId: rede!.branchId, procedureId: rede!.procedureId, professionalId: null,
        scheduledAt: new Date(`${dia(3)}T03:00:00-03:00`).toISOString(), slug,
      }])
      expect(r.texto).toContain('não está mais disponível')
    })
    expect(await doDia(dia(3), '03:00')).toBeNull()
  })
})
