import { createHash, randomBytes } from 'node:crypto'
import { test, expect, type Browser, type Page, type Locator } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { criarMembro, clienteComSessao, type MembroDeTeste, type ClienteDeTeste } from './apoio/sessao'
import { chamarAcao } from './apoio/acao-direta'
import { apagarClientes } from './apoio/limpeza'

/**
 * O pré-atendimento (2026-10-20, decisões do Heitor): UMA ficha por rede, com
 * as perguntas sobre a PESSOA (alergias, medicamentos, gestação…), editável,
 * com o envio ligado ou não pela rede, mandada ao AGENDAR — por qualquer
 * caminho —, com validade (padrão 6 meses: dentro dela, só "algo mudou?").
 * Substitui a anamnese geral de campos fixos, cujas respostas viram respostas
 * da ficha nova.
 *
 * Etapa 1, o banco: a ficha que a rede ganha ao nascer, o pendente que o
 * agendamento cria e a conversão da anamnese antiga.
 */

const marca = Date.now().toString(36)
const db = () => banco()

let A: OutraRede

async function agendar(clienteId: string): Promise<string> {
  const { data, error } = await db().from('appointments').insert({
    branch_id: A.branchId, client_id: clienteId, procedure_id: A.procedureId,
    professional_id: A.professionalId, status: 'SCHEDULED', source: 'INTERNAL',
    scheduled_at: new Date(Date.now() + 3 * 24 * 3600_000).toISOString(), duration_min: 30, price: 0,
  }).select('id').single<{ id: string }>()
  expect(error, 'agendar').toBeNull()
  return data!.id
}

const pendentes = async (clienteId: string) => (await db().from('pre_atendimentos')
  .select('id, status, modo, appointment_id, ficha').eq('client_id', clienteId).eq('status', 'PENDENTE')).data ?? []

/**
 * As obrigatórias da ficha padrão além da alergia (D2 da simulação de
 * 2026-10-28): gestação, medicamentos e condições de saúde.
 */
async function preencherObrigatorias(escopo: Page | Locator) {
  await escopo.locator('[data-campo="isPregnantOrBreastfeeding"]').getByLabel('Não', { exact: true }).check()
  await escopo.locator('[data-campo="medications"] textarea').fill('Nenhum')
  await escopo.locator('[data-campo="healthConditions"] textarea').fill('Nenhuma')
}

const ligarEnvio = (ligado: boolean) => db().from('tenants').update({ pre_atendimento_envio: ligado }).eq('id', A.tenantId)

