import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { apagarAgendamentos } from './apoio/limpeza'
import { chamarAcao, chamarAcaoComFormulario } from './apoio/acao-direta'
import { responderAnamnese } from './apoio/anamnese'

/**
 * Revisão do Heitor, 2026-10-29: "Tudo que for obrigatório é obrigatório e
 * barra qualquer progressão se não for feito."
 *
 * Até aqui o "Finalizar atendimento" concluía com pergunta obrigatória em
 * branco — na ficha do procedimento e na anamnese (a ficha de saúde) —, pela
 * regra do §10 ("a cliente já foi atendida") e do D2 de 28/10. Agora a
 * obrigatória sem resposta barra o "Finalizar", o "Enviar para a recepção" e
 * o "Fechar agora": a tela aponta o campo (rola até ele) e o SERVIDOR recusa
 * também (`finishSession`, `generateEvaluationPlan`).
 *
 * A anamnese que a cliente já respondeu (app ou link) vale: a obrigatória só
 * falta quando não tem resposta em lugar nenhum.
 */

const marca = Date.now().toString(36)
const db = () => banco()
const FICHA = `Ficha de peeling ${marca}`

let rede: OutraRede | null = null
let profissional: MembroDeTeste | null = null
let slug = ''
let fichaId = ''

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: profissional!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

async function atendimentoEmCurso(rotulo: string): Promise<{ id: string; cliente: string }> {
  const cliente = await rede!.criarCliente(rotulo)
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: cliente, procedure_id: rede!.procedureId, professional_id: profissional!.userId,
    status: 'IN_PROGRESS', source: 'INTERNAL', duration_min: 30, price: 0,
    scheduled_at: new Date(Date.now() - 30 * 60_000).toISOString(), started_at: new Date(Date.now() - 20 * 60_000).toISOString(),
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  return { id: data!.id, cliente }
}

const status = async (id: string) => (await db().from('appointments').select('status').eq('id', id).single()).data?.status
const campo = (p: Page, onde: string, id: string) => p.locator(`${onde} [data-campo="${id}"]`)
const ANAMNESE = '[data-anamnese-geral]'
const FICHA_DO_PROCEDIMENTO = '[data-ficha-do-procedimento]'

