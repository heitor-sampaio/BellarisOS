import { test, expect } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { criarMembro } from './apoio/sessao'
import { chamarAcao } from './apoio/acao-direta'

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