test.describe('o pré-atendimento: a ficha da rede e o pendente do agendamento', () => {
  test.beforeAll(async () => { A = await criarOutraRede(`pa${marca}`) })
  test.afterAll(async () => { await A?.limpar() })

  test('a rede nasce com a ficha de pré-atendimento — as perguntas da anamnese de hoje — e o envio desligado', async () => {
    const { data: fichas } = await db().from('forms').select('id, tipo, schema, is_active').eq('tenant_id', A.tenantId).eq('tipo', 'PRE_ATENDIMENTO')
    expect(fichas, 'uma ficha de pré-atendimento por rede').toHaveLength(1)
    expect(fichas![0]!.is_active).toBe(true)
    const ids = (fichas![0]!.schema as { rows: { fields: { id: string }[] }[] }).rows.flatMap(r => r.fields.map(f => f.id))
    for (const id of ['skinType', 'allergies', 'medications', 'healthConditions', 'previousProcedures', 'isPregnantOrBreastfeeding', 'useSunscreen', 'observations']) {
      expect(ids, `a pergunta ${id}`).toContain(id)
    }
    const { data: rede } = await db().from('tenants').select('pre_atendimento_envio, pre_atendimento_validade_meses').eq('id', A.tenantId).single()
    expect(rede).toEqual({ pre_atendimento_envio: false, pre_atendimento_validade_meses: 6 })
  })

  test('a ficha de pré-atendimento não serve de ficha de procedimento', async () => {
    const { data: ficha } = await db().from('forms').select('id').eq('tenant_id', A.tenantId).eq('tipo', 'PRE_ATENDIMENTO').single<{ id: string }>()
    const { error } = await db().from('procedures').update({ form_id: ficha!.id }).eq('id', A.procedureId)
    expect(error, 'o banco recusa').not.toBeNull()
  })

  test('as ações das fichas de procedimento não editam nem apagam a de pré-atendimento', async ({ browser }) => {
    const gestor = await criarMembro(`pag${marca}`, { tenant: A.tenantId, permissoes: [{ modulo: 'forms', nivel: 'MANAGE' }] })
    const ctx = await browser.newContext({ storageState: gestor.estado })
    const page = await ctx.newPage()
    try {
      const { data: ficha } = await db().from('forms').select('id').eq('tenant_id', A.tenantId).eq('tipo', 'PRE_ATENDIMENTO').single<{ id: string }>()
      await chamarAcao(page, 'actions/fichas.ts', 'definirFichaAtiva', '/admin/settings?tab=fichas', [ficha!.id, false])
      await chamarAcao(page, 'actions/fichas.ts', 'apagarFicha', '/admin/settings?tab=fichas', [ficha!.id])
      const { data: depois } = await db().from('forms').select('id, is_active').eq('id', ficha!.id).maybeSingle()
      expect(depois, 'continua lá, e ativa').toEqual({ id: ficha!.id, is_active: true })
    } finally {
      await ctx.close()
      await gestor.limpar()
    }
  })

  test('com o envio desligado, agendar não manda nada', async () => {
    await ligarEnvio(false)
    const cliente = await A.criarCliente('Sem envio')
    await agendar(cliente)
    expect(await pendentes(cliente)).toEqual([])
  })

  test('com o envio ligado, agendar deixa o pré-atendimento pendente — um só, com a ficha do momento', async () => {
    await ligarEnvio(true)
    const cliente = await A.criarCliente('Com envio')
    const primeiro = await agendar(cliente)
    const lista = await pendentes(cliente)
    expect(lista).toHaveLength(1)
    expect(lista[0]).toMatchObject({ modo: 'COMPLETO', appointment_id: primeiro })
    const rows = (lista[0]!.ficha as { rows: unknown[] }).rows
    expect(rows.length, 'o retrato das perguntas').toBeGreaterThan(0)

    await agendar(cliente)
    expect(await pendentes(cliente), 'o segundo agendamento não duplica').toHaveLength(1)
  })

  test('dentro da validade, pede só a confirmação; vencida, a ficha inteira', async () => {
    await ligarEnvio(true)
    const ha = (meses: number) => new Date(Date.now() - meses * 30 * 24 * 3600_000).toISOString()
    const recente = await A.criarCliente('Respondeu há 2 meses')
    const antiga = await A.criarCliente('Respondeu há 8 meses')
    for (const [cliente, quando] of [[recente, ha(2)], [antiga, ha(8)]] as const) {
      const { error } = await db().from('medical_records').upsert({
        client_id: cliente,
        general_anamnesis: { versao: 2, respostas: { allergies: 'nenhuma' }, respondidoEm: quando, origem: 'EQUIPE' },
      }, { onConflict: 'client_id' })
      expect(error).toBeNull()
    }
    await agendar(recente)
    await agendar(antiga)
    expect((await pendentes(recente))[0]?.modo, 'dentro dos 6 meses').toBe('CONFIRMAR')
    expect((await pendentes(antiga))[0]?.modo, 'passou dos 6 meses').toBe('COMPLETO')
  })

  test('respondida há menos de 30 dias, o agendamento novo não pede de novo (2026-10-21)', async () => {
    await ligarEnvio(true)
    const ha = (dias: number) => new Date(Date.now() - dias * 24 * 3600_000).toISOString()
    // Pela anamnese (a equipe salvou) e pelo pré-atendimento respondido (a cliente confirmou).
    const pelaAnamnese = await A.criarCliente('Respondeu há 10 dias')
    expect((await db().from('medical_records').upsert({
      client_id: pelaAnamnese,
      general_anamnesis: { versao: 2, respostas: { allergies: 'nenhuma' }, respondidoEm: ha(10), origem: 'EQUIPE' },
    }, { onConflict: 'client_id' })).error).toBeNull()
    const pelaFicha = await A.criarCliente('Confirmou há 5 dias')
    expect((await db().from('medical_records').upsert({
      client_id: pelaFicha,
      general_anamnesis: { versao: 2, respostas: { allergies: 'nenhuma' }, respondidoEm: ha(90), origem: 'EQUIPE' },
    }, { onConflict: 'client_id' })).error).toBeNull()
    expect((await db().from('pre_atendimentos').insert({
      tenant_id: A.tenantId, client_id: pelaFicha, status: 'RESPONDIDO', modo: 'CONFIRMAR', origem: 'CLIENTE_APP',
      ficha: { formId: null, nome: 'Pré-atendimento', rows: [] }, respostas: { allergies: 'nenhuma' }, respondido_em: ha(5),
    })).error).toBeNull()
    await agendar(pelaAnamnese)
    await agendar(pelaFicha)
    expect(await pendentes(pelaAnamnese), 'a anamnese de 10 dias vale').toEqual([])
    expect(await pendentes(pelaFicha), 'a confirmação de 5 dias vale').toEqual([])
  })

  test('a anamnese antiga (campos fixos) vira resposta da ficha nova, sem perder nada', async () => {
    const { data, error } = await db().rpc('anamnese_do_legado', {
      p_legado: {
        skinType: 'oleosa', allergies: 'dipirona', medications: '', healthConditions: 'hipertensão',
        previousProcedures: 'peeling', isPregnantOrBreastfeeding: true, useSunscreen: false,
        observations: 'prefere à tarde', updatedAt: '2026-09-01T12:00:00.000Z', updatedBy: null,
      },
      p_tenant: A.tenantId,
    })
    expect(error).toBeNull()
    expect(data).toMatchObject({
      versao: 2, origem: 'LEGADO', respondidoEm: '2026-09-01T12:00:00.000Z',
      respostas: {
        skinType: 'Oleosa', allergies: 'dipirona', healthConditions: 'hipertensão', previousProcedures: 'peeling',
        isPregnantOrBreastfeeding: 'Sim', useSunscreen: 'Não', observations: 'prefere à tarde',
      },
    })
    expect((data as { ficha: { rows: unknown[] } }).ficha.rows.length).toBeGreaterThan(0)
  })
})

/**
 * Etapa 2, a equipe: a rede edita a ficha (pela action e pela tela de
 * Configurações → Fichas), liga o envio, e a anamnese do atendimento passa a
 * ser a ficha universal — com a resposta antiga convertida na hora.
 */
