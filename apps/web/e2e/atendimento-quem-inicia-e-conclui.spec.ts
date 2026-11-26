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
 * - C14: sem o "só os meus" (SM1, o Heitor, 2026-11-23), o Atendimento em
 *   Gerenciar inicia e conclui o de qualquer profissional da unidade ao
 *   alcance. E a agenda em Ver não cancela: o "Cancelar" aparecia e a action
 *   recusava.
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
  // A colega com o Atendimento em Gerenciar — não é a profissional do atendimento.
  colega = await criarMembro(`qiv${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Colega',
    permissoes: [
      { modulo: 'agenda', nivel: 'VIEW' },
      { modulo: 'atendimento', nivel: 'MANAGE' },
      { modulo: 'clients', nivel: 'VIEW' },
    ],
  })
  // A Agenda em Gerenciar, o Atendimento só em Ver (e o Prontuário em Gerenciar,
  // que não inicia nem conclui).
  soAgenda = await criarMembro(`qia${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Agenda sem atendimento',
    permissoes: [
      { modulo: 'agenda', nivel: 'MANAGE' },
      { modulo: 'atendimento', nivel: 'VIEW' },
      { modulo: 'medical_records', nivel: 'MANAGE' },
      { modulo: 'clients', nivel: 'VIEW' },
    ],
  })
})
test.afterAll(async () => { await colega?.limpar(); await soAgenda?.limpar(); await rede?.limpar() })

test('C14: com o Atendimento em Gerenciar, a colega inicia e finaliza o atendimento de outra profissional; sem "Cancelar" do agendado na Agenda em Ver, e desiste do Em atendimento', async ({ browser }) => {
  const confirmado = await agendado('CONFIRMED')
  const emCurso    = await agendado('IN_PROGRESS')
  await como(browser, colega!, async p => {
    await p.goto(`/${slug}/agenda/${confirmado}`)
    await expect(p.getByRole('button', { name: 'Iniciar atendimento' }), 'inicia o de outra').toBeVisible()
    await expect(p.getByRole('button', { name: 'Cancelar', exact: true }), 'a Agenda em Ver não cancela').toHaveCount(0)
    await p.goto(`/${slug}/agenda/${emCurso}`)
    await expect(p.getByRole('button', { name: 'Finalizar atendimento' }), 'finaliza o de outra').toBeVisible()
    // Cancelar o Em atendimento é DESISTIR: do Atendimento em Gerenciar, não da
    // Agenda (CLAUDE.md §11, o Heitor, 18/11; ATD-A01 — antes ficava escondido).
    // O botão diz "Cancelar" (o Heitor, 25/11: "Mantem o Cancelar").
    await expect(p.getByRole('button', { name: 'Cancelar', exact: true }), 'o Atendimento em Gerenciar cancela o Em atendimento').toBeVisible()
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
    // …nem desiste dele: cancelar o Em atendimento é do Atendimento (ATD-A01).
    await expect(p.getByRole('button', { name: 'Cancelar', exact: true }), 'sem o Cancelar do Em atendimento').toHaveCount(0)

    // Pelo id: o status e a conclusão recusam.
    await chamarAcao(p, 'actions/appointments.ts', 'updateAppointmentStatus', `/${slug}/agenda`,
      [confirmado, 'IN_PROGRESS', slug, null, { inicioAdiantadoConfirmado: true }])
    await chamarAcaoComFormulario(p, 'actions/appointments.ts', 'finishSession', `/${slug}/agenda/${emCurso}`,
      [null], { appointment_id: emCurso, slug, products_used: '[]', notes: '', intercurrences: '' })
  })
  expect(await situacao(confirmado), 'não iniciou').toBe('CONFIRMED')
  expect(await situacao(emCurso), 'não concluiu').toBe('IN_PROGRESS')
})

// UM1 (o Heitor, 2026-11-23; Q13 da revisão de 24/11): a tela do atendimento abre
// com o Atendimento em Ver, e a Agenda em Ver não a abre — nem a janela da agenda
// leva a ela (o "Retomar atendimento" dava em "sem acesso").
test('a Agenda em Ver sem o Atendimento não abre a tela do atendimento, e a janela não leva a ela', async ({ browser }) => {
  const emCurso = await agendado('IN_PROGRESS')
  const soVeAAgenda = await criarMembro(`qiw${marca}`, {
    tenant: rede!.tenantId, branchId: rede!.branchId, rotulo: 'Só vê a agenda',
    permissoes: [
      { modulo: 'agenda', nivel: 'VIEW' },
      { modulo: 'atendimento', nivel: 'NONE' },
      { modulo: 'clients', nivel: 'VIEW' },
    ],
  })
  try {
    await como(browser, soVeAAgenda, async p => {
      const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
      await p.goto(`/${slug}/agenda?date=${hoje}`)
      await p.locator(`[data-agendamento="${emCurso}"]`).first().click()
      const janela = p.getByRole('dialog', { name: 'Agendamento' })
      await expect(janela).toBeVisible()
      await expect(janela.getByRole('link', { name: 'Retomar atendimento' })).toHaveCount(0)
      // Pela URL: a tela não abre.
      await p.goto(`/${slug}/agenda/${emCurso}`)
      await expect(p.getByRole('button', { name: 'Finalizar atendimento' })).toHaveCount(0)
      await expect(p.getByText(/sem acesso|não tem acesso/i).first()).toBeVisible()
    })
    // Controle: com o Atendimento em Ver, a janela leva à tela.
    await como(browser, soAgenda!, async p => {
      const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
      await p.goto(`/${slug}/agenda?date=${hoje}`)
      await p.locator(`[data-agendamento="${emCurso}"]`).first().click()
      await expect(p.getByRole('dialog', { name: 'Agendamento' }).getByRole('link', { name: 'Retomar atendimento' })).toBeVisible()
    })
  } finally { await soVeAAgenda.limpar() }
})
