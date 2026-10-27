import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'

/**
 * A frente "agenda" da simulação de 2026-10-27: D8, A17, A18, A19, A20, A23
 * e a sobra da frente 3 (a janela não oferece "Cancelar" a quem a action recusa).
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let slug = ''
let recepcao: MembroDeTeste | null = null
let propria: MembroDeTeste | null = null
const fmt = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d)
const HOJE = fmt(new Date())
const AMANHA = fmt(new Date(Date.now() + 24 * 3600 * 1000))
const DEPOIS = fmt(new Date(Date.now() + 4 * 24 * 3600 * 1000))

async function agendar(rotulo: string, professionalId: string, dia: string, hora: string, extra: Record<string, unknown> = {}) {
  const cliente = await rede!.criarCliente(rotulo)
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: cliente, procedure_id: rede!.procedureId, professional_id: professionalId,
    status: 'SCHEDULED', source: 'INTERNAL', duration_min: 30, price: 0,
    scheduled_at: new Date(`${dia}T${hora}:00-03:00`).toISOString(), ...extra,
  }).select('id').single<{ id: string }>()
  expect(error, 'agendar').toBeNull()
  return { id: data!.id, cliente }
}
async function como(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`ad${marca}`)
  expect((await db().from('users').update({ branch_id: rede.branchId, provides_services: true }).eq('id', rede.professionalId)).error).toBeNull()
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  recepcao = await criarMembro(`adr${marca}`, {
    tenant: rede.tenantId, rotulo: 'Recepção',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'VIEW' }],
  })
  propria = await criarMembro(`adp${marca}`, {
    tenant: rede.tenantId, rotulo: 'Profissional da rede',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE', escopo: 'OWN' }, { modulo: 'clients', nivel: 'VIEW' }],
  })
  expect((await db().from('users').update({ provides_services: true }).eq('id', propria.userId)).error).toBeNull()
})
test.afterAll(async () => {
  if (rede) await db().from('appointments').delete().eq('branch_id', rede.branchId)
  await propria?.limpar(); await recepcao?.limpar(); await rede?.limpar()
})

test('A18: a chegada de outro dia é recusada, e a janela não oferece "Chegou"', async ({ browser }) => {
  const { id } = await agendar('Amanhã', rede!.professionalId, AMANHA, '10:00')
  await como(browser, recepcao!, async p => {
    await p.goto('/admin/agenda')
    const r = await chamarAcao(p, 'actions/appointments.ts', 'updateAppointmentStatus', '/admin/agenda', [id, 'ARRIVED', slug])
    expect(r.texto).toMatch(/no dia do agendamento/)
    await p.goto(`/admin/agenda?date=${AMANHA}`)
    await p.locator(`[title*="Amanhã ad${marca}"]`).first().click()
    await expect(p.getByRole('button', { name: 'Confirmar agendamento' })).toBeVisible()
    await expect(p.getByRole('button', { name: 'Chegou' })).toHaveCount(0)
  })
  const { data } = await db().from('appointments').select('status').eq('id', id).single<{ status: string }>()
  expect(data!.status).toBe('SCHEDULED')
})

test('sobra da frente 3: "só os meus" não vê Cancelar nem Não compareceu na janela', async ({ browser }) => {
  await agendar('Dela', propria!.userId, HOJE, '07:00')
  await como(browser, propria!, async p => {
    await p.goto(`/admin/agenda?date=${HOJE}`)
    await p.locator(`[title*="Dela ad${marca}"]`).first().click()
    await expect(p.getByRole('button', { name: 'Marcar chegada e iniciar' })).toBeVisible()
    await expect(p.getByRole('button', { name: 'Cancelar' })).toHaveCount(0)
    await expect(p.getByRole('button', { name: 'Não compareceu' })).toHaveCount(0)
  })
})

test('A19: o cancelado mostra o motivo no tooltip do bloco e inteiro na janela', async ({ browser }) => {
  const motivo = `Mudou de cidade e não volta mais ${marca}`
  const { id } = await agendar('Cancelada', rede!.professionalId, AMANHA, '11:00',
    { status: 'CANCELLED', cancelled_at: new Date().toISOString(), cancellation_reason: motivo })
  await como(browser, recepcao!, async p => {
    await p.goto(`/${slug}/agenda?date=${AMANHA}&cancelados=1`)
    const bloco = p.locator(`[data-agendamento="${id}"]`)
    await expect(bloco).toHaveAttribute('title', new RegExp(motivo))
    await bloco.click()
    await expect(p.locator('[data-motivo-do-cancelamento]')).toContainText(motivo)
  })
})

test('D8 + A17: outro dia rola para o primeiro atendimento/abertura, e o plural certo', async ({ browser }) => {
  await agendar('Manhã', rede!.professionalId, DEPOIS, '09:00')
  const rolagem = (p: Page) => p.evaluate(() => {
    const el = Array.from(document.querySelectorAll<HTMLElement>('div'))
      .find(d => d.scrollHeight > d.clientHeight + 200 && getComputedStyle(d).overflowY !== 'visible')
    return el ? { achou: true, topo: el.scrollTop, fim: el.scrollHeight } : { achou: false, topo: 0, fim: 0 }
  })
  await como(browser, recepcao!, async p => {
    await p.goto(`/${slug}/agenda?date=${HOJE}`)
    await p.evaluate(() => {
      const el = Array.from(document.querySelectorAll<HTMLElement>('div'))
        .find(d => d.scrollHeight > d.clientHeight + 200 && getComputedStyle(d).overflowY !== 'visible')
      if (el) el.scrollTop = el.scrollHeight
    })
    // Navega pelo botão "Próximo dia": a mesma grade, sem remontar.
    for (let i = 0; i < 4; i++) await p.getByRole('button', { name: 'Próximo dia' }).click()
    await expect(p.getByText(/^1 atendimento · /)).toBeVisible()
    await expect.poll(async () => (await rolagem(p)).topo, 'a manhã não fica escondida').toBeLessThanOrEqual(80 * 2)
  })
})

test('A20: o próximo horário livre da profissional (a mesma conta da agenda)', async ({ browser }) => {
  await como(browser, recepcao!, async p => {
    await p.goto('/admin/agenda')
    const pedir = async () => {
      const r = await chamarAcao(p, 'actions/appointments.ts', 'proximoHorarioLivre', '/admin/agenda', [rede!.branchId, rede!.professionalId, 30])
      return (r.texto.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/) ?? [null])[0]
    }
    const a = await pedir()
    expect(a, 'há um horário').toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
    expect(new Date(`${a}:00-03:00`).getTime(), 'nunca no passado').toBeGreaterThan(Date.now())
    // Ocupa esse horário: o próximo pedido pula para o seguinte.
    const [dia = '', hora = ''] = a!.split('T')
    await agendar('Ocupa', rede!.professionalId, dia, hora)
    const b = await pedir()
    expect(b).not.toBe(a)
    expect(new Date(`${b}:00-03:00`).getTime()).toBeGreaterThan(new Date(`${a}:00-03:00`).getTime())
  })
})

test('A23: a confirmação e a chegada entram na linha do tempo da cliente', async ({ browser }) => {
  const { id, cliente } = await agendar('Linha', rede!.professionalId, HOJE, '08:00')
  const agora = new Date().toISOString()
  expect((await db().from('appointments').update({ status: 'ARRIVED', confirmed_at: agora, arrived_at: agora }).eq('id', id)).error).toBeNull()
  await como(browser, recepcao!, async p => {
    await p.goto(`/admin/clients/${cliente}?aba=historico`)
    await expect(p.getByText(/^Confirmado:/)).toBeVisible()
    await expect(p.getByText(/^Chegou:/)).toBeVisible()
  })
})