test.describe('o pré-atendimento: a equipe edita a ficha e a anamnese', () => {
  let B: OutraRede
  let gestor: MembroDeTeste
  let daUnidade: MembroDeTeste
  let clinica: MembroDeTeste

  test.beforeAll(async () => {
    B = await criarOutraRede(`pb${marca}`)
    const fichas = [{ modulo: 'forms' as const, nivel: 'MANAGE' as const }]
    gestor = await criarMembro(`pbg${marca}`, { tenant: B.tenantId, permissoes: fichas })
    daUnidade = await criarMembro(`pbu${marca}`, { tenant: B.tenantId, branchId: B.branchId, permissoes: fichas })
    clinica = await criarMembro(`pbc${marca}`, {
      tenant: B.tenantId,
      permissoes: [{ modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'medical_records', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'VIEW' }],
    })
  })
  test.afterAll(async () => {
    await clinica?.limpar(); await daUnidade?.limpar(); await gestor?.limpar()
    await B?.limpar()
  })

  const fichaDaRede = async () => (await db().from('forms').select('id, schema').eq('tenant_id', B.tenantId).eq('tipo', 'PRE_ATENDIMENTO').single<{ id: string; schema: { rows: { fields: { id: string }[] }[] } }>()).data!
  // As outras obrigatórias da ficha padrão (gestação, medicamentos, condições):
  // desde a revisão do Heitor de 2026-10-29, a obrigatória sem resposta barra o
  // "Enviar para a recepção" — a avaliação daqui manda a ficha inteira.
  const OUTRAS_OBRIGATORIAS = { isPregnantOrBreastfeeding: 'Não', medications: 'Nenhum', healthConditions: 'Nenhuma' }
  const idsDaFicha = async () => (await fichaDaRede()).schema.rows.flatMap(r => r.fields.map(f => f.id))
  const comCampo = async (campo: Record<string, unknown>) => {
    const atual = await fichaDaRede()
    return { name: 'Pré-atendimento', schema: { rows: [...atual.schema.rows, { id: 'nova', fields: [campo] }] } }
  }

  test('a rede edita as perguntas — sem foto nem planejador, e só quem é da rede', async ({ browser }) => {
    const comoGestor = await browser.newContext({ storageState: gestor.estado })
    const comoUnidade = await browser.newContext({ storageState: daUnidade.estado })
    try {
      const p = await comoGestor.newPage()
      await chamarAcao(p, 'actions/pre-atendimento.ts', 'salvarFichaDePreAtendimento', '/admin/settings?tab=fichas',
        [await comCampo({ id: 'marcapasso', type: 'radio', label: 'Usa marcapasso?', options: ['Sim', 'Não'] })])
      expect(await idsDaFicha(), 'a pergunta nova entra').toContain('marcapasso')

      await chamarAcao(p, 'actions/pre-atendimento.ts', 'salvarFichaDePreAtendimento', '/admin/settings?tab=fichas',
        [await comCampo({ id: 'foto-da-pele', type: 'photo', label: 'Foto da pele' })])
      expect(await idsDaFicha(), 'foto a cliente não responde: recusada').not.toContain('foto-da-pele')

      const u = await comoUnidade.newPage()
      await chamarAcao(u, 'actions/pre-atendimento.ts', 'salvarFichaDePreAtendimento', `/e2e-un-pb${marca}/settings?tab=fichas`,
        [await comCampo({ id: 'so-da-unidade', type: 'text', label: 'Da unidade' })])
      expect(await idsDaFicha(), 'quem tem unidade fixa não muda a ficha da rede').not.toContain('so-da-unidade')
    } finally {
      await comoGestor.close(); await comoUnidade.close()
    }
  })

  test('em Configurações → Fichas, a rede liga o envio e escolhe a validade', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: gestor.estado })
    const page = await ctx.newPage()
    try {
      await page.goto('/admin/settings?tab=fichas')
      const secao = page.locator('[data-pre-atendimento]')
      await expect(secao.getByRole('heading', { name: 'Ficha de pré-atendimento' })).toBeVisible()
      await secao.getByLabel('Mandar a ficha quando a cliente for agendada').check()
      await secao.getByLabel('Validade das respostas (meses)').fill('3')
      await secao.getByRole('button', { name: 'Salvar o envio' }).click()
      await expect.poll(async () => (await db().from('tenants').select('pre_atendimento_envio, pre_atendimento_validade_meses').eq('id', B.tenantId).single()).data)
        .toEqual({ pre_atendimento_envio: true, pre_atendimento_validade_meses: 3 })
    } finally {
      await ctx.close()
    }
  })

  test('no atendimento, a anamnese é a ficha universal: a resposta antiga aparece, e salvar fecha o pendente', async ({ browser }) => {
    await db().from('tenants').update({ pre_atendimento_envio: true }).eq('id', B.tenantId)
    const cliente = await B.criarCliente('Anamnese antiga')
    await db().from('medical_records').upsert({
      client_id: cliente,
      general_anamnesis: { skinType: 'oleosa', allergies: `dipirona ${marca}`, isPregnantOrBreastfeeding: false, useSunscreen: true, updatedAt: '2025-01-10T12:00:00.000Z' },
    }, { onConflict: 'client_id' })
    // Com ficha de procedimento, a sessão abre o atendimento (sem ela, abre a avaliação).
    const { data: fp } = await db().from('forms').insert({ tenant_id: B.tenantId, name: `[e2e] Ficha ${marca}`, schema: { rows: [{ id: 'r', fields: [{ id: 'regiao', type: 'text', label: 'Região' }] }] }, is_active: true }).select('id').single<{ id: string }>()
    await db().from('procedures').update({ form_id: fp!.id }).eq('id', B.procedureId)
    const { data: ap } = await db().from('appointments').insert({
      branch_id: B.branchId, client_id: cliente, procedure_id: B.procedureId, professional_id: B.professionalId,
      status: 'SCHEDULED', source: 'INTERNAL', scheduled_at: new Date(Date.now() + 2 * 24 * 3600_000).toISOString(), duration_min: 30, price: 0,
    }).select('id').single<{ id: string }>()
    // A ficha aparece no atendimento quando a avaliação já gerou o plano (como em prontuario.spec).
    await db().from('treatment_plans').insert({
      branch_id: B.branchId, professional_id: B.professionalId, client_id: cliente,
      evaluation_appointment_id: ap!.id, status: 'ACCEPTED', name: `[e2e] Plano ${marca}`,
    })
    expect((await db().from('pre_atendimentos').select('status').eq('client_id', cliente)).data, 'a anamnese de 2025 venceu: pendente').toEqual([{ status: 'PENDENTE' }])

    const ctx = await browser.newContext({ storageState: clinica.estado })
    const page = await ctx.newPage()
    try {
      await page.goto(`/admin/agenda/${ap!.id}`)
      const cartao = page.locator('[data-anamnese-geral]').first()
      await expect(cartao.getByText(`dipirona ${marca}`)).toBeVisible()
      await expect(page.getByText(/Pele Oleosa/)).toBeVisible()

      await cartao.getByRole('button', { name: 'Editar anamnese' }).click()
      await cartao.locator('[data-campo="allergies"] textarea').fill(`látex ${marca}`)
      await preencherObrigatorias(cartao)
      await cartao.getByRole('button', { name: 'Salvar anamnese' }).click()
      await expect.poll(async () => {
        const { data } = await db().from('medical_records').select('general_anamnesis').eq('client_id', cliente).single()
        const g = data?.general_anamnesis as { versao?: number; origem?: string; respostas?: Record<string, string> }
        return { versao: g?.versao, origem: g?.origem, alergias: g?.respostas?.allergies, pele: g?.respostas?.skinType }
      }).toEqual({ versao: 2, origem: 'EQUIPE', alergias: `látex ${marca}`, pele: 'Oleosa' })
      expect((await db().from('pre_atendimentos').select('status, origem').eq('client_id', cliente)).data,
        'a equipe respondeu: o pendente fecha').toEqual([{ status: 'RESPONDIDO', origem: 'EQUIPE' }])
    } finally {
      await ctx.close()
    }
  })

  test('na avaliação, a anamnese vai junto com o plano — no formato da ficha', async ({ browser }) => {
    const cliente = await B.criarCliente('Avaliação')
    const { data: ap } = await db().from('appointments').insert({
      branch_id: B.branchId, client_id: cliente, procedure_id: B.procedureId, professional_id: B.professionalId,
      status: 'IN_PROGRESS', source: 'INTERNAL', scheduled_at: new Date().toISOString(), started_at: new Date().toISOString(), duration_min: 30, price: 0,
    }).select('id').single<{ id: string }>()
    const ctx = await browser.newContext({ storageState: clinica.estado })
    const page = await ctx.newPage()
    try {
      await chamarAcao(page, 'actions/treatment-plans.ts', 'generateEvaluationPlan', `/admin/agenda/${ap!.id}`, [
        ap!.id, 'Quer tratar manchas', { allergies: `pólen ${marca}`, ...OUTRAS_OBRIGATORIAS, campoQueNaoExiste: 'x' },
        [{ procedures: [{ procedureId: B.procedureId, price: 100 }] }], '', '', '', `e2e-un-pb${marca}`,
      ])
      const { data } = await db().from('medical_records').select('general_anamnesis').eq('client_id', cliente).single()
      const g = data?.general_anamnesis as { versao?: number; respostas?: Record<string, string> }
      expect(g?.versao).toBe(2)
      expect(g?.respostas, 'só as perguntas da ficha').toEqual({ allergies: `pólen ${marca}`, ...OUTRAS_OBRIGATORIAS })
    } finally {
      await ctx.close()
      // O plano nasce com o membro como profissional: sai antes dele (afterAll).
      await apagarClientes([cliente])
    }
  })

  test('mandar a avaliação SEM mudar a ficha não troca quem respondeu (2026-10-20)', async ({ browser }) => {
    // Simulação de um dia de clínica: a Joana respondeu pelo link; depois do
    // "Enviar para a recepção", a ficha dela passou a dizer "pela equipe" — a
    // avaliação regravava as mesmas respostas com a origem da equipe.
    const cliente = await B.criarCliente('Avaliação link')
    const respondidoEm = '2026-10-19T15:00:00.000Z'
    const { error: eR } = await db().from('medical_records').upsert({ client_id: cliente, general_anamnesis: {
      versao: 2, ficha: { formId: null, nome: 'Pré-atendimento', rows: (await fichaDaRede()).schema.rows },
      respostas: { allergies: `dipirona ${marca}`, ...OUTRAS_OBRIGATORIAS }, respondidoEm, origem: 'CLIENTE_LINK', respondidoPor: null,
    } }, { onConflict: 'client_id' })
    expect(eR).toBeNull()
    const { data: ap } = await db().from('appointments').insert({
      branch_id: B.branchId, client_id: cliente, procedure_id: B.procedureId, professional_id: B.professionalId,
      status: 'IN_PROGRESS', source: 'INTERNAL', scheduled_at: new Date().toISOString(), started_at: new Date().toISOString(), duration_min: 30, price: 0,
    }).select('id').single<{ id: string }>()
    const ctx = await browser.newContext({ storageState: clinica.estado })
    const page = await ctx.newPage()
    try {
      await chamarAcao(page, 'actions/treatment-plans.ts', 'generateEvaluationPlan', `/admin/agenda/${ap!.id}`, [
        ap!.id, 'Quer tratar manchas', { allergies: `dipirona ${marca}`, ...OUTRAS_OBRIGATORIAS },
        [{ procedures: [{ procedureId: B.procedureId, price: 100 }] }], '', '', '', `e2e-un-pb${marca}`,
      ])
      const { data: plano } = await db().from('treatment_plans').select('id').eq('evaluation_appointment_id', ap!.id).maybeSingle()
      expect(plano, 'a avaliação foi enviada').toBeTruthy()
      const { data } = await db().from('medical_records').select('general_anamnesis').eq('client_id', cliente).single()
      const g = data?.general_anamnesis as { origem?: string; respondidoEm?: string }
      expect(g?.origem, 'continua pelo link').toBe('CLIENTE_LINK')
      expect(g?.respondidoEm).toBe(respondidoEm)
    } finally {
      await ctx.close()
      await apagarClientes([cliente])
    }
  })
})

