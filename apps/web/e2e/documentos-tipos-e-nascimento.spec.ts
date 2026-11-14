import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { apagarDocumentosEmitidos } from './apoio/limpeza'
import { haMinutosHoje } from './apoio/datas'

/**
 * Bloco Documentos, leva 1 (2026-11-14) — a revisão do Heitor de 13/11:
 * - DC1: os tipos são cinco — Termo de consentimento, Contrato do
 *   procedimento, Contrato de plano, Contrato de pacote (novo, um ativo por
 *   rede, trocado por "Tornar ativo") e Documento (novo, o "outro documento").
 * - DC1b/PR4/PC7/PC8: o procedimento liga o termo (opcional), o contrato
 *   (opcional, só no avulso) e "Outros documentos", quantos quiser.
 * - DC2: toda rede nasce com o contrato de pacote padrão, ao lado do de plano.
 * - DC4: sai o "quando nasce" — todo documento do atendimento nasce AO
 *   AGENDAR; o check-in e o início não emitem nada. A sessão de pacote e a de
 *   plano não pedem documento (PC2: assina-se pelo pacote ou pelo plano).
 *
 * Numa rede [e2e] própria.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let gestor: MembroDeTeste | null = null
let cliente = ''
const agendamentos: string[] = []
const modelos: Record<'termo' | 'contrato' | 'outroTermo' | 'plano' | 'pacote', string> = {
  termo: '', contrato: '', outroTermo: '', plano: '', pacote: '',
}
let documentoNovo = ''

const NOME = {
  termo:      `${PREFIXO} Termo dtn ${marca}`,
  contrato:   `${PREFIXO} Contrato dtn ${marca}`,
  outroTermo: `${PREFIXO} Termo extra dtn ${marca}`,
  documento:  `${PREFIXO} Uso de imagem dtn ${marca}`,
  pacote2:    `${PREFIXO} Contrato de pacote B ${marca}`,
}

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: gestor!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

async function modelo(nome: string, tipo: string, exigencia: 'BLOQUEIA' | 'AVISA', texto: string, variaveis: string[] = []) {
  const { data, error } = await db().rpc('documento_modelo_salvar', {
    p_tenant: rede!.tenantId, p_modelo: null, p_nome: nome, p_tipo: tipo, p_origem: 'EDITOR',
    p_momento: null, p_exigencia: exigencia, p_texto: texto,
    p_arquivo_path: null, p_arquivo_sha256: null, p_arquivo_nome: null, p_arquivo_tamanho: null, p_arquivo_paginas: null,
    p_variaveis: variaveis, p_usa_pagamento: false, p_ator: null,
  })
  expect(error, `criar o modelo ${nome}`).toBeNull()
  return (data as { id: string }).id
}

async function agendar(extra: Record<string, unknown> = {}) {
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: cliente, procedure_id: rede!.procedureId, professional_id: rede!.professionalId,
    status: 'SCHEDULED', source: 'INTERNAL', duration_min: 30, price: 100, scheduled_at: haMinutosHoje(30), ...extra,
  }).select('id').single<{ id: string }>()
  expect(error, 'agendar').toBeNull()
  agendamentos.push(data!.id)
  return data!.id
}

const docsDo = async (ap: string) =>
  ((await db().from('issued_documents').select('id, template_id, status, moment, closed_reason').eq('appointment_id', ap)).data ?? []) as
    { id: string; template_id: string; status: string; moment: string; closed_reason: string | null }[]

test.beforeAll(async () => {
  test.setTimeout(150_000)
  rede = await criarOutraRede(`dtn${marca}`)
  expect((await db().from('users').update({ provides_services: true, branch_id: rede.branchId }).eq('id', rede.professionalId)).error).toBeNull()
  cliente = await rede.criarCliente('Documentos')
  modelos.termo = await modelo(NOME.termo, 'TERMO', 'BLOQUEIA', '# Termo\n\nEu, **{{cliente.nome}}**, autorizo.\n\n[[assinatura]]', ['cliente.nome'])
  modelos.contrato = await modelo(NOME.contrato, 'CONTRATO', 'AVISA', '# Contrato\n\n{{cliente.nome}}\n\n[[assinatura]]', ['cliente.nome'])
  modelos.outroTermo = await modelo(NOME.outroTermo, 'TERMO', 'AVISA', '# Termo extra\n\n{{cliente.nome}}\n\n[[assinatura]]', ['cliente.nome'])
  gestor = await criarMembro(`dtn${marca}`, {
    tenant: rede.tenantId, branchId: null, rotulo: 'Gestão de documentos',
    permissoes: [
      { modulo: 'forms', nivel: 'MANAGE' }, { modulo: 'procedures', nivel: 'MANAGE' }, { modulo: 'settings', nivel: 'MANAGE' },
      { modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'documents', nivel: 'MANAGE' },
    ],
  })
})

test.afterAll(async () => {
  const docs = agendamentos.length
    ? ((await db().from('issued_documents').select('id').in('appointment_id', agendamentos)).data ?? []).map(d => d.id as string)
    : []
  expect(await apagarDocumentosEmitidos(docs)).toEqual([])
  // O resto (pacote, plano, agendamentos, modelos) sai com a rede.
  await gestor?.limpar(); await rede?.limpar()
})

test.describe.serial('documentos: os cinco tipos e "nasce ao agendar"', () => {
  test('DC2: a rede nasce com o contrato de pacote padrão, ao lado do de plano (e semear de novo não duplica)', async () => {
    for (let i = 0; i < 2; i++) expect((await db().rpc('documentos_modelos_padrao', { p_tenant: rede!.tenantId })).error).toBeNull()
    const { data } = await db().from('document_templates').select('id, kind, is_active, system_key, current_version')
      .eq('tenant_id', rede!.tenantId).in('kind', ['CONTRATO_PLANO', 'CONTRATO_PACOTE'])
    const linhas = (data ?? []) as { id: string; kind: string; is_active: boolean; system_key: string | null }[]
    expect(linhas.map(l => [l.kind, l.system_key, l.is_active]).sort()).toEqual([
      ['CONTRATO_PACOTE', 'CONTRATO_PACOTE_PADRAO', true],
      ['CONTRATO_PLANO', 'CONTRATO_PLANO_PADRAO', true],
    ])
    modelos.plano = linhas.find(l => l.kind === 'CONTRATO_PLANO')!.id
    modelos.pacote = linhas.find(l => l.kind === 'CONTRATO_PACOTE')!.id
    const { data: v } = await db().from('document_template_versions').select('variables, uses_payment').eq('template_id', modelos.pacote).single()
    expect(v!.variables).toEqual(expect.arrayContaining(['cliente.nome', 'pacote.procedimentos', 'pacote.total', 'pagamento.forma']))
    expect(v!.uses_payment).toBe(true)
  })

  test('DC1: Configurações → Documentos tem os cinco tipos, sem "quando nasce"; o contrato de pacote novo nasce inativo e "Tornar ativo" troca', async ({ browser }) => {
    // O segundo contrato de pacote nasce INATIVO: um ativo por rede, como o de plano.
    const segundo = await modelo(NOME.pacote2, 'CONTRATO_PACOTE', 'BLOQUEIA', '# Pacote\n\n{{pacote.procedimentos}}\n\n{{pagamento.forma}}', ['pacote.procedimentos', 'pagamento.forma'])
    expect((await db().from('document_templates').select('is_active').eq('id', segundo).single()).data?.is_active).toBe(false)

    await como(browser, async p => {
      await p.goto('/admin/settings?tab=documentos')
      for (const titulo of ['Termos de consentimento', 'Contratos do procedimento', 'Contrato de plano', 'Contrato de pacote', 'Documentos']) {
        await expect(p.getByRole('heading', { name: titulo, exact: true })).toBeVisible()
      }
      await expect(p.getByText(/nasce ao agendar|nasce no início do atendimento/)).toHaveCount(0)

      // "Tornar ativo" no contrato de pacote: o padrão sai, o B entra.
      const secao = p.getByRole('region', { name: 'Contrato de pacote' })
      await secao.locator(`[data-modelo="${segundo}"]`).getByRole('button', { name: 'Tornar ativo' }).click()
      await expect.poll(async () => (await db().from('document_templates').select('is_active').eq('id', segundo).single()).data?.is_active).toBe(true)
      expect((await db().from('document_templates').select('is_active').eq('id', modelos.pacote).single()).data?.is_active).toBe(false)

      // O tipo novo "Documento": o editor abre com o texto de exemplo, sem "Quando nasce".
      await p.getByRole('button', { name: 'Novo documento' }).click()
      await expect(p.getByRole('button', { name: 'Documento', exact: true, pressed: true })).toBeVisible()
      await expect(p.getByText('Quando nasce')).toHaveCount(0)
      await p.getByPlaceholder(/Termo de consentimento — toxina/).fill(NOME.documento)
      await p.getByRole('button', { name: 'Salvar modelo' }).click()
      await expect(p.getByRole('heading', { name: 'Documentos', exact: true })).toBeVisible()
    })
    const { data: doc } = await db().from('document_templates').select('id, kind, is_active').eq('tenant_id', rede!.tenantId).eq('name', NOME.documento).single()
    expect(doc).toMatchObject({ kind: 'DOCUMENTO', is_active: true })
    documentoNovo = doc!.id as string
    // O "quando nasce" saiu do modelo: a coluna não existe mais.
    expect((await db().from('document_templates').select('moment').limit(1)).error?.message).toMatch(/moment/)
  })

  test('DC1b: o procedimento liga o termo, o contrato (só do avulso) e "Outros documentos"; o banco recusa o que não serve', async ({ browser }) => {
    await como(browser, async p => {
      await p.goto('/admin/procedures')
      await p.locator('tr', { hasText: `${PREFIXO} Proc dtn${marca}` }).getByRole('button', { name: 'Editar' }).click()
      const janela = p.locator('dialog[open]')
      await janela.getByLabel('Termo de consentimento').selectOption({ label: NOME.termo })
      await janela.getByRole('combobox', { name: 'Contrato', exact: true }).selectOption({ label: NOME.contrato })
      await expect(janela.getByText(/Só no atendimento avulso/)).toBeVisible()
      const outros = janela.getByRole('group', { name: 'Outros documentos' })
      // Os contratos de plano e de pacote não se ligam a procedimento.
      await expect(outros.getByRole('button', { name: /Contrato de prestação de serviços/ })).toHaveCount(0)
      await expect(outros.getByRole('button', { name: new RegExp(NOME.pacote2.replace(/[[\]]/g, '\\$&')) })).toHaveCount(0)
      await outros.getByRole('button', { name: new RegExp(NOME.documento.replace(/[[\]]/g, '\\$&')) }).click()
      await outros.getByRole('button', { name: new RegExp(NOME.outroTermo.replace(/[[\]]/g, '\\$&')) }).click()
      await janela.getByRole('button', { name: 'Salvar alterações' }).click()
      await expect(janela).toHaveCount(0, { timeout: 15_000 })
    })
    const { data: proc } = await db().from('procedures').select('consent_template_id, contract_template_id, outros_documentos').eq('id', rede!.procedureId).single()
    expect(proc).toMatchObject({ consent_template_id: modelos.termo, contract_template_id: modelos.contrato })
    expect([...(proc!.outros_documentos as string[])].sort()).toEqual([documentoNovo, modelos.outroTermo].sort())

    // O banco: contrato de plano/pacote não entra em "outros", nem modelo de outra rede.
    const recusa = async (ids: string[]) => (await db().from('procedures').update({ outros_documentos: ids }).eq('id', rede!.procedureId)).error?.message ?? null
    expect(await recusa([modelos.plano])).toMatch(/Outros documentos/)
    expect(await recusa([modelos.pacote])).toMatch(/Outros documentos/)
    const deFora = (await db().from('document_templates').select('id').neq('tenant_id', rede!.tenantId).limit(1).single()).data!.id as string
    expect(await recusa([deFora])).toMatch(/Outros documentos/)
    expect((await db().from('procedures').select('outros_documentos').eq('id', rede!.procedureId).single()).data!.outros_documentos).toHaveLength(2)
  })

  test('DC4: todo documento do atendimento nasce AO AGENDAR; o check-in não emite nada, e o que bloqueia segura o início', async () => {
    const ap = await agendar()
    const docs = await docsDo(ap)
    expect(docs.map(d => d.template_id).sort()).toEqual([modelos.termo, modelos.contrato, modelos.outroTermo, documentoNovo].sort())
    expect(new Set(docs.map(d => d.moment))).toEqual(new Set(['AGENDAMENTO']))
    const { data: kinds } = await db().from('issued_documents').select('kind').eq('appointment_id', ap).eq('template_id', documentoNovo)
    expect(kinds).toEqual([{ kind: 'DOCUMENTO' }])

    expect((await db().from('appointments').update({ status: 'ARRIVED', arrived_at: new Date().toISOString() }).eq('id', ap)).error).toBeNull()
    expect((await docsDo(ap)).length, 'a chegada não emite documento novo').toBe(4)

    const inicio = await db().from('appointments').update({ status: 'IN_PROGRESS', started_at: new Date().toISOString() }).eq('id', ap)
    expect(inicio.error?.message).toContain(`Falta assinar: ${NOME.termo}`)
  })

  test('PC2: a sessão de pacote não pede documento — ligada ao pacote, os abertos do agendamento saem; a de plano não emite', async () => {
    const ap = await agendar()
    expect((await docsDo(ap)).length).toBe(4)
    const { data: sp } = await db().from('service_packages').insert({
      tenant_id: rede!.tenantId, procedure_id: rede!.procedureId, name: `${PREFIXO} Pacote dtn ${marca}`, total_sessions: 2, price: 200,
    }).select('id').single<{ id: string }>()
    const { data: cp } = await db().from('client_packages').insert({
      client_id: cliente, package_id: sp!.id, branch_id: rede!.branchId, total_sessions: 2, used_sessions: 0,
    }).select('id').single<{ id: string }>()
    const { error: eSessao } = await db().from('package_sessions').insert({ client_package_id: cp!.id, appointment_id: null, status: 'AVAILABLE', session_number: 1 })
    expect(eSessao).toBeNull()
    expect((await db().from('package_sessions').update({ appointment_id: ap }).eq('client_package_id', cp!.id)).error).toBeNull()

    const depois = await docsDo(ap)
    expect(depois.map(d => d.status)).toEqual(['CANCELADO', 'CANCELADO', 'CANCELADO', 'CANCELADO'])
    expect(depois[0]!.closed_reason).toMatch(/pacote/)
    // Leva 2 (PC2): os documentos são os do PACOTE, emitidos na venda — e o
    // "Bloqueia" deles trava o início da sessão até a assinatura.
    const doPacote = ((await db().from('issued_documents').select('id, status, enforcement').eq('client_package_id', cp!.id)).data ?? []) as { id: string; status: string; enforcement: string }[]
    expect(doPacote.length, 'a venda do pacote emitiu os dele').toBeGreaterThan(0)
    const travado = await db().from('appointments').update({ status: 'IN_PROGRESS', started_at: new Date().toISOString() }).eq('id', ap)
    expect(travado.error?.message ?? '', 'o "Bloqueia" do pacote trava a sessão').toMatch(/Falta assinar/)
    // Em "Só avisa", o início segue — e a sessão não emite nada seu.
    expect((await db().from('issued_documents').update({ enforcement: 'AVISA' }).eq('client_package_id', cp!.id)).error).toBeNull()
    expect((await db().from('appointments').update({ status: 'IN_PROGRESS', started_at: new Date().toISOString() }).eq('id', ap)).error).toBeNull()
    expect((await docsDo(ap)).filter(d => d.status !== 'CANCELADO'), 'iniciar não emite de novo').toEqual([])

    // A sessão de plano não emite (o plano tem os dele).
    const { data: plano } = await db().from('treatment_plans').insert({
      branch_id: rede!.branchId, professional_id: rede!.professionalId, client_id: cliente, status: 'ACCEPTED', name: `${PREFIXO} Plano dtn ${marca}`,
    }).select('id').single<{ id: string }>()
    const apPlano = await agendar({ treatment_plan_id: plano!.id })
    expect(await docsDo(apPlano)).toEqual([])
  })
})
