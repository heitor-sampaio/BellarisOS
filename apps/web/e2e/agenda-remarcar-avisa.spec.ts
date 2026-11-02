import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { diaEmQueAUnidadeAbre } from './apoio/datas'

/**
 * O remarcar da janela da agenda AVISA antes de confirmar, como o agendar:
 * - A25 da 5ª simulação: o horário novo fora do expediente da profissional
 *   ("Fora do horário de atendimento… O encaixe é permitido.");
 * - cli-01 (revisão do Heitor, 2026-11-02, "avisar ao remarcar, sem
 *   recusar"): a cliente ARQUIVADA. Remarcar continua permitido.
 */

const marca = `ra${Date.now().toString(36)}`
const db = () => banco()
let rede: OutraRede | null = null
let slug = ''
let recepcao: MembroDeTeste | null = null
const DIA = diaEmQueAUnidadeAbre(2)

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: recepcao!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(marca)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  expect((await db().from('users').update({ branch_id: rede.branchId, provides_services: true }).eq('id', rede.professionalId)).error).toBeNull()
  recepcao = await criarMembro(`r${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Recepção',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE', escopo: 'ALL' }, { modulo: 'clients', nivel: 'VIEW' }],
  })
})

test.afterAll(async () => {
  if (rede) {
    const ids = ((await db().from('appointments').select('id').eq('branch_id', rede.branchId)).data ?? []).map(a => a.id)
    if (ids.length) {
      await db().from('domain_events').delete().in('entidade_id', ids)
      await db().from('appointment_history').delete().in('appointment_id', ids)
    }
    await db().from('appointments').delete().eq('branch_id', rede.branchId)
  }
  await recepcao?.limpar(); await rede?.limpar()
})

test('o remarcar avisa da cliente arquivada e do horário fora do expediente, e remarca mesmo assim', async ({ browser }) => {
  const cliente = await rede!.criarCliente('Arquivada')
  const { data: ag, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: cliente, procedure_id: rede!.procedureId, professional_id: rede!.professionalId,
    status: 'SCHEDULED', source: 'INTERNAL', duration_min: 30, price: 0,
    scheduled_at: new Date(`${DIA}T10:00:00-03:00`).toISOString(),
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  expect((await db().from('clients').update({ is_active: false }).eq('id', cliente)).error).toBeNull()

  await como(browser, async p => {
    await p.goto(`/${slug}/agenda?date=${DIA}`)
    await p.locator(`[data-agendamento="${ag!.id}"]`).first().click()
    const janela = p.getByRole('dialog', { name: 'Agendamento' })
    await janela.getByRole('button', { name: 'Remarcar' }).click()
    const avisos = janela.locator('[data-aviso-do-remarcar]')
    await expect(avisos).toContainText('arquivada')

    // 21:00: a unidade fecha às 20:00 (padrão) — fora do expediente.
    await janela.locator('input[type="datetime-local"]').fill(`${DIA}T21:00`)
    await expect(avisos).toContainText('Fora do horário')
    await janela.getByRole('button', { name: 'Confirmar novo horário' }).click()
  })
  await expect.poll(async () => (await db().from('appointments').select('scheduled_at').eq('id', ag!.id).single()).data?.scheduled_at
    && new Date((await db().from('appointments').select('scheduled_at').eq('id', ag!.id).single()).data!.scheduled_at as string).toISOString())
    .toBe(new Date(`${DIA}T21:00:00-03:00`).toISOString())
})