/**
 * Etapa 3, a cliente: o pré-atendimento aparece no app dela ao ser agendada;
 * ela responde a ficha (ou, dentro da validade, só confirma que nada mudou),
 * e a resposta vira a anamnese — com o selo "pela cliente, no app".
 */
test.describe('o pré-atendimento: a cliente responde no app', () => {
  let C: OutraRede
  let cliente: ClienteDeTeste
  const portal = () => `/e2e-un-pc${marca}/cliente`

  test.beforeAll(async () => {
    C = await criarOutraRede(`pc${marca}`)
    await db().from('tenants').update({ pre_atendimento_envio: true }).eq('id', C.tenantId)
    cliente = await clienteComSessao(`pcc${marca}`, { id: C.branchId, slug: `e2e-un-pc${marca}` }, { tenant: C.tenantId })
  })
  test.afterAll(async () => { await cliente?.limpar(); await C?.limpar() })

  const agendarC = async () => {
    const { error } = await db().from('appointments').insert({
      branch_id: C.branchId, client_id: cliente.clientId, procedure_id: C.procedureId, professional_id: C.professionalId,
      status: 'SCHEDULED', source: 'INTERNAL', scheduled_at: new Date(Date.now() + 4 * 24 * 3600_000).toISOString(), duration_min: 30, price: 0,
    })
    expect(error).toBeNull()
  }
  const anamnese = async () => (await db().from('medical_records').select('general_anamnesis').eq('client_id', cliente.clientId).maybeSingle()).data?.general_anamnesis as
    { origem?: string; respondidoEm?: string; respostas?: Record<string, string> } | null

  test('ela vê o pré-atendimento na tela inicial, responde, e ele fecha', async ({ browser }) => {
    await agendarC()
    const ctx = await browser.newContext({ storageState: cliente.estado })
    const page = await ctx.newPage()
    try {
      await page.goto(`${portal()}/home`)
      await page.getByTestId('pre-atendimento-pendente').click()
      await expect(page).toHaveURL(new RegExp(`${portal()}/pre-atendimento`))
      await page.locator('[data-campo="allergies"] textarea').fill(`pólen ${marca}`)
      await preencherObrigatorias(page)
      await page.getByRole('button', { name: 'Enviar respostas' }).click()
      await expect(page.getByText('Respostas enviadas')).toBeVisible()
      expect((await db().from('pre_atendimentos').select('status, origem').eq('client_id', cliente.clientId)).data)
        .toEqual([{ status: 'RESPONDIDO', origem: 'CLIENTE_APP' }])
      expect(await anamnese()).toMatchObject({ origem: 'CLIENTE_APP', respostas: { allergies: `pólen ${marca}` } })
      // A profissional do agendamento é avisada, com a alergia (2026-10-21, decisão do Heitor).
      await expect.poll(async () => (await db().from('user_notifications').select('title, body')
        .eq('user_id', C.professionalId).eq('type', 'pre_atendimento_respondido')).data ?? [], { message: 'o aviso à profissional' })
        .toEqual([expect.objectContaining({ title: 'Ficha de saúde respondida', body: expect.stringContaining(`pólen ${marca}`) })])
      await page.getByRole('link', { name: 'Voltar ao início' }).click()
      await expect(page).toHaveURL(new RegExp(`${portal()}/home`))
      await expect(page.getByText(/^Olá, /), 'a tela inicial carregou').toBeVisible()
      await expect(page.getByTestId('pre-atendimento-pendente'), 'respondida, o cartão sai').toHaveCount(0)
    } finally {
      await ctx.close()
    }
  })

  test('dentro da validade, ela só confirma que nada mudou', async ({ browser }) => {
    // Respondida há 40 dias: fora da janela de 30 (em que nem se pede), dentro da validade.
    const antes = new Date(Date.now() - 40 * 86_400_000).toISOString()
    expect((await db().from('medical_records').update({ general_anamnesis: { ...(await anamnese()), respondidoEm: antes } })
      .eq('client_id', cliente.clientId)).error).toBeNull()
    expect((await db().from('pre_atendimentos').update({ respondido_em: antes }).eq('client_id', cliente.clientId).eq('status', 'RESPONDIDO')).error).toBeNull()
    await agendarC()
    expect((await db().from('pre_atendimentos').select('modo').eq('client_id', cliente.clientId).eq('status', 'PENDENTE')).data).toEqual([{ modo: 'CONFIRMAR' }])
    const ctx = await browser.newContext({ storageState: cliente.estado })
    const page = await ctx.newPage()
    try {
      await page.goto(`${portal()}/pre-atendimento`)
      await expect(page.getByText(`pólen ${marca}`)).toBeVisible()
      await page.getByRole('button', { name: 'Nada mudou' }).click()
      await expect(page.getByText('Respostas enviadas')).toBeVisible()
      expect((await db().from('pre_atendimentos').select('status').eq('client_id', cliente.clientId).eq('status', 'PENDENTE')).data).toEqual([])
      const depois = await anamnese()
      expect(depois?.respostas?.allergies, 'as respostas ficam').toBe(`pólen ${marca}`)
      expect(Date.parse(depois!.respondidoEm!), 'a data da resposta anda').toBeGreaterThan(Date.parse(antes!))
    } finally {
      await ctx.close()
    }
  })

  test('sem pré-atendimento pendente, responder não grava nada', async ({ browser }) => {
    const antes = await anamnese()
    const ctx = await browser.newContext({ storageState: cliente.estado })
    const page = await ctx.newPage()
    try {
      await chamarAcao(page, 'actions/pre-atendimento-cliente.ts', 'responderPreAtendimento', `${portal()}/pre-atendimento`, [{ respostas: { allergies: 'outra coisa' } }])
      expect(await anamnese(), 'nada muda').toEqual(antes)
    } finally {
      await ctx.close()
    }
  })
})

