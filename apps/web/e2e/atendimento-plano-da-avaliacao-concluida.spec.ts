import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { apagarAgendamentos } from './apoio/limpeza'
import { chamarAcao } from './apoio/acao-direta'
import { responderAnamnese } from './apoio/anamnese'

/**
 * Revisão do Heitor, 2026-10-29: "é preciso avaliar primeiro pra depois
 * decidir o que fazer". O A30 (495f514e) escondeu o "Fechar agora" e o
 * "Enviar para a recepção" na avaliação concluída — gerar o plano regravaria
 * as dores e a evolução do registro fechado. Agora os botões VOLTAM, e gerar
 * o plano ali não regrava nada: o plano nasce ligado à avaliação, e as dores,
 * a evolução, a ficha e a anamnese daquele dia ficam como estão. A anamnese
 * continua só para ler, e a evolução, não editável.
 */

const marca = Date.now().toString(36)
const db = () => banco()
const DORES = `Manchas na testa ${marca}`
const EVOLUCAO = `Avaliação: melasma epidérmico ${marca}`

let rede: OutraRede | null = null
let profissional: MembroDeTeste | null = null
let slug = ''
let procedimentoDoPlano = ''

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: profissional!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

/** A avaliação concluída de ontem, com o registro dela: as dores, a evolução e a ficha de saúde. */
async function avaliacaoConcluida(rotulo: string): Promise<{ id: string; cliente: string }> {
  const cliente = await rede!.criarCliente(rotulo)
  await responderAnamnese(cliente, rede!.tenantId)
  const ontem = Date.now() - 86_400_000
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: cliente, procedure_id: rede!.procedureId, professional_id: profissional!.userId,
    status: 'COMPLETED', source: 'INTERNAL', duration_min: 30, price: 0,
    scheduled_at: new Date(ontem).toISOString(), started_at: new Date(ontem).toISOString(), completed_at: new Date(ontem + 30 * 60_000).toISOString(),
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  const { data: mr } = await db().from('medical_records').select('id').eq('client_id', cliente).single<{ id: string }>()
  expect((await db().from('medical_record_entries').insert({
    medical_record_id: mr!.id, appointment_id: data!.id, professional_id: profissional!.userId, queixas: DORES, notes: EVOLUCAO,
  })).error).toBeNull()
  return { id: data!.id, cliente }
}

async function registro(id: string, cliente: string) {
  const { data: e } = await db().from('medical_record_entries').select('queixas, notes, intercurrences, form_data').eq('appointment_id', id).single()
  const { data: m } = await db().from('medical_records').select('general_anamnesis').eq('client_id', cliente).single()
  return { ...e, anamnese: m?.general_anamnesis }
}
const plano = async (id: string) => (await db().from('treatment_plans')
  .select('status, evaluation_appointment_id, treatment_plan_sessions(treatment_plan_session_procedures(procedure_id))')
  .eq('evaluation_appointment_id', id).maybeSingle()).data

test.describe.configure({ timeout: 120_000 })

test.beforeAll(async () => {
  test.setTimeout(180_000)
  rede = await criarOutraRede(`pc${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  const { data: proc, error } = await db().from('procedures').insert({
    tenant_id: rede.tenantId, name: `[e2e] Peeling ${marca}`, category: 'e2e', duration_min: 30, price: 250, is_active: true,
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  procedimentoDoPlano = proc!.id
  profissional = await criarMembro(`pcp${marca}`, {
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
    await db().from('procedures').delete().eq('id', procedimentoDoPlano)
  }
  await profissional?.limpar(); await rede?.limpar()
})

test('a avaliação concluída gera o plano pela tela, e o registro daquele dia fica como está', async ({ browser }) => {
  const { id, cliente } = await avaliacaoConcluida('Concluida')
  const antes = await registro(id, cliente)
  await como(browser, async p => {
    await p.goto(`/${slug}/agenda/${id}`)
    await expect(p.getByText('Registro bloqueado para edição')).toBeVisible()
    // O A30 continua: a anamnese se lê e a evolução não se edita.
    await expect(p.locator('[data-anamnese-geral] textarea, [data-anamnese-geral] input'), 'a anamnese só para ler').toHaveCount(0)
    await expect(p.getByPlaceholder('Técnicas utilizadas, regiões tratadas, evolução do cliente…')).toHaveAttribute('readonly', '')

    // E o plano se monta e se envia — os botões voltaram.
    await p.getByRole('button', { name: 'Nova sessão' }).click()
    await p.getByRole('button', { name: 'Adicionar procedimento' }).click()
    await p.locator('select').filter({ hasText: 'Selecionar procedimento…' }).selectOption({ label: `[e2e] Peeling ${marca}` })
    await p.getByRole('button', { name: 'Enviar para a recepção' }).click()
    await expect.poll(async () => (await plano(id))?.status, { timeout: 30_000 }).toBe('PROPOSED')
  })
  const pl = await plano(id)
  expect(pl!.evaluation_appointment_id, 'o plano nasce ligado à avaliação').toBe(id)
  expect(pl!.treatment_plan_sessions[0]!.treatment_plan_session_procedures).toEqual([{ procedure_id: procedimentoDoPlano }])
  expect(await registro(id, cliente), 'as dores, a evolução, a ficha e a anamnese ficaram como estavam').toEqual(antes)
})

test('o servidor não regrava o registro travado, mesmo que a chamada mande outras dores, evolução, anamnese e ficha', async ({ browser }) => {
  const { id, cliente } = await avaliacaoConcluida('Direto')
  const antes = await registro(id, cliente)
  await como(browser, async p => {
    await chamarAcao(p, 'actions/treatment-plans.ts', 'generateEvaluationPlan', `/${slug}/agenda/${id}`, [
      id, `Outra dor ${marca}`, { allergies: `Látex ${marca}` },
      [{ procedures: [{ procedureId: procedimentoDoPlano, price: 250 }] }], '', `Outra evolução ${marca}`, '', slug, { qualquer: 'x' },
    ])
  })
  expect((await plano(id))?.status, 'o plano nasce').toBe('PROPOSED')
  expect(await registro(id, cliente), 'o registro fica').toEqual(antes)
})
