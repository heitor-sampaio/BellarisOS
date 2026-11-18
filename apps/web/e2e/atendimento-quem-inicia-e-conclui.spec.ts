import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { haMinutosHoje } from './apoio/datas'
import { chamarAcao, chamarAcaoComFormulario } from './apoio/acao-direta'

/**
 * Quem inicia e conclui o atendimento é o módulo ATENDIMENTO em Gerenciar (o
 * Heitor, 2026-11-18: "Agenda é agenda e atendimento é atendimento. Só inicia
 * e conclui atendimento quem tem gerenciar no atendimento." — saiu o D20, "a
 * Agenda em Ver inicia e conclui").
 * - C14 (D21 do levantamento das regras, o Heitor, 2026-11-11): o atendimento
 *   de OUTRA profissional é o ESCOPO — com "todos", qualquer um da unidade ao
 *   alcance; com "só os meus", só o próprio. E a agenda em Ver não cancela: o
 *   "Cancelar" aparecia e a action recusava.
 * - A Agenda em Gerenciar sem o Atendimento em Gerenciar marca a chegada, mas
 *   não inicia nem conclui: a janela não oferece o "Iniciar" (diz quem inicia)
 *   e as actions recusam pelo id.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let slug = ''
let colega: MembroDeTeste | null = null
let soAgenda: MembroDeTeste | null = null

async function como(browser: Browser, quem: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: quem.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}
async function agendado(status: string) {
  const cliente = await rede!.criarCliente(`Qi${status}${Math.random().toString(36).slice(2, 6)}`)
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: cliente, procedure_id: rede!.procedureId, professional_id: rede!.professionalId,
    status, source: 'INTERNAL', duration_min: 30, price: 0, scheduled_at: haMinutosHoje(30),
    ...(status === 'IN_PROGRESS' ? { started_at: new Date().toISOString() } : {}),
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  return data!.id
}
const situacao = async (id: string) => (await db().from('appointments').select('status').eq('id', id).single<{ status: string }>()).data!.status

test.beforeAll(async () => {
  rede = await criarOutraRede(`qi${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  expect((await db().from('users').update({ atende_em: [rede.branchId] }).eq('id', rede.professionalId)).error).toBeNull()
  // A colega com o Atendimento em Gerenciar de todos — não é a profissional do atendimento.
  colega = await criarMembro(`qiv${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Colega',
    permissoes: [
      { modulo: 'agenda', nivel: 'VIEW', escopo: 'ALL' },
      { modulo: 'atendimento', nivel: 'MANAGE', escopo: 'ALL' },
      { modulo: 'clients', nivel: 'VIEW' },
    ],
  })
  // A Agenda em Gerenciar, o Atendimento só em Ver (e o Prontuário em Gerenciar,
  // que não inicia nem conclui).
  soAgenda = await criarMembro(`qia${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Agenda sem atendimento',
    permissoes: [
      { modulo: 'agenda', nivel: 'MANAGE', escopo: 'ALL' },
      { modulo: 'atendimento', nivel: 'VIEW', escopo: 'ALL' },
      { modulo: 'medical_records', nivel: 'MANAGE', escopo: 'ALL' },
      { modulo: 'clients', nivel: 'VIEW' },
    ],
  })
})
test.afterAll(async () => { await colega?.limpar(); await soAgenda?.limpar(); await rede?.limpar() })

test('C14: com o Atendimento "todos", a colega inicia e finaliza o atendimento de outra profissional; sem "Cancelar" na Agenda em Ver', async ({ browser }) => {
  const confirmado = await agendado('CONFIRMED')
  const emCurso    = await agendado('IN_PROGRESS')
  await como(browser, colega!, async p => {
    await p.goto(`/${slug}/agenda/${confirmado}`)
    await expect(p.getByRole('button', { name: 'Iniciar atendimento' }), 'inicia o de outra').toBeVisible()
    await expect(p.getByRole('button', { name: 'Cancelar', exact: true }), 'a Agenda em Ver não cancela').toHaveCount(0)
    await p.goto(`/${slug}/agenda/${emCurso}`)
    await expect(p.getByRole('button', { name: 'Finalizar atendimento' }), 'finaliza o de outra').toBeVisible()
    await expect(p.getByRole('button', { name: 'Cancelar', exact: true })).toHaveCount(0)
  })
})

test('a Agenda em Gerenciar sem o Atendimento em Gerenciar não inicia nem conclui — na tela e pelo id', async ({ browser }) => {
  const confirmado = await agendado('CONFIRMED')
  const emCurso    = await agendado('IN_PROGRESS')
  await como(browser, soAgenda!, async p => {
    await p.goto(`/${slug}/agenda/${confirmado}`)
    await expect(p.getByRole('button', { name: 'Iniciar atendimento' }), 'sem o Iniciar').toHaveCount(0)
    await expect(p.getByText('Você não inicia nem conclui este atendimento.')).toBeVisible()
    await p.goto(`/${slug}/agenda/${emCurso}`)
    await expect(p.getByRole('button', { name: 'Finalizar atendimento' }), 'sem o Finalizar').toHaveCount(0)

    // Pelo id: o status e a conclusão recusam.
    await chamarAcao(p, 'actions/appointments.ts', 'updateAppointmentStatus', `/${slug}/agenda`,
      [confirmado, 'IN_PROGRESS', slug, null, { inicioAdiantadoConfirmado: true }])
    await chamarAcaoComFormulario(p, 'actions/appointments.ts', 'finishSession', `/${slug}/agenda/${emCurso}`,
      [null], { appointment_id: emCurso, slug, products_used: '[]', notes: '', intercurrences: '' })
  })
  expect(await situacao(confirmado), 'não iniciou').toBe('CONFIRMED')
  expect(await situacao(emCurso), 'não concluiu').toBe('IN_PROGRESS')
})