/**
 * Etapa 4, o link: para quem não usa o app, a equipe manda a ficha por um
 * link (WhatsApp). Como o link de assinatura: SEM sessão, só o hash do token
 * no banco, a pessoa confirma o CPF (ou o nascimento) antes de ver qualquer
 * pergunta — o banco confere e conta as tentativas (5 erradas derrubam o
 * link) —, e responder confere tudo de novo. Respondida a ficha, o link
 * não abre mais.
 */
test.describe('o pré-atendimento: o link para quem não tem o app', () => {
  let D: OutraRede
  let recepcao: MembroDeTeste
  let soVe: MembroDeTeste
  const CPF = '52998224725'
  /** Um CPF válido novo: o cadastro não aceita o mesmo CPF duas vezes na rede. */
  const novoCpf = () => {
    const d = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10))
    for (const n of [9, 10]) d.push(((d.reduce((s, x, i) => s + x * (n + 1 - i), 0) * 10) % 11) % 10)
    return d.join('')
  }
  const sha = (t: string) => createHash('sha256').update(t, 'utf8').digest('hex')
  const ip = (n: number) => ({ 'x-real-ip': `198.51.100.${(150 + n + Math.floor(Math.random() * 90)) % 255}` })

  test.beforeAll(async () => {
    D = await criarOutraRede(`pd${marca}`)
    await db().from('tenants').update({ pre_atendimento_envio: true }).eq('id', D.tenantId)
    recepcao = await criarMembro(`pdr${marca}`, { tenant: D.tenantId, permissoes: [{ modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'VIEW' }] })
    soVe = await criarMembro(`pdv${marca}`, { tenant: D.tenantId, permissoes: [{ modulo: 'agenda', nivel: 'VIEW' }] })
  })
  test.afterAll(async () => { await soVe?.limpar(); await recepcao?.limpar(); await D?.limpar() })

  // Daqui a 2 dias, um horário por cliente dentro da grade da agenda (7h–20h).
  const DIA = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(Date.now() + 2 * 24 * 3600_000))
  let hora = 8

  /** Uma cliente com CPF (ou só nascimento), agendada: o pendente nasce. */
  async function agendada(rotulo: string, ident: { document?: string | null; birth_date?: string | null } = { document: novoCpf() }) {
    const cliente = await D.criarCliente(rotulo)
    const { error: eIdent } = await db().from('clients').update(ident).eq('id', cliente)
    expect(eIdent, 'o CPF ou o nascimento da cliente').toBeNull()
    const { data: ap, error } = await db().from('appointments').insert({
      branch_id: D.branchId, client_id: cliente, procedure_id: D.procedureId, professional_id: D.professionalId,
      status: 'SCHEDULED', source: 'INTERNAL', scheduled_at: new Date(`${DIA}T${String(hora++).padStart(2, '0')}:00:00-03:00`).toISOString(), duration_min: 30, price: 0,
    }).select('id').single<{ id: string }>()
    expect(error).toBeNull()
    return { cliente, agendamento: ap!.id, cpf: ident.document ?? '' }
  }

  async function gerarLink(browser: Browser, agendamento: string, quem = recepcao) {
    const ctx = await browser.newContext({ storageState: quem.estado })
    const page = await ctx.newPage()
    try {
      const r = await chamarAcao(page, 'actions/pre-atendimento.ts', 'gerarLinkDoPreAtendimento', `/admin/agenda`, [agendamento])
      const token = /\/pre-atendimento\/([A-Za-z0-9_-]{43})/.exec(r.texto)?.[1] ?? ''
      return { texto: r.texto, token }
    } finally {
      await ctx.close()
    }
  }

  const pendenteDe = async (cliente: string) => (await db().from('pre_atendimentos').select('id, status, origem')
    .eq('client_id', cliente).order('created_at', { ascending: false }).limit(1).single<{ id: string; status: string; origem: string | null }>()).data!

  test('a equipe gera o link; a cliente abre sem conta, confirma o CPF e responde', async ({ browser }) => {
    const { cliente, agendamento, cpf } = await agendada('Link')
    const { texto, token } = await gerarLink(browser, agendamento)
    expect(token, 'a action devolve o link').not.toBe('')
    expect(texto, 'e a mensagem pronta para o WhatsApp').toContain('wa.me/')
    const { data: links } = await db().from('pre_atendimento_links').select('token_hash').eq('pre_atendimento_id', (await pendenteDe(cliente)).id)
    expect(links, 'só o hash do token vai ao banco').toEqual([{ token_hash: sha(token) }])

    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const page = await ctx.newPage()
    try {
      await page.goto(`/pre-atendimento/${token}`)
      await expect(page.getByLabel('CPF')).toBeVisible()
      await expect(page.locator('[data-campo="allergies"]'), 'nenhuma pergunta antes da identidade').toHaveCount(0)
      await page.getByLabel('CPF').fill(cpf)
      await page.getByRole('button', { name: 'Continuar' }).click()
      await page.locator('[data-campo="allergies"] textarea').fill(`látex ${marca}`)
      await preencherObrigatorias(page)
      await page.getByRole('button', { name: 'Enviar respostas' }).click()
      await expect(page.getByText('Respostas enviadas')).toBeVisible()
      expect(await pendenteDe(cliente)).toMatchObject({ status: 'RESPONDIDO', origem: 'CLIENTE_LINK' })
      const { data: mr } = await db().from('medical_records').select('general_anamnesis').eq('client_id', cliente).single()
      expect(mr?.general_anamnesis).toMatchObject({ origem: 'CLIENTE_LINK', respostas: { allergies: `látex ${marca}` } })

      await page.goto(`/pre-atendimento/${token}`)
      await expect(page.getByText('Ficha já respondida')).toBeVisible()
    } finally {
      await ctx.close()
    }
  })

  test('o link não deixa passar: CPF errado cinco vezes, token qualquer, responder sem a identidade', async ({ browser }) => {
    const { cliente, agendamento, cpf } = await agendada('Erros')
    const { token } = await gerarLink(browser, agendamento)
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const request = ctx.request
    try {
      const qualquer = randomBytes(32).toString('base64url')
      expect((await request.post('/api/pre-atendimento/abrir', { data: { token: qualquer, cpf: CPF }, headers: ip(1) })).status()).toBe(404)
      const semIdentidade = await request.post('/api/pre-atendimento/responder', { data: { token, cpf: '11144477735', respostas: { allergies: 'x' } }, headers: ip(2) })
      expect(semIdentidade.status(), 'responder confere a identidade de novo').toBe(403)
      expect((await pendenteDe(cliente)).status).toBe('PENDENTE')
      // A errada pela rota de responder já contou: mais três ainda dizem "não confere"…
      for (let i = 0; i < 3; i++) {
        expect((await request.post('/api/pre-atendimento/abrir', { data: { token, cpf: '11144477735' }, headers: ip(3) })).status()).toBe(403)
      }
      // …a 5ª derruba o link, e nem o CPF certo o abre mais.
      expect((await request.post('/api/pre-atendimento/abrir', { data: { token, cpf: '11144477735' }, headers: ip(3) })).status(), 'na 5ª errada o link caiu').toBe(410)
      expect((await request.post('/api/pre-atendimento/abrir', { data: { token, cpf }, headers: ip(4) })).status()).toBe(410)
      expect((await pendenteDe(cliente)).status, 'nada gravado').toBe('PENDENTE')
    } finally {
      await ctx.close()
    }
  })

  test('sem CPF, pede o nascimento; sem nenhum dos dois, não gera link', async ({ browser }) => {
    const comNascimento = await agendada('Nascimento', { document: null, birth_date: '1990-05-17T00:00:00Z' })
    const { token } = await gerarLink(browser, comNascimento.agendamento)
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    try {
      const r = await ctx.request.post('/api/pre-atendimento/abrir', { data: { token, nascimento: '1990-05-17' }, headers: ip(5) })
      expect(r.status()).toBe(200)
    } finally {
      await ctx.close()
    }
    const semNada = await agendada('Sem nada', { document: null, birth_date: null })
    expect((await gerarLink(browser, semNada.agendamento)).token).toBe('')
    expect((await db().from('pre_atendimento_links').select('id').eq('pre_atendimento_id', (await pendenteDe(semNada.cliente)).id)).data).toEqual([])
  })

  test('quem só vê a agenda não gera link', async ({ browser }) => {
    const { cliente, agendamento } = await agendada('So ve')
    expect((await gerarLink(browser, agendamento, soVe)).token).toBe('')
    expect((await db().from('pre_atendimento_links').select('id').eq('pre_atendimento_id', (await pendenteDe(cliente)).id)).data).toEqual([])
  })

  test('na agenda, o agendamento mostra a ficha pendente e manda o link', async ({ browser }) => {
    await agendada('Agenda')
    const ctx = await browser.newContext({ storageState: recepcao.estado })
    const page = await ctx.newPage()
    try {
      await page.goto(`/admin/agenda?date=${DIA}`)
      await page.locator(`[title*="Agenda pd${marca}"]`).first().click()
      const ficha = page.locator('[data-pre-atendimento-do-agendamento]')
      await expect(ficha.getByText('Ficha de saúde pendente')).toBeVisible()
      await ficha.getByRole('button', { name: 'Enviar a ficha' }).click()
      await expect(ficha.getByLabel('Link da ficha')).toHaveValue(/\/pre-atendimento\/[A-Za-z0-9_-]{43}$/)
      await expect(ficha.getByRole('link', { name: 'Abrir no WhatsApp' })).toHaveAttribute('href', /^https:\/\/wa\.me\/55/)
    } finally {
      await ctx.close()
    }
  })

  test('na agenda, o bloco do agendamento mostra a ficha: pendente ou respondida', async ({ browser }) => {
    const pendente = await agendada('Selo pendente')
    const respondida = await agendada('Selo respondida')
    const semFicha = await agendada('Selo sem ficha')
    expect((await db().from('pre_atendimentos').update({ status: 'RESPONDIDO', respondido_em: new Date().toISOString(), respostas: { allergies: 'nenhuma' } })
      .eq('id', (await pendenteDe(respondida.cliente)).id)).error).toBeNull()
    expect((await db().from('pre_atendimentos').update({ status: 'CANCELADO' })
      .eq('id', (await pendenteDe(semFicha.cliente)).id)).error).toBeNull()
    // Hoje, para a agenda da unidade (abre no dia de hoje): a mesma cliente pendente.
    const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
    const { data: deHoje, error } = await db().from('appointments').insert({
      branch_id: D.branchId, client_id: pendente.cliente, procedure_id: D.procedureId, professional_id: D.professionalId,
      status: 'SCHEDULED', source: 'INTERNAL', scheduled_at: new Date(`${hoje}T12:00:00-03:00`).toISOString(), duration_min: 30, price: 0,
    }).select('id').single<{ id: string }>()
    expect(error).toBeNull()
    const { data: un } = await db().from('branches').select('slug').eq('id', D.branchId).single<{ slug: string }>()
    // A agenda da unidade tem uma coluna por profissional DELA.
    expect((await db().from('users').update({ branch_id: D.branchId, provides_services: true }).eq('id', D.professionalId)).error).toBeNull()

    const ctx = await browser.newContext({ storageState: recepcao.estado })
    const page = await ctx.newPage()
    try {
      await page.goto(`/admin/agenda?date=${DIA}`)
      const bloco = (nome: string) => page.locator(`[title*="${nome} pd${marca}"]`).first()
      await expect(bloco('Selo pendente').locator('[data-ficha-de-saude="PENDENTE"]')).toHaveCount(1)
      await expect(bloco('Selo respondida').locator('[data-ficha-de-saude="RESPONDIDA"]')).toHaveCount(1)
      await expect(bloco('Selo sem ficha')).toBeVisible()
      await expect(bloco('Selo sem ficha').locator('[data-ficha-de-saude]')).toHaveCount(0)

      await page.goto(`/${un!.slug}/agenda`)
      await expect(page.locator(`[data-agendamento="${deHoje!.id}"] [data-ficha-de-saude="PENDENTE"]`)).toHaveCount(1)
    } finally {
      await ctx.close()
    }
  })

  test('com um link já valendo, a janela diz até quando — e gerar outro avisa que cancela esse', async ({ browser }) => {
    const { agendamento } = await agendada('Link valendo')
    const { token } = await gerarLink(browser, agendamento)
    expect(token).not.toBe('')
    const ctx = await browser.newContext({ storageState: recepcao.estado })
    const page = await ctx.newPage()
    try {
      await page.goto(`/admin/agenda?date=${DIA}`)
      await page.locator(`[title*="Link valendo pd${marca}"]`).first().click()
      const ficha = page.locator('[data-pre-atendimento-do-agendamento]')
      await expect(ficha.getByText(/Já há um link valendo até/)).toBeVisible()
      await expect(ficha.getByText(/Gerar outro cancela esse/)).toBeVisible()
      await expect(ficha.getByRole('button', { name: 'Gerar outro link' })).toBeVisible()
    } finally {
      await ctx.close()
    }
  })
  test('A27: sem CPF nem nascimento, a janela diz o que falta e leva ao cadastro da cliente', async ({ browser }) => {
    const sem = await agendada('Sem identidade', { document: null, birth_date: null })
    const ctx = await browser.newContext({ storageState: recepcao.estado })
    const page = await ctx.newPage()
    try {
      await page.goto(`/admin/agenda?date=${DIA}`)
      await page.locator(`[title*="Sem identidade pd${marca}"]`).first().click()
      const ficha = page.locator('[data-pre-atendimento-do-agendamento]')
      await expect(ficha.getByText('Complete o CPF ou a data de nascimento para enviar o link')).toBeVisible()
      await expect(ficha.getByRole('link', { name: 'Editar o cadastro' })).toHaveAttribute('href', `/admin/clients/${sem.cliente}?aba=dados`)
    } finally {
      await ctx.close()
    }
  })

  test('A48: "Ficha já respondida" mostra o contato da clínica', async ({ browser }) => {
    expect((await db().from('branches').update({ phone: '(47) 99999-1234' }).eq('id', D.branchId)).error).toBeNull()
    const { cliente, agendamento } = await agendada('Ja respondida')
    const { token } = await gerarLink(browser, agendamento)
    expect((await db().from('pre_atendimentos').update({ status: 'RESPONDIDO', respondido_em: new Date().toISOString(), respostas: { allergies: 'nenhuma' } })
      .eq('id', (await pendenteDe(cliente)).id)).error).toBeNull()
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const page = await ctx.newPage()
    try {
      await page.goto(`/pre-atendimento/${token}`)
      await expect(page.getByText('Ficha já respondida')).toBeVisible()
      const contato = page.locator('[data-contato-da-clinica]')
      await expect(contato).toContainText('(47) 99999-1234')
      await expect(contato.getByRole('link', { name: /WhatsApp/ })).toHaveAttribute('href', 'https://wa.me/5547999991234')
    } finally {
      await ctx.close()
    }
  })

  test('A47: erro de validação no link leva o foco ao primeiro campo inválido, destacado e com a mensagem junto', async ({ browser }) => {
    const { data: ficha } = await db().from('forms').select('id, schema').eq('tenant_id', D.tenantId).eq('tipo', 'PRE_ATENDIMENTO')
      .single<{ id: string; schema: { rows: { fields: { id: string; required?: boolean }[] }[] } }>()
    const comObrigatorio = JSON.parse(JSON.stringify(ficha!.schema))
    // Só a alergia obrigatória: a ficha padrão tem outras antes dela (D2), e o teste é do foco no campo de texto.
    for (const r of comObrigatorio.rows) for (const f of r.fields) f.required = f.id === 'allergies'
    expect((await db().from('forms').update({ schema: comObrigatorio }).eq('id', ficha!.id)).error).toBeNull()
    const { agendamento, cpf } = await agendada('Validacao')
    const { token } = await gerarLink(browser, agendamento)
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const page = await ctx.newPage()
    try {
      await page.setViewportSize({ width: 390, height: 700 })
      await page.goto(`/pre-atendimento/${token}`)
      await page.getByLabel('CPF').fill(cpf)
      await page.getByRole('button', { name: 'Continuar' }).click()
      await page.getByRole('button', { name: 'Enviar respostas' }).click()
      const campo = page.locator('[data-campo="allergies"]')
      await expect(campo).toHaveAttribute('data-invalido', 'true')
      await expect(campo.getByRole('alert')).toContainText('Preencha')
      await expect(campo.locator('textarea')).toBeFocused()
      await expect(campo).toBeInViewport()
      await campo.locator('textarea').fill('nenhuma')
      await expect(campo).not.toHaveAttribute('data-invalido', 'true')
    } finally {
      await ctx.close()
      await db().from('forms').update({ schema: ficha!.schema }).eq('id', ficha!.id)
    }
  })

})
