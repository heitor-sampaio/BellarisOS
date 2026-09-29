import { test, expect, type Browser, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'
import { apagarDocumentosEmitidos } from './apoio/limpeza'

/**
 * Termos e contratos — fase 2: o documento nasce do agendamento, trava o
 * início do atendimento e é assinado na clínica (tela ou papel)
 * (migration 20260930000002_documentos_emissao).
 *
 * Numa rede `[e2e]` própria. O procedimento dela liga um TERMO que nasce ao
 * agendar e BLOQUEIA, e um CONTRATO que nasce no início do atendimento e só
 * AVISA. Uma segunda rede é o alvo de "o documento de outra rede não se assina
 * daqui".
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let alheia: OutraRede | null = null
let gestor: MembroDeTeste | null = null
let cliente = ''
let termo = ''
let contrato = ''
const TITULO_TERMO = `${PREFIXO} Termo toxina ${marca}`
const TITULO_CONTRATO = `${PREFIXO} Contrato avulso ${marca}`

async function modelo(r: OutraRede, nome: string, tipo: string, momento: string, exigencia: string, texto: string) {
  const { data, error } = await db().rpc('documento_modelo_salvar', {
    p_tenant: r.tenantId, p_modelo: null, p_nome: nome, p_tipo: tipo, p_origem: 'EDITOR',
    p_momento: momento, p_exigencia: exigencia, p_texto: texto, p_arquivo_path: null, p_arquivo_sha256: null,
    p_arquivo_nome: null, p_arquivo_tamanho: null, p_arquivo_paginas: null, p_variaveis: [], p_usa_pagamento: false, p_ator: null,
  })
  expect(error, `criar o modelo ${nome}`).toBeNull()
  return (data as { id: string }).id
}

async function agendar(r: OutraRede, clientId: string, extra: Record<string, unknown> = {}) {
  const { data, error } = await db().from('appointments').insert({
    branch_id: r.branchId, client_id: clientId, procedure_id: r.procedureId, professional_id: r.professionalId,
    scheduled_at: new Date(Date.now() + 3_600_000).toISOString(), duration_min: 30, price: 1200, status: 'SCHEDULED', ...extra,
  }).select('id').single<{ id: string }>()
  expect(error, 'agendar').toBeNull()
  return data!.id
}

const documentos = async (filtro: Record<string, string>) => {
  let q = db().from('issued_documents').select('id, template_id, status, content_sha256, verification_code, missing_fields')
  for (const [k, v] of Object.entries(filtro)) q = q.eq(k, v)
  return (await q.order('created_at')).data ?? []
}
const status = async (id: string) =>
  (await db().from('appointments').select('status').eq('id', id).single()).data?.status

test.beforeAll(async () => {
  rede = await criarOutraRede(`da${marca}`)
  alheia = await criarOutraRede(`daa${marca}`)
  gestor = await criarMembro(`dag${marca}`, {
    tenant: rede.tenantId, rotulo: 'Recepção documentos',
    permissoes: [
      { modulo: 'documents', nivel: 'MANAGE' }, { modulo: 'agenda', nivel: 'MANAGE' },
      { modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'medical_records', nivel: 'VIEW' },
    ],
  })
  termo = await modelo(rede, TITULO_TERMO, 'TERMO', 'AGENDAMENTO', 'BLOQUEIA',
    '# Termo de {{procedimento.nome}}\n\nEu, **{{cliente.nome}}**, CPF {{cliente.cpf}}, autorizo.\n\n[[assinatura]]')
  contrato = await modelo(rede, TITULO_CONTRATO, 'CONTRATO', 'INICIO_ATENDIMENTO', 'AVISA',
    '# Contrato\n\n{{cliente.nome}} contrata {{procedimento.nome}} em {{agendamento.data}} por {{procedimento.valor}}.')
  const { error } = await db().from('procedures')
    .update({ consent_template_id: termo, contract_template_id: contrato }).eq('id', rede.procedureId)
  expect(error, 'ligar os modelos ao procedimento').toBeNull()
  cliente = await rede.criarCliente('Documentos')
})

test.afterAll(async () => {
  // Os documentos PRIMEIRO: a evidência aponta quem conduziu a assinatura
  // (`conducted_by`), e o membro não sai enquanto ela existir.
  for (const r of [rede, alheia]) {
    if (!r) continue
    const { data } = await db().from('issued_documents').select('id').eq('tenant_id', r.tenantId)
    expect(await apagarDocumentosEmitidos((data ?? []).map(d => d.id as string))).toEqual([])
  }
  await gestor?.limpar()
  await rede?.limpar()
  await alheia?.limpar()
})

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: gestor!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

async function rabiscar(page: Page) {
  const quadro = page.locator('canvas').last()
  const caixa = (await quadro.boundingBox())!
  await page.mouse.move(caixa.x + 40, caixa.y + 60)
  await page.mouse.down()
  for (const [x, y] of [[120, 40], [200, 120], [300, 50], [420, 110]]) await page.mouse.move(caixa.x + x!, caixa.y + y!, { steps: 5 })
  await page.mouse.up()
  await page.getByRole('button', { name: 'Confirmar assinatura' }).click()
}

test.describe.serial('documentos: emissão pelo atendimento e assinatura na clínica', () => {
  let ag1 = ''

  test('nasce ao agendar; o do início nasce no check-in; iniciar é recusado sem assinatura', async ({ browser }) => {
    ag1 = await agendar(rede!, cliente)
    let docs = await documentos({ appointment_id: ag1 })
    expect(docs.map(d => d.template_id), 'só o termo nasce ao agendar').toEqual([termo])
    const { data: evento } = await db().from('domain_events').select('nome, dados').eq('entidade_id', docs[0]!.id).single()
    expect(evento).toMatchObject({ nome: 'termo.emitido', dados: { referencia: TITULO_TERMO, exigencia: 'BLOQUEIA' } })

    await db().from('appointments').update({ status: 'CONFIRMED' }).eq('id', ag1)
    docs = await documentos({ appointment_id: ag1 })
    expect(docs.map(d => d.template_id).sort(), 'o contrato nasce no check-in').toEqual([termo, contrato].sort())

    // A trava é do banco: vale para qualquer porta que tente começar.
    const direto = await db().from('appointments').update({ status: 'IN_PROGRESS' }).eq('id', ag1)
    expect(direto.error?.message).toContain(`Falta assinar: ${TITULO_TERMO}`)
    expect(direto.error?.message, 'o que só avisa não trava').not.toContain(TITULO_CONTRATO)

    await como(browser, async page => {
      await page.goto(`/admin/agenda/${ag1}`)
      const painel = page.getByRole('region', { name: 'Documentos do atendimento' })
      await expect(painel.getByText(TITULO_TERMO)).toBeVisible()
      await expect(painel.getByText('O atendimento só começa depois da assinatura')).toBeVisible()
      await expect(page.getByRole('button', { name: 'Iniciar atendimento' })).toBeDisabled()
    })
    expect(await status(ag1)).toBe('CONFIRMED')
  })

  test('sem CPF o termo fica incompleto; completado o cadastro, gera de novo', async ({ browser }) => {
    const [doc] = await documentos({ appointment_id: ag1, template_id: termo })
    await como(browser, async page => {
      await page.goto(`/admin/clients/${cliente}?aba=documentos`)
      const linha = page.locator(`[data-documento="${doc!.id}"]`)
      await expect(linha.getByText('Faltam dados')).toBeVisible()
      await expect(linha.getByText('Falta no cadastro: Cliente · CPF.')).toBeVisible()

      await db().from('clients').update({ document: '52998224725' }).eq('id', cliente)
      await linha.getByRole('button', { name: 'Gerar de novo' }).click()
      await expect(linha.getByText('Para assinar · bloqueia')).toBeVisible()
    })
    const [depois] = await documentos({ id: doc!.id })
    expect(depois).toMatchObject({ status: 'PENDENTE', missing_fields: [] })
    expect(depois!.verification_code).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/)
  })

  test('assinada na tela, com a identidade conferida, o atendimento começa', async ({ browser }) => {
    const [doc] = await documentos({ appointment_id: ag1, template_id: termo })
    await como(browser, async page => {
      await page.goto(`/admin/clients/${cliente}?aba=documentos`)
      await page.locator(`[data-documento="${doc!.id}"]`).getByRole('link', { name: 'Colher assinatura' }).click()
      await expect(page.getByRole('heading', { name: TITULO_TERMO })).toBeVisible()
      // O texto montado com os dados do cliente, CPF com pontos.
      await expect(page.getByText('CPF 529.982.247-25, autorizo.')).toBeVisible()

      const entregar = page.getByRole('button', { name: 'Entregar ao cliente' })
      await expect(entregar).toBeDisabled()
      await page.getByText(/Conferi o documento de identidade/).click()
      await entregar.click()

      await page.getByText(/li e concordo com este documento/).click()
      await rabiscar(page)
      await page.getByRole('button', { name: 'Assinar documento' }).click()
      await expect(page.getByRole('heading', { name: 'Documento assinado' })).toBeVisible()
      await expect(page.getByText(doc!.verification_code!)).toBeVisible()

      // Com o termo assinado, a sessão libera o início — o contrato só avisa.
      await page.goto(`/admin/agenda/${ag1}`)
      await page.getByRole('button', { name: 'Iniciar atendimento' }).click()
      await expect.poll(() => status(ag1)).toBe('IN_PROGRESS')
    })

    const { data: assinatura } = await db().from('document_signatures')
      .select('channel, identity_method, conducted_by, content_sha256, signature_png, signer_document, accepted_text')
      .eq('issued_document_id', doc!.id).single()
    expect(assinatura).toMatchObject({
      channel: 'CLINICA', identity_method: 'PRESENCIAL', conducted_by: gestor!.userId,
      content_sha256: doc!.content_sha256, signer_document: '52998224725',
    })
    expect(assinatura!.signature_png).toMatch(/^data:image\/png;base64,/)
    expect(assinatura!.accepted_text).toContain('li e concordo')
    const { data: evento } = await db().from('domain_events').select('nome').eq('entidade_id', doc!.id).eq('nome', 'termo.assinado')
    expect(evento).toHaveLength(1)
    // A evidência não se altera.
    const mexer = await db().from('document_signatures').update({ signer_name: 'outro' }).eq('issued_document_id', doc!.id)
    expect(mexer.error?.message).toMatch(/não se altera/)
  })

  test('sempre de novo; o hash de outro texto é recusado; papel e dispensa cumprem a exigência', async ({ browser }) => {
    const ag2 = await agendar(rede!, cliente)
    const ag3 = await agendar(rede!, cliente)
    const termos = await documentos({ client_id: cliente, template_id: termo })
    expect(termos, 'cada agendamento pede o seu termo').toHaveLength(3)

    const [doc2] = await documentos({ appointment_id: ag2, template_id: termo })
    const [doc3] = await documentos({ appointment_id: ag3, template_id: termo })
    await como(browser, async page => {
      // Abrir a tela monta o texto (e o hash).
      await page.goto(`/admin/documentos/${doc2!.id}/assinar`)
      await expect(page.getByRole('button', { name: 'Assinar no papel' })).toBeVisible()
    })
    const [montado] = await documentos({ id: doc2!.id })
    const errado = await db().rpc('documento_assinar', {
      p_doc: doc2!.id, p_tenant: rede!.tenantId, p_canal: 'CLINICA', p_identidade: 'PRESENCIAL',
      p_hash_exibido: 'f'.repeat(64), p_png: 'data:image/png;base64,AAAA', p_png_sha256: null, p_nome: 'x',
      p_documento: null, p_ip: null, p_ua: null, p_conduzido_por: null, p_link: null, p_scan_path: null, p_scan_sha256: null, p_aceite: null,
    })
    expect(errado.error?.message).toContain('O documento mudou desde que foi aberto')
    expect(montado!.status).toBe('PENDENTE')

    await como(browser, async page => {
      await page.goto(`/admin/documentos/${doc2!.id}/assinar`)
      await page.getByRole('button', { name: 'Assinar no papel' }).click()
      const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
      await page.getByLabel('Digitalização do papel assinado').setInputFiles({ name: 'papel.png', mimeType: 'image/png', buffer: png })
      await page.getByRole('button', { name: 'Confirmar: o cliente assinou o papel' }).click()
      await expect(page.getByRole('heading', { name: 'Documento assinado' })).toBeVisible()

      // Dispensar, com motivo, pela ficha.
      await page.goto(`/admin/clients/${cliente}?aba=documentos`)
      const linha = page.locator(`[data-documento="${doc3!.id}"]`)
      await linha.getByRole('button', { name: 'Dispensar' }).click()
      await linha.getByLabel('Motivo da dispensa').fill('Cliente já assinou o termo na semana passada')
      await linha.getByRole('button', { name: 'Dispensar' }).click()
      await expect(linha.getByText('Dispensado')).toBeVisible()
    })
    const { data: papel } = await db().from('document_signatures').select('channel, scan_path, scan_sha256, signature_png')
      .eq('issued_document_id', doc2!.id).single()
    expect(papel).toMatchObject({ channel: 'PAPEL', signature_png: null })
    expect(papel!.scan_path).toMatch(/papel-\d+\.png$/)
    expect((await documentos({ id: doc3!.id }))[0]!.status).toBe('DISPENSADO')

    // Os dois começam: um assinado no papel, o outro dispensado.
    for (const ag of [ag2, ag3]) {
      await db().from('appointments').update({ status: 'CONFIRMED' }).eq('id', ag)
      const r = await db().from('appointments').update({ status: 'IN_PROGRESS' }).eq('id', ag)
      expect(r.error, 'com a exigência cumprida, começa').toBeNull()
    }
  })

  test('cancelar o agendamento cancela os abertos; agendamento de plano não emite nada', async () => {
    const ag4 = await agendar(rede!, cliente)
    await db().from('appointments').update({ status: 'CANCELLED', cancellation_reason: 'e2e' }).eq('id', ag4)
    expect((await documentos({ appointment_id: ag4 })).map(d => d.status)).toEqual(['CANCELADO'])

    const plano = await rede!.criarPlanoProposto('Docs', { semTermo: true })
    const ag5 = await agendar(rede!, plano.clientId, { treatment_plan_id: plano.planId })
    expect(await documentos({ appointment_id: ag5 }), 'o plano tem os documentos dele (fase 3)').toEqual([])
  })

  test('quem só VÊ documentos lê, mas não colhe nem dispensa — nem chamando a action direto', async ({ browser }) => {
    const ag = await agendar(rede!, cliente)
    const [doc] = await documentos({ appointment_id: ag, template_id: termo })
    const leitor = await criarMembro(`dal${marca}`, {
      tenant: rede!.tenantId, rotulo: 'Só lê documentos',
      permissoes: [{ modulo: 'documents', nivel: 'VIEW' }, { modulo: 'clients', nivel: 'VIEW' }],
    })
    const ctx = await browser.newContext({ storageState: leitor.estado })
    try {
      const page = await ctx.newPage()
      await page.goto(`/admin/documentos/${doc!.id}/assinar`)
      await expect(page.getByRole('heading', { name: TITULO_TERMO })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Entregar ao cliente' })).toHaveCount(0)
      const r = await chamarAcao(page, 'actions/documentos.ts', 'dispensarDocumento', `/admin/documentos/${doc!.id}/assinar`,
        [doc!.id, 'tentando dispensar sem poder'])
      expect(r.texto).not.toContain('"error":""')
    } finally {
      await ctx.close()
      await leitor.limpar()
    }
    expect((await documentos({ id: doc!.id }))[0]!.status, 'nada mudou').not.toBe('DISPENSADO')
  })

  test('o documento de outra rede não se assina daqui, e a sessão não o lê', async ({ browser }) => {
    const clienteAlheio = await alheia!.criarCliente('Alheio')
    const termoAlheio = await modelo(alheia!, `${PREFIXO} Termo alheio ${marca}`, 'TERMO', 'AGENDAMENTO', 'BLOQUEIA', 'Termo {{cliente.nome}}')
    await db().from('procedures').update({ consent_template_id: termoAlheio }).eq('id', alheia!.procedureId)
    const agAlheio = await agendar(alheia!, clienteAlheio)
    const [docAlheio] = await documentos({ appointment_id: agAlheio })

    const [meu] = await documentos({ client_id: cliente, status: 'ASSINADO' })
    await como(browser, async page => {
      const r = await chamarAcao(page, 'actions/documentos.ts', 'assinarNaClinica', `/admin/documentos/${meu!.id}/assinar`, [{
        id: docAlheio!.id, assinatura: 'data:image/png;base64,AAAA', hashExibido: docAlheio!.content_sha256 ?? 'x',
        identidadeConferida: true, aceite: 'invasão',
      }])
      expect(r.texto).toContain('Documento não encontrado')
      // notFound() com streaming responde 200 e desenha a página de não encontrado:
      // o que importa é o documento alheio não aparecer.
      await page.goto(`/admin/documentos/${docAlheio!.id}/assinar`)
      await expect(page.getByText(/could not be found/)).toBeVisible()
      await expect(page.getByText(`${PREFIXO} Termo alheio ${marca}`)).toHaveCount(0)
    })
    expect((await documentos({ id: docAlheio!.id }))[0]!.status).not.toBe('ASSINADO')

    // RLS: o membro lê os documentos da própria rede e nenhum da outra.
    const sessao = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${gestor!.accessToken}` } },
    })
    expect((await sessao.from('issued_documents').select('id').eq('client_id', cliente)).data!.length).toBeGreaterThan(0)
    expect((await sessao.from('issued_documents').select('id').eq('id', docAlheio!.id)).data ?? []).toEqual([])
    const assinar = await sessao.rpc('documento_assinar', {
      p_doc: docAlheio!.id, p_tenant: alheia!.tenantId, p_canal: 'CLINICA', p_identidade: 'PRESENCIAL', p_hash_exibido: 'x',
      p_png: null, p_png_sha256: null, p_nome: 'x', p_documento: null, p_ip: null, p_ua: null, p_conduzido_por: null,
      p_link: null, p_scan_path: null, p_scan_sha256: null, p_aceite: null,
    })
    expect(assinar.error, 'a função é só do servidor').not.toBeNull()
  })
})
