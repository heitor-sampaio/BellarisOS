import { test, expect } from '@playwright/test'
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
    const recente = await A.criarCliente('Respondeu há 1 mês')
    const antiga = await A.criarCliente('Respondeu há 8 meses')
    for (const [cliente, quando] of [[recente, ha(1)], [antiga, ha(8)]] as const) {
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
        ap!.id, 'Quer tratar manchas', { allergies: `pólen ${marca}`, campoQueNaoExiste: 'x' },
        [{ procedures: [{ procedureId: B.procedureId, price: 100 }] }], '', '', '', `e2e-un-pb${marca}`,
      ])
      const { data } = await db().from('medical_records').select('general_anamnesis').eq('client_id', cliente).single()
      const g = data?.general_anamnesis as { versao?: number; respostas?: Record<string, string> }
      expect(g?.versao).toBe(2)
      expect(g?.respostas, 'só as perguntas da ficha').toEqual({ allergies: `pólen ${marca}` })
    } finally {
      await ctx.close()
      // O plano nasce com o membro como profissional: sai antes dele (afterAll).
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
      await page.getByRole('button', { name: 'Enviar respostas' }).click()
      await expect(page.getByText('Respostas enviadas')).toBeVisible()
      expect((await db().from('pre_atendimentos').select('status, origem').eq('client_id', cliente.clientId)).data)
        .toEqual([{ status: 'RESPONDIDO', origem: 'CLIENTE_APP' }])
      expect(await anamnese()).toMatchObject({ origem: 'CLIENTE_APP', respostas: { allergies: `pólen ${marca}` } })
    } finally {
      await ctx.close()
    }
  })

  test('dentro da validade, ela só confirma que nada mudou', async ({ browser }) => {
    const antes = (await anamnese())?.respondidoEm
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
