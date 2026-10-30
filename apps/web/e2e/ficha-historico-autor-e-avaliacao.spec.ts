import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { clienteComSessao, criarMembro, type ClienteDeTeste, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { diaEmQueAUnidadeAbre } from './apoio/datas'

/**
 * O histórico da cliente, ajustes de 2026-10-30:
 * - J-26: o comentário da avaliação não voltava ao histórico (nem ao da
 *   ficha, nem ao do app), e o agendamento cancelado em duplicidade aparecia
 *   no "Histórico de procedimentos" da ficha, que é o que ela FEZ;
 * - J-27: a linha do tempo da ficha e a janela do agendamento não diziam quem
 *   fez cada ação — `appointment_history` já guarda o nome (com a marca "via
 *   suporte", quando é o caso).
 *
 * Rede `[e2e]` própria; a cliente tem login (o histórico do app é dela).
 */

const marca = Date.now().toString(36)
const db = () => banco()
const COMENTARIO = `Adorei a limpeza ${marca}`
const QUEM_AGENDOU = `Ana Recepção ${marca}`
const QUEM_ATENDEU = `Dra. Bia ${marca}`
const QUEM_CANCELOU = `Carla via suporte ${marca}`
const DIA = diaEmQueAUnidadeAbre(-3)

let rede: OutraRede | null = null
let recepcao: MembroDeTeste | null = null
let cliente: ClienteDeTeste | null = null
let slug = ''
let feito = ''
let cancelado = ''

async function como(browser: Browser, estado: string, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`fh${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  // A grade da unidade mostra quem atende nela.
  expect((await db().from('users').update({ branch_id: rede.branchId, provides_services: true }).eq('id', rede.professionalId)).error).toBeNull()
  recepcao = await criarMembro(`fhr${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Recepção',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE', escopo: 'ALL' }, { modulo: 'clients', nivel: 'MANAGE', escopo: 'ALL' }],
  })
  cliente = await clienteComSessao(`fh${marca}`, { id: rede.branchId, slug }, { tenant: rede.tenantId })

  const quando = (h: number) => new Date(`${DIA}T${String(h).padStart(2, '0')}:00:00-03:00`).toISOString()
  const base = {
    branch_id: rede.branchId, client_id: cliente.clientId, procedure_id: rede.procedureId,
    professional_id: rede.professionalId, source: 'INTERNAL', duration_min: 30, price: 120,
  }
  const { data: a1, error: e1 } = await db().from('appointments').insert({
    ...base, status: 'COMPLETED', scheduled_at: quando(10), completed_at: quando(11),
    client_confirmed_at: quando(12), procedure_rating: 5, client_rating: 4, client_feedback: COMENTARIO,
  }).select('id').single<{ id: string }>()
  expect(e1, 'o atendimento feito e avaliado').toBeNull()
  feito = a1!.id
  // O mesmo horário marcado duas vezes, e a cópia cancelada.
  const { data: a2, error: e2 } = await db().from('appointments').insert({
    ...base, status: 'CANCELLED', scheduled_at: quando(10), cancelled_at: quando(9), cancellation_reason: 'Duplicado',
  }).select('id').single<{ id: string }>()
  expect(e2, 'o cancelado em duplicidade').toBeNull()
  cancelado = a2!.id

  const { error: eh } = await db().from('appointment_history').insert([
    { appointment_id: feito, changed_by_id: recepcao.userId, changed_by_name: QUEM_AGENDOU, action: 'CREATED', description: 'Agendamento criado', created_at: quando(8) },
    { appointment_id: feito, changed_by_id: recepcao.userId, changed_by_name: QUEM_ATENDEU, action: 'COMPLETED', description: 'Atendimento concluído', created_at: quando(11) },
    { appointment_id: cancelado, changed_by_id: recepcao.userId, changed_by_name: QUEM_CANCELOU, action: 'CANCELLED', description: 'Cancelado: Duplicado', created_at: quando(9) },
  ])
  expect(eh, 'o histórico de quem fez').toBeNull()
})
test.afterAll(async () => {
  await cliente?.limpar(); await recepcao?.limpar(); await rede?.limpar()
})

test('a ficha: o cancelado fica fora do "Histórico de procedimentos"', async ({ browser }) => {
  await como(browser, recepcao!.estado, async p => {
    await p.goto(`/${slug}/clients/${cliente!.clientId}`)
    const card = p.locator('.card').filter({ has: p.getByRole('heading', { name: 'Histórico de procedimentos' }) })
    await expect(card).toContainText('Concluído')
    await expect(card, 'o cancelado em duplicidade não é procedimento feito').not.toContainText('Cancelado')
  })
})

test('a linha do tempo da ficha diz quem fez e traz o comentário da avaliação', async ({ browser }) => {
  await como(browser, recepcao!.estado, async p => {
    await p.goto(`/${slug}/clients/${cliente!.clientId}?aba=historico`)
    await expect(p.getByText(COMENTARIO), 'J-26: o comentário da avaliação').toBeVisible()
    await expect(p.getByText(`por ${QUEM_ATENDEU}`), 'quem concluiu').toBeVisible()
    await expect(p.getByText(`por ${QUEM_CANCELOU}`), 'quem cancelou, com a marca do suporte').toBeVisible()
  })
})

test('a janela do agendamento diz quem fez cada ação', async ({ browser }) => {
  await como(browser, recepcao!.estado, async p => {
    await p.goto(`/${slug}/agenda?date=${DIA}`)
    const janela = p.getByRole('dialog', { name: 'Agendamento' })
    await expect(async () => {
      if (!(await janela.isVisible())) await p.locator(`[data-agendamento="${feito}"]`).first().dispatchEvent('click')
      await expect(janela).toBeVisible({ timeout: 2_000 })
    }).toPass({ timeout: 30_000 })
    await expect(janela.getByText(QUEM_AGENDOU)).toBeVisible()
    await expect(janela.getByText(QUEM_ATENDEU)).toBeVisible()
  })
})

test('o histórico do app mostra o comentário que ela deixou', async ({ browser }) => {
  await como(browser, cliente!.estado, async p => {
    await p.goto(`/${slug}/cliente/historico`)
    await expect(p.getByText(COMENTARIO)).toBeVisible()
  })
})
