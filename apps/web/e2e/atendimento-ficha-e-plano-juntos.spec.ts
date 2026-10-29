import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { apagarAgendamentos } from './apoio/limpeza'
import { chamarAcao } from './apoio/acao-direta'
import { responderAnamnese } from './apoio/anamnese'

/**
 * Revisão do Heitor, 2026-10-29: a ficha e o plano numa gravação só.
 *
 * O "Enviar para a recepção" salvava a ficha do procedimento (uma action) e
 * depois gerava o plano (outra) — e o plano gravava a anamnese, o plano, as
 * sessões e as dores em passos soltos. Plano que falhava deixava a ficha (e a
 * anamnese, e um plano sem sessão) gravados pela metade. Agora o app calcula e
 * UMA função grava tudo (`gerar_plano_da_avaliacao`): falhou um passo, nada fica.
 */

const marca = Date.now().toString(36)
const db = () => banco()
const FICHA = `Ficha de peeling ${marca}`
const ACIDO = `Mandélico 30% ${marca}`
const DORES = `Manchas na testa ${marca}`

let rede: OutraRede | null = null
let profissional: MembroDeTeste | null = null
let slug = ''
let fichaId = ''
const procedimentosDoTeste: string[] = []

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: profissional!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

async function avaliacaoEmCurso(rotulo: string): Promise<{ id: string; cliente: string; respostas: Record<string, string | string[]> }> {
  const cliente = await rede!.criarCliente(rotulo)
  const respostas = await responderAnamnese(cliente, rede!.tenantId)
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: cliente, procedure_id: rede!.procedureId, professional_id: profissional!.userId,
    status: 'IN_PROGRESS', source: 'INTERNAL', duration_min: 30, price: 0,
    scheduled_at: new Date(Date.now() - 30 * 60_000).toISOString(), started_at: new Date(Date.now() - 20 * 60_000).toISOString(),
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  return { id: data!.id, cliente, respostas }
}