test.beforeAll(async () => {
  test.setTimeout(180_000)
  rede = await criarOutraRede(`ob${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  const { data: ficha, error } = await db().from('forms').insert({
    tenant_id: rede.tenantId, name: FICHA, is_active: true, tipo: 'PROCEDIMENTO',
    schema: { rows: [
      { id: 'r1', fields: [
        { id: 'fototipo', type: 'select', label: 'Fototipo', required: true, options: ['I', 'II', 'III', 'IV', 'V', 'VI'] },
        { id: 'acido', type: 'text', label: 'Ácido utilizado' },
      ] },
    ] },
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  fichaId = ficha!.id
  expect((await db().from('procedures').update({ form_id: fichaId, price: 0 }).eq('id', rede.procedureId)).error).toBeNull()
  profissional = await criarMembro(`obp${marca}`, {
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
    // O plano nasce com o membro como profissional: sai antes dele.
    await db().from('treatment_plans').delete().eq('branch_id', rede.branchId)
    const { data: ags } = await db().from('appointments').select('id').eq('branch_id', rede.branchId)
    expect(await apagarAgendamentos((ags ?? []).map(a => a.id as string)), 'a limpeza tem de apagar tudo').toEqual([])
    await db().from('procedures').update({ form_id: null }).eq('id', rede.procedureId)
    await db().from('forms').delete().eq('id', fichaId)
  }
  await profissional?.limpar(); await rede?.limpar()
})

test('"Finalizar" não conclui com obrigatória em branco: a tela aponta a anamnese, depois a ficha, e só então conclui', async ({ browser }) => {
  const { id } = await atendimentoEmCurso('Sophie')
  await como(browser, async p => {
    await p.goto(`/${slug}/agenda/${id}`)
    await expect(p.getByText(FICHA).first()).toBeVisible()

    // 1. A anamnese vazia: a primeira obrigatória dela é apontada.
    await p.getByRole('button', { name: 'Finalizar atendimento' }).click()
    const gestacao = campo(p, ANAMNESE, 'isPregnantOrBreastfeeding')
    await expect(gestacao, 'a tela aponta a obrigatória da anamnese').toHaveAttribute('data-invalido', 'true')
    await expect(gestacao).toBeInViewport()
    await expect(p.getByRole('button', { name: 'Confirmar conclusão' }), 'a janela de concluir não abre').toHaveCount(0)

    await gestacao.getByLabel('Não se aplica').check()
    for (const c of ['allergies', 'medications', 'healthConditions']) await campo(p, ANAMNESE, c).locator('textarea').fill(`Nega ${marca}`)

    // 2. A ficha do procedimento: o fototipo em branco é apontado.
    await p.getByRole('button', { name: 'Finalizar atendimento' }).click()
    const fototipo = campo(p, FICHA_DO_PROCEDIMENTO, 'fototipo')
    await expect(fototipo, 'a tela aponta a obrigatória da ficha').toHaveAttribute('data-invalido', 'true')
    await expect(fototipo).toBeInViewport()
    await expect(p.getByRole('button', { name: 'Confirmar conclusão' })).toHaveCount(0)
    expect(await status(id), 'nada foi concluído').toBe('IN_PROGRESS')

    // 3. Tudo respondido: conclui.
    await fototipo.locator('select').selectOption('III')
    await p.getByRole('button', { name: 'Finalizar atendimento' }).click()
    await p.getByRole('button', { name: 'Confirmar conclusão' }).click()
    await expect.poll(() => status(id)).toBe('COMPLETED')
  })
  const { data } = await db().from('medical_record_entries').select('form_data').eq('appointment_id', id).single()
  expect((data?.form_data as { ficha?: { answers?: unknown } } | null)?.ficha?.answers).toMatchObject({ fototipo: 'III' })
})

test('o servidor recusa o "Finalizar" sem a obrigatória — a trava não é só da tela', async ({ browser }) => {
  const { id, cliente } = await atendimentoEmCurso('Direto')
  await como(browser, async p => {
    const rota = `/${slug}/agenda/${id}`
    const campos = { appointment_id: id, slug, products_used: '[]', notes: '', intercurrences: '' }

    // Sem anamnese nem ficha: recusa.
    const r1 = await chamarAcaoComFormulario(p, 'actions/appointments.ts', 'finishSession', rota, [null], campos)
    // A recusa diz o que falta. (O texto da resposta traz também a página, com
    // os rótulos da ficha: por isso a frase inteira da recusa.)
    expect(r1.texto, 'a recusa diz o que falta').toContain('na anamnese.')
    expect(await status(id)).toBe('IN_PROGRESS')

    // A anamnese respondida pela cliente, a ficha ainda não: recusa pela ficha.
    await responderAnamnese(cliente, rede!.tenantId)
    const r2 = await chamarAcaoComFormulario(p, 'actions/appointments.ts', 'finishSession', rota, [null], campos)
    expect(r2.texto).toContain('na ficha do procedimento.')
    expect(await status(id)).toBe('IN_PROGRESS')

    // Controle: com a ficha respondida, conclui.
    await chamarAcaoComFormulario(p, 'actions/appointments.ts', 'finishSession', rota, [null],
      { ...campos, ficha: JSON.stringify({ fototipo: 'II' }) })
    await expect.poll(() => status(id)).toBe('COMPLETED')
  })
})

test('a anamnese que a cliente respondeu pelo app vale: só a ficha do procedimento falta', async ({ browser }) => {
  const { id, cliente } = await atendimentoEmCurso('PeloApp')
  await responderAnamnese(cliente, rede!.tenantId)
  await como(browser, async p => {
    await p.goto(`/${slug}/agenda/${id}`)
    await p.getByRole('button', { name: 'Finalizar atendimento' }).click()
    await expect(campo(p, FICHA_DO_PROCEDIMENTO, 'fototipo')).toHaveAttribute('data-invalido', 'true')
    await expect(campo(p, ANAMNESE, 'isPregnantOrBreastfeeding'), 'a anamnese respondida não é apontada')
      .not.toHaveAttribute('data-invalido', 'true')
    await campo(p, FICHA_DO_PROCEDIMENTO, 'fototipo').locator('select').selectOption('IV')
    await p.getByRole('button', { name: 'Finalizar atendimento' }).click()
    await p.getByRole('button', { name: 'Confirmar conclusão' }).click()
    await expect.poll(() => status(id)).toBe('COMPLETED')
  })
  const { data } = await db().from('medical_records').select('general_anamnesis').eq('client_id', cliente).single()
  expect(data?.general_anamnesis, 'a ficha da cliente continua dela').toMatchObject({ origem: 'CLIENTE_APP' })
})

test('"Enviar para a recepção" também barra no servidor: sem a ficha obrigatória, nenhum plano nasce', async ({ browser }) => {
  const { id, cliente } = await atendimentoEmCurso('Plano')
  const respostas = await responderAnamnese(cliente, rede!.tenantId)
  await como(browser, async p => {
    const rota = `/${slug}/agenda/${id}`
    const sessoes = [{ procedures: [{ procedureId: rede!.procedureId, price: 100 }] }]
    const r = await chamarAcao(p, 'actions/treatment-plans.ts', 'generateEvaluationPlan', rota,
      [id, `Manchas ${marca}`, respostas, sessoes, '', '', '', slug])
    expect(r.texto).toContain('na ficha do procedimento.')
    const { data: plano } = await db().from('treatment_plans').select('id').eq('evaluation_appointment_id', id).maybeSingle()
    expect(plano, 'o plano não nasce sem a obrigatória').toBeNull()
  })
})
