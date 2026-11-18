import { test, expect } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * D4 da 25ª simulação: a sessão do plano começava e terminava com o "Termo de
 * consentimento" do plano, que BLOQUEIA, sem assinatura.
 *
 * documentos.md: "nenhuma porta põe IN_PROGRESS com documento BLOQUEIA
 * aberto". A sessão de plano não emite documento seu (o plano tem os dele), e
 * a trava (`documentos_bloqueiam_inicio`) saía na hora para toda sessão de
 * plano. Agora os abertos do plano contam para a sessão dele, como os do
 * pacote para a sessão do pacote (PC2).
 *
 * Numa rede [e2e] própria. O controle: o mesmo termo em "Avisa" deixa começar.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let plano = ''
let agendamento = ''

test.beforeAll(async () => {
  test.setTimeout(180_000)
  rede = await criarOutraRede(`dpb${marca}`)
  const { data: modelo, error } = await db().rpc('documento_modelo_salvar', {
    p_tenant: rede.tenantId, p_modelo: null, p_nome: `${PREFIXO} Termo do plano ${marca}`, p_tipo: 'TERMO', p_origem: 'EDITOR',
    p_momento: null, p_exigencia: 'BLOQUEIA', p_texto: 'Termo.', p_arquivo_path: null, p_arquivo_sha256: null,
    p_arquivo_nome: null, p_arquivo_tamanho: null, p_arquivo_paginas: null, p_variaveis: [], p_usa_pagamento: false, p_ator: null,
  })
  expect(error, 'o modelo do termo').toBeNull()
  expect((await db().from('procedures').update({ consent_template_id: (modelo as { id: string }).id }).eq('id', rede.procedureId)).error).toBeNull()

  const { planId, clientId } = await rede.criarPlanoProposto('Termo do plano', { semTermo: true })
  plano = planId
  const { error: eE } = await db().rpc('documentos_emitir_do_plano', { p_plano: plano, p_com_contrato: false })
  expect(eE, 'os documentos do plano nascem').toBeNull()
  expect((await db().from('treatment_plans').update({ status: 'ACCEPTED' }).eq('id', plano)).error, 'plano aceito').toBeNull()

  const { data: ag, error: eA } = await db().from('appointments').insert({
    branch_id: rede.branchId, client_id: clientId, procedure_id: rede.procedureId, professional_id: rede.professionalId,
    treatment_plan_id: plano,
    scheduled_at: new Date(Date.now() + 3_600_000).toISOString(), duration_min: 30, price: 0, status: 'SCHEDULED',
  }).select('id').single<{ id: string }>()
  expect(eA, 'agendar a sessão do plano').toBeNull()
  agendamento = ag!.id
  expect((await db().from('treatment_plan_sessions').update({ appointment_id: agendamento }).eq('plan_id', plano)).error).toBeNull()
})

test.afterAll(async () => {
  test.setTimeout(120_000)
  await rede?.limpar()
})

const termoDoPlano = () => db().from('issued_documents').select('id, kind, enforcement, status')
  .eq('treatment_plan_id', plano).eq('kind', 'TERMO')

test('D4: o termo do plano em "Bloqueia" trava o início da sessão do plano; em "Avisa", não', async () => {
  const termos = ((await termoDoPlano()).data ?? []) as { id: string; enforcement: string; status: string }[]
  expect(termos.length, 'o plano tem o termo').toBe(1)
  expect(termos[0]!.enforcement).toBe('BLOQUEIA')

  const pendentes = ((await db().rpc('documentos_pendentes_do_atendimento', { p_agendamento: agendamento })).data ?? []) as { id: string }[]
  expect(pendentes.map(p => p.id), 'os abertos do plano valem para a sessão').toContain(termos[0]!.id)

  const inicio = await db().from('appointments').update({ status: 'IN_PROGRESS' }).eq('id', agendamento)
  expect(inicio.error?.message ?? '', 'a sessão não começa sem o termo do plano assinado').toMatch(/Falta assinar/)
  const concluir = await db().from('appointments').update({ status: 'COMPLETED' }).eq('id', agendamento)
  expect(concluir.error?.message ?? '', 'nem termina direto').toMatch(/Falta assinar/)

  // Controle: o mesmo termo em "Avisa" não segura.
  expect((await db().from('issued_documents').update({ enforcement: 'AVISA' }).eq('id', termos[0]!.id)).error).toBeNull()
  expect((await db().from('appointments').update({ status: 'IN_PROGRESS' }).eq('id', agendamento)).error, 'com "Avisa", começa').toBeNull()
})