/** Um procedimento a mais, para o plano (o do agendamento é a avaliação). */
async function procedimentoDoPlano(rotulo: string): Promise<string> {
  const { data, error } = await db().from('procedures').insert({
    tenant_id: rede!.tenantId, name: `[e2e] ${rotulo} ${marca}`, category: 'e2e', duration_min: 30, price: 250, is_active: true,
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  procedimentosDoTeste.push(data!.id)
  return data!.id
}

const fichaGravada = async (id: string) => ((await db().from('medical_record_entries').select('form_data, queixas')
  .eq('appointment_id', id).maybeSingle()).data ?? null) as { form_data: { ficha?: { answers?: Record<string, unknown> } } | null; queixas: string | null } | null
const plano = async (id: string) => (await db().from('treatment_plans').select('id, status, treatment_plan_sessions(id, treatment_plan_session_procedures(procedure_id))')
  .eq('evaluation_appointment_id', id).maybeSingle()).data

/** Monta, pela tela, a ficha, as dores e uma sessão do plano com o procedimento. */
async function montarAvaliacao(p: Page, procedimentoNome: string) {
  await p.getByPlaceholder('Anote o que o cliente relatou: queixas estéticas, objetivos, histórico de tratamentos anteriores…').fill(DORES)
  await p.locator('[data-ficha-do-procedimento] [data-campo="fototipo"] select').selectOption('III')
  await p.locator('[data-ficha-do-procedimento] [data-campo="acido"] input').fill(ACIDO)
  await p.getByRole('button', { name: 'Nova sessão' }).click()
  await p.getByRole('button', { name: 'Adicionar procedimento' }).click()
  await p.locator('select').filter({ hasText: 'Selecionar procedimento…' }).selectOption({ label: procedimentoNome })
}

test.beforeAll(async () => {
  test.setTimeout(180_000)
  rede = await criarOutraRede(`fp${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  const { data: ficha, error } = await db().from('forms').insert({
    tenant_id: rede.tenantId, name: FICHA, is_active: true, tipo: 'PROCEDIMENTO',
    schema: { rows: [
      { id: 'r1', fields: [
        { id: 'fototipo', type: 'select', label: 'Fototipo', required: true, options: ['I', 'II', 'III', 'IV'] },
        { id: 'acido', type: 'text', label: 'Ácido utilizado' },
      ] },
    ] },
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  fichaId = ficha!.id
  expect((await db().from('procedures').update({ form_id: fichaId, price: 0 }).eq('id', rede.procedureId)).error).toBeNull()
  profissional = await criarMembro(`fpp${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Profissional',
    permissoes: [
      { modulo: 'agenda', nivel: 'MANAGE', escopo: 'OWN' },
      { modulo: 'clients', nivel: 'VIEW' },
      { modulo: 'medical_records', nivel: 'MANAGE', escopo: 'OWN' },
    ],
  })
  expect((await db().from('users').update({ provides_services: true }).eq('id', profissional.userId)).error).toBeNull()
})
test.afterAll(async () => {
  if (rede) {
    await db().from('treatment_plans').delete().eq('branch_id', rede.branchId)
    const { data: ags } = await db().from('appointments').select('id').eq('branch_id', rede.branchId)
    expect(await apagarAgendamentos((ags ?? []).map(a => a.id as string)), 'a limpeza tem de apagar tudo').toEqual([])
    if (procedimentosDoTeste.length) await db().from('procedures').delete().in('id', procedimentosDoTeste)
    await db().from('procedures').update({ form_id: null }).eq('id', rede.procedureId)
    await db().from('forms').delete().eq('id', fichaId)
  }
  await profissional?.limpar(); await rede?.limpar()
})

test('"Enviar para a recepção" grava a ficha e o plano juntos', async ({ browser }) => {
  const { id } = await avaliacaoEmCurso('Juntos')
  const proc = await procedimentoDoPlano('Peeling')
  await como(browser, async p => {
    await p.goto(`/${slug}/agenda/${id}`)
    await montarAvaliacao(p, `[e2e] Peeling ${marca}`)
    await p.getByRole('button', { name: 'Enviar para a recepção' }).click()
    // O envio terminou inteiro: o plano proposto e as dores no prontuário.
    await expect.poll(async () => [(await plano(id))?.status, (await fichaGravada(id))?.queixas], { timeout: 30_000 })
      .toEqual(['PROPOSED', DORES])
  })
  const pl = await plano(id)
  expect(pl!.treatment_plan_sessions[0]!.treatment_plan_session_procedures).toEqual([{ procedure_id: proc }])
  const entrada = await fichaGravada(id)
  expect(entrada?.form_data?.ficha?.answers, 'a ficha foi junto com o plano').toMatchObject({ fototipo: 'III', acido: ACIDO })
  expect(entrada?.queixas).toBe(DORES)
})

test('o plano falhou: a ficha não fica salva pela metade', async ({ browser }) => {
  const { id } = await avaliacaoEmCurso('Falhou')
  const proc = await procedimentoDoPlano('Some')
  await como(browser, async p => {
    await p.goto(`/${slug}/agenda/${id}`)
    await montarAvaliacao(p, `[e2e] Some ${marca}`)
    // O procedimento escolhido some do banco antes do envio: a sessão do plano não grava.
    expect((await db().from('procedures').delete().eq('id', proc)).error).toBeNull()
    await p.getByRole('button', { name: 'Enviar para a recepção' }).click()
    await expect(p.getByText(/Não consegui salvar os procedimentos|Procedimento do plano não encontrado/), 'a tela diz que falhou').toBeVisible()
  })
  expect(await plano(id), 'nenhum plano').toBeNull()
  expect((await fichaGravada(id))?.form_data?.ficha ?? null, 'a ficha não ficou gravada sozinha').toBeNull()
})

test('o servidor grava tudo ou nada: com uma sessão inválida, nem a ficha, nem a anamnese, nem o plano ficam', async ({ browser }) => {
  const { id, cliente, respostas } = await avaliacaoEmCurso('Direto')
  // A ficha salva antes (o "Salvar ficha"), com o fototipo I.
  const { data: mr } = await db().from('medical_records').select('id').eq('client_id', cliente).single<{ id: string }>()
  expect((await db().from('medical_record_entries').insert({
    medical_record_id: mr!.id, appointment_id: id, professional_id: profissional!.userId,
    form_data: { ficha: { formId: fichaId, name: FICHA, rows: [], answers: { fototipo: 'I' } } },
  })).error).toBeNull()
  const antes = (await db().from('medical_records').select('general_anamnesis').eq('client_id', cliente).single()).data?.general_anamnesis
  await como(browser, async p => {
    const rota = `/${slug}/agenda/${id}`
    const ruim = [{ procedures: [{ procedureId: '00000000-0000-4000-8000-000000000000', price: 100 }] }]
    await chamarAcao(p, 'actions/treatment-plans.ts', 'generateEvaluationPlan', rota,
      [id, DORES, { ...respostas, allergies: `Látex ${marca}` }, ruim, '', '', '', slug, { fototipo: 'II', acido: ACIDO }])
  })
  expect(await plano(id), 'nenhum plano (nem vazio)').toBeNull()
  const entrada = await fichaGravada(id)
  expect(entrada?.form_data?.ficha?.answers, 'a ficha salva antes continua a mesma').toEqual({ fototipo: 'I' })
  expect(entrada?.queixas ?? null, 'as dores não ficaram').toBeNull()
  const depois = (await db().from('medical_records').select('general_anamnesis').eq('client_id', cliente).single()).data?.general_anamnesis
  expect(depois, 'a anamnese ficou como estava').toEqual(antes)
})
