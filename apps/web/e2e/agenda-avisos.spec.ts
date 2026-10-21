import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'

/**
 * Atritos da agenda vistos na simulação de um dia de clínica (2026-10-20):
 * - "Não compareceu" aparecia antes do horário;
 * - confirmar e remarcar fechavam a janela sem dizer nada (e o erro sumia);
 * - as setas de dia não tinham nome; a data não ia para a URL;
 * - o bloco de 30 min não mostrava quem era;
 * - a grade abria às 7h, não na hora de agora.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let recepcao: MembroDeTeste | null = null
let slug = ''
const dia = (dias: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(Date.now() + dias * 86_400_000))
const AMANHA = dia(1)

async function agendar(rotulo: string, quando: Date) {
  const cliente = await rede!.criarCliente(rotulo)
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: cliente, procedure_id: rede!.procedureId, professional_id: rede!.professionalId,
    status: 'SCHEDULED', source: 'INTERNAL', duration_min: 30, price: 0, scheduled_at: quando.toISOString(),
  }).select('id').single<{ id: string }>()
  expect(error, 'agendar').toBeNull()
  return data!.id
}
const statusDe = async (id: string) => (await db().from('appointments').select('status').eq('id', id).single<{ status: string }>()).data!.status

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: recepcao!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`av${marca}`)
  // A agenda da unidade tem uma coluna por profissional DELA.
  expect((await db().from('users').update({ branch_id: rede.branchId, provides_services: true }).eq('id', rede.professionalId)).error).toBeNull()
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  recepcao = await criarMembro(`avr${marca}`, {
    tenant: rede.tenantId, rotulo: 'Recepção', permissoes: [{ modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'VIEW' }],
  })
})
test.afterAll(async () => { await recepcao?.limpar(); await rede?.limpar() })

test.describe.serial('a agenda avisa', () => {
  test('"Não compareceu" só depois do horário — na tela e no servidor', async ({ browser }) => {
    const futuro = await agendar('Futuro', new Date(`${AMANHA}T10:00:00-03:00`))
    await como(browser, async p => {
      await p.goto(`/admin/agenda?date=${AMANHA}`)
      await p.locator(`[title*="Futuro av${marca}"]`).first().click()
      await expect(p.getByRole('button', { name: 'Confirmar agendamento' })).toBeVisible()
      await expect(p.getByRole('button', { name: 'Não compareceu' })).toHaveCount(0)
      const r = await chamarAcao(p, 'actions/appointments.ts', 'updateAppointmentStatus', '/admin/agenda', [futuro, 'NO_SHOW', ''])
      expect(r.texto).toContain('ainda não chegou')
    })
    expect(await statusDe(futuro)).toBe('SCHEDULED')
  })

  test('confirmar dá o aviso na agenda', async ({ browser }) => {
    const id = await agendar('Confirma', new Date(`${AMANHA}T11:00:00-03:00`))
    await como(browser, async p => {
      await p.goto(`/admin/agenda?date=${AMANHA}`)
      await p.locator(`[title*="Confirma av${marca}"]`).first().click()
      await p.getByRole('button', { name: 'Confirmar agendamento' }).click()
      await expect(p.getByRole('status').filter({ hasText: 'Agendamento confirmado.' })).toBeVisible()
    })
    expect(await statusDe(id)).toBe('CONFIRMED')
  })

  test('na agenda da unidade: as setas têm nome, a data vai para a URL e o bloco de 30 min diz quem é', async ({ browser }) => {
    const id = await agendar('Curto', new Date(`${AMANHA}T12:00:00-03:00`))
    await como(browser, async p => {
      await p.goto(`/${slug}/agenda`)
      await expect(p.getByRole('button', { name: 'Dia anterior' })).toBeVisible()
      await p.getByRole('button', { name: 'Próximo dia' }).click()
      await expect(p).toHaveURL(new RegExp(`date=${AMANHA}`))
      await p.reload()
      await expect(p.locator(`[data-agendamento="${id}"]`), 'a data ficou na URL, e o bloco curto mostra a cliente').toContainText(`Curto av${marca}`)
    })
  })

  test('a grade de hoje abre na hora de agora', async ({ browser }) => {
    const hora = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false }).format(new Date()))
    test.skip(hora < 10 || hora > 20, 'só faz sentido com a hora de agora no meio da grade (7h–21h)')
    await como(browser, async p => {
      await p.goto(`/${slug}/agenda`)
      const grade = p.locator('[data-grade-do-dia]')
      await expect.poll(async () => grade.evaluate(el => el.scrollTop)).toBeGreaterThan(0)
    })
  })
})
