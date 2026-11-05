import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'

/**
 * A32 da 5ª simulação: dava para iniciar o atendimento 1h30 a 2h antes do
 * horário, sem aviso (a Tatiane iniciou às 11:07 o das 13:00). ANTES do
 * horário marcado, em qualquer quantidade de tempo (r2-age-06, o Heitor em
 * 2026-11-03: "confirma iniciar mesmo assim em qualquer período de tempo
 * anterior ao horário marcado"; era só a partir de 30 min), o início pede
 * confirmação — e o SERVIDOR só inicia com ela, nos três caminhos:
 * `startAppointment`, `updateAppointmentStatus` e `chegarEIniciar`. Na hora
 * marcada ou depois, inicia direto.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede
let profissional: MembroDeTeste
let slug = ''

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: profissional.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

async function agendamento(status: string, minutosAdiante = 45): Promise<string> {
  const cliente = await rede.criarCliente(`Cedo ${status}`)
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede.branchId, client_id: cliente, procedure_id: rede.procedureId, professional_id: profissional.userId,
    status, source: 'INTERNAL', duration_min: 30, price: 0,
    scheduled_at: new Date(Date.now() + minutosAdiante * 60_000).toISOString(),
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  return data!.id
}
const status = async (id: string) => (await db().from('appointments').select('status').eq('id', id).single()).data?.status

test.beforeAll(async () => {
  rede = await criarOutraRede(`ia${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  profissional = await criarMembro(`iap${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Profissional',
    permissoes: [
      { modulo: 'agenda', nivel: 'MANAGE', escopo: 'OWN' }, { modulo: 'clients', nivel: 'VIEW' },
      { modulo: 'medical_records', nivel: 'MANAGE', escopo: 'OWN' },
    ],
  })
  expect((await db().from('users').update({ provides_services: true }).eq('id', profissional.userId)).error).toBeNull()
})
test.afterAll(async () => {
  if (rede) await db().from('appointments').delete().eq('branch_id', rede.branchId)
  await profissional?.limpar(); await rede?.limpar()
})

test('pela tela: "Iniciar atendimento" 45 min antes pergunta, e só a resposta inicia', async ({ browser }) => {
  const id = await agendamento('ARRIVED')
  await como(browser, async p => {
    await p.goto(`/${slug}/agenda/${id}`)
    await p.getByRole('button', { name: 'Iniciar atendimento' }).click()
    const pergunta = p.locator('[data-inicio-adiantado]')
    await expect(pergunta).toContainText(/faltam 4\d min\. Iniciar mesmo assim\?/)
    expect(await status(id), 'sem a resposta, nada começa').toBe('ARRIVED')
    await pergunta.getByRole('button', { name: 'Iniciar mesmo assim' }).click()
    await expect.poll(() => status(id)).toBe('IN_PROGRESS')
  })
})

test('pelo servidor: os três caminhos recusam sem a confirmação e iniciam com ela', async ({ browser }) => {
  const peloStatus = await agendamento('CONFIRMED')
  const peloInicio = await agendamento('CONFIRMED')
  const chegandoAgora = await agendamento('SCHEDULED')
  await como(browser, async p => {
    const rota = `/${slug}/agenda/${peloStatus}`
    await p.goto(rota)
    const a = await chamarAcao(p, 'actions/appointments.ts', 'updateAppointmentStatus', rota, [peloStatus, 'IN_PROGRESS', slug])
    expect(a.texto).toContain('Iniciar mesmo assim?')
    const b = await chamarAcao(p, 'actions/appointments.ts', 'startAppointment', rota, [peloInicio, slug])
    expect(b.texto).toContain('Iniciar mesmo assim?')
    const c = await chamarAcao(p, 'actions/appointments.ts', 'chegarEIniciar', rota, [chegandoAgora, slug])
    expect(c.texto).toContain('Iniciar mesmo assim?')
    expect([await status(peloStatus), await status(peloInicio), await status(chegandoAgora)], 'nada mudou — nem a chegada')
      .toEqual(['CONFIRMED', 'CONFIRMED', 'SCHEDULED'])

    await chamarAcao(p, 'actions/appointments.ts', 'updateAppointmentStatus', rota, [peloStatus, 'IN_PROGRESS', slug, null, { inicioAdiantadoConfirmado: true }])
    await chamarAcao(p, 'actions/appointments.ts', 'startAppointment', rota, [peloInicio, slug, { inicioAdiantadoConfirmado: true }])
    await chamarAcao(p, 'actions/appointments.ts', 'chegarEIniciar', rota, [chegandoAgora, slug, { inicioAdiantadoConfirmado: true }])
  })
  expect([await status(peloStatus), await status(peloInicio), await status(chegandoAgora)]).toEqual(['IN_PROGRESS', 'IN_PROGRESS', 'IN_PROGRESS'])
})

test('"Marcar chegada e iniciar" também pergunta — e sem a resposta nem a chegada se marca', async ({ browser }) => {
  const id = await agendamento('CONFIRMED')
  await como(browser, async p => {
    await p.goto(`/${slug}/agenda/${id}`)
    await p.getByRole('button', { name: 'Marcar chegada e iniciar' }).click()
    const pergunta = p.locator('[data-inicio-adiantado]')
    await expect(pergunta).toContainText('Iniciar mesmo assim?')
    expect(await status(id)).toBe('CONFIRMED')
    await pergunta.getByRole('button', { name: 'Iniciar mesmo assim' }).click()
    await expect.poll(() => status(id)).toBe('IN_PROGRESS')
  })
})

test('r2-age-06: 10 min antes também pergunta, no "Iniciar atendimento" e no "Marcar chegada e iniciar"', async ({ browser }) => {
  const chegou = await agendamento('ARRIVED', 10)
  const confirmado = await agendamento('CONFIRMED', 10)
  await como(browser, async p => {
    await p.goto(`/${slug}/agenda/${chegou}`)
    await p.getByRole('button', { name: 'Iniciar atendimento' }).click()
    await expect(p.locator('[data-inicio-adiantado]')).toContainText(/faltam (9|10) min\. Iniciar mesmo assim\?/)
    expect(await status(chegou), 'sem a resposta, nada começa').toBe('ARRIVED')

    await p.goto(`/${slug}/agenda/${confirmado}`)
    await p.getByRole('button', { name: 'Marcar chegada e iniciar' }).click()
    await expect(p.locator('[data-inicio-adiantado]')).toContainText('Iniciar mesmo assim?')
    expect(await status(confirmado), 'nem a chegada se marca').toBe('CONFIRMED')
  })
})

test('controle: na hora marcada (já passou) inicia sem perguntar', async ({ browser }) => {
  const id = await agendamento('ARRIVED', -2)
  await como(browser, async p => {
    await p.goto(`/${slug}/agenda/${id}`)
    await p.getByRole('button', { name: 'Iniciar atendimento' }).click()
    await expect.poll(() => status(id)).toBe('IN_PROGRESS')
  })
})

// D10 da 7ª simulação: em 05/11, numa sessão de 06/11, "Marcar chegada e
// iniciar" perguntava "Iniciar mesmo assim?" e só no clique dizia "A chegada
// só se marca no dia do agendamento". A trava do dia vem ANTES da pergunta.
test('D10: "Marcar chegada e iniciar" de outro dia diz logo que a chegada é do dia — sem perguntar do horário', async ({ browser }) => {
  const amanha = await agendamento('CONFIRMED', 26 * 60)
  await como(browser, async p => {
    const rota = `/${slug}/agenda/${amanha}`
    await p.goto(rota)
    const r = await chamarAcao(p, 'actions/appointments.ts', 'chegarEIniciar', rota, [amanha, slug])
    expect(r.texto, 'a trava do dia primeiro').toContain('A chegada só se marca no dia do agendamento.')
    expect(r.texto).not.toContain('Iniciar mesmo assim?')
    await p.goto(rota)
    const botao = p.getByRole('button', { name: 'Marcar chegada e iniciar' })
    if (await botao.count()) {
      await botao.click()
      await expect(p.getByText('A chegada só se marca no dia do agendamento.')).toBeVisible()
      await expect(p.locator('[data-inicio-adiantado]')).toHaveCount(0)
    }
  })
  expect(await status(amanha)).toBe('CONFIRMED')
})
