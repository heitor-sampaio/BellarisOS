import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { diaEmQueAUnidadeAbre } from './apoio/datas'

/**
 * D20 (atendimento.md, "Quem faz o quê na agenda"): a Agenda em Gerenciar
 * remarca; com "só os meus", só os próprios. A action já remarcava o próprio
 * (`remarcarCore`, pelo escopo), mas a janela escondia o "Remarcar" de quem
 * tem "só os meus" (F75 — a sobra da F65).
 *
 * Numa rede [e2e] própria: uma profissional da rede com a Agenda em Gerenciar
 * "só os meus", na agenda da rede.
 */

const marca = `rp${Date.now().toString(36)}`
const db = () => banco()
let rede: OutraRede | null = null
let pro: MembroDeTeste | null = null
const DIA = diaEmQueAUnidadeAbre(2)

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: pro!.estado, viewport: { width: 1440, height: 900 } })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  test.setTimeout(150_000)
  rede = await criarOutraRede(marca)
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  pro = await criarMembro(`p${marca}`, {
    tenant: rede.tenantId, rotulo: 'Profissional',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE', escopo: 'OWN' }, { modulo: 'clients', nivel: 'VIEW' }],
  })
  expect((await db().from('users').update({ provides_services: true, atende_em: [rede.branchId] }).eq('id', pro.userId)).error).toBeNull()
})

test.afterAll(async () => {
  await pro?.limpar(); await rede?.limpar()
})

test('D20: com "só os meus" e Gerenciar, a janela mostra o "Remarcar" do próprio, e remarca', async ({ browser }) => {
  test.setTimeout(120_000)
  const cliente = await rede!.criarCliente('Remarcada')
  const { data: ag, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: cliente, procedure_id: rede!.procedureId, professional_id: pro!.userId,
    status: 'SCHEDULED', source: 'INTERNAL', duration_min: 30, price: 0,
    scheduled_at: new Date(`${DIA}T10:00:00-03:00`).toISOString(),
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()

  await como(browser, async p => {
    await p.goto(`/admin/agenda?date=${DIA}`)
    await p.locator(`[data-agendamento="${ag!.id}"]`).first().click({ timeout: 30_000 })
    const janela = p.getByRole('dialog', { name: 'Agendamento' })
    await janela.getByRole('button', { name: 'Remarcar' }).click({ timeout: 15_000 })
    await janela.locator('input[type="datetime-local"]').fill(`${DIA}T11:00`)
    await janela.getByRole('button', { name: 'Confirmar novo horário' }).click()
  })
  await expect.poll(async () => {
    const { data } = await db().from('appointments').select('scheduled_at').eq('id', ag!.id).single<{ scheduled_at: string }>()
    return data ? new Date(data.scheduled_at).toISOString() : null
  }, { timeout: 20_000 }).toBe(new Date(`${DIA}T11:00:00-03:00`).toISOString())
})
