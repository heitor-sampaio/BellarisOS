import { createHash } from 'node:crypto'
import { test, expect, type Browser, type Page } from '@playwright/test'
import { PDFDocument, PDFDict, PDFName } from 'pdf-lib'
import QRCode from 'qrcode'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'
import { apagarDocumentosEmitidos } from './apoio/limpeza'

/**
 * Editor rico de documentos, de ponta a ponta (2026-09-30): um modelo com
 * cabeçalho, título, texto em outra fonte, variável em negrito, tabela, logo e
 * o lugar da assinatura vira documento emitido, é aberto SEM sessão pelo link
 * público (a folha carrega as fontes e o logo sem login), assinado — e o PDF
 * final embute as fontes usadas e desenha o logo, conferido pelo sha256.
 */

const marca = Date.now().toString(36)
const db = () => banco()
const CPF = '52998224725'
const NOME = `${PREFIXO} Cliente Rico ${marca}`
let rede: OutraRede | null = null
let gestor: MembroDeTeste | null = null
let doc = ''
let token = ''
let logo = ''

async function como(browser: Browser, estado: string | null, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: estado ?? { cookies: [], origins: [] } })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`der${marca}`)
  gestor = await criarMembro(`derg${marca}`, {
    tenant: rede.tenantId, rotulo: 'Recepção editor rico',
    permissoes: [{ modulo: 'documents', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'VIEW' }],
  })

  // O logo, como o editor o guarda: endereçado pelo conteúdo.
  const png = await QRCode.toBuffer(`logo ${marca}`, { width: 160, margin: 1 })
  const sha = createHash('sha256').update(png).digest('hex')
  logo = `${rede.tenantId}/imagens/${sha}.png`
  const { error: eUp } = await db().storage.from('modelos-de-documento').upload(logo, png, { contentType: 'image/png' })
  expect(eUp).toBeNull()

  const texto = (text: string, marks?: unknown[]) => ({ type: 'text', text, ...(marks ? { marks } : {}) })
  const documento = {
    cabecalho: { type: 'doc', content: [{ type: 'paragraph', attrs: { textAlign: 'right' }, content: [texto('Clínica Rica', [{ type: 'bold' }])] }] },
    corpo: { type: 'doc', content: [
      { type: 'imagemDoDocumento', attrs: { caminho: logo, sha256: sha, largura: 80, altura: 80, alinhar: 'centro' } },
      { type: 'heading', attrs: { level: 1, textAlign: 'center' }, content: [texto('Contrato de '), { type: 'variavel', attrs: { nome: 'procedimento.nome' } }] },
      { type: 'paragraph', attrs: { textAlign: 'justify' }, content: [
        texto('Eu, ', [{ type: 'textStyle', attrs: { fontFamily: 'doc-tinos', fontSize: '14pt' } }]),
        { type: 'variavel', attrs: { nome: 'cliente.nome' }, marks: [{ type: 'bold' }, { type: 'textStyle', attrs: { fontFamily: 'doc-tinos', fontSize: '14pt' } }] },
        texto(', declaro estar ciente.', [{ type: 'textStyle', attrs: { fontFamily: 'doc-tinos', fontSize: '14pt' } }]),
      ] },
      { type: 'table', content: [
        { type: 'tableRow', content: [
          { type: 'tableHeader', content: [{ type: 'paragraph', content: [texto('Sessão')] }] },
          { type: 'tableHeader', content: [{ type: 'paragraph', content: [texto('Cuidados')] }] },
        ] },
        { type: 'tableRow', content: [
          { type: 'tableCell', content: [{ type: 'paragraph', content: [texto('1ª')] }] },
          { type: 'tableCell', content: [{ type: 'paragraph', content: [texto('Evitar sol por 48 horas', [{ type: 'italic' }])] }] },
        ] },
      ] },
      { type: 'assinatura' },
    ] },
  }
  const { data: m, error } = await db().rpc('documento_modelo_salvar', {
    p_tenant: rede.tenantId, p_modelo: null, p_nome: `${PREFIXO} Termo rico ${marca}`, p_tipo: 'TERMO', p_origem: 'EDITOR',
    p_momento: 'AGENDAMENTO', p_exigencia: 'BLOQUEIA', p_texto: null,
    p_arquivo_path: null, p_arquivo_sha256: null, p_arquivo_nome: null, p_arquivo_tamanho: null, p_arquivo_paginas: null,
    p_variaveis: ['procedimento.nome', 'cliente.nome'], p_usa_pagamento: false, p_ator: null, p_documento: documento,
  })
  expect(error).toBeNull()
  await db().from('procedures').update({ consent_template_id: (m as { id: string }).id }).eq('id', rede.procedureId)

  const cliente = await rede.criarCliente('Rico')
  const { error: eC } = await db().from('clients').update({ name: NOME, document: CPF }).eq('id', cliente)
  expect(eC).toBeNull()
  const { data: ag } = await db().from('appointments').insert({
    branch_id: rede.branchId, client_id: cliente, procedure_id: rede.procedureId, professional_id: rede.professionalId,
    scheduled_at: new Date(Date.now() + 86_400_000).toISOString(), duration_min: 30, price: 100, status: 'SCHEDULED',
  }).select('id').single<{ id: string }>()
  const { data: d } = await db().from('issued_documents').select('id').eq('appointment_id', ag!.id).single<{ id: string }>()
  doc = d!.id
})

test.afterAll(async () => {
  if (rede) {
    const { data } = await db().from('issued_documents').select('id').eq('tenant_id', rede.tenantId)
    expect(await apagarDocumentosEmitidos((data ?? []).map(x => x.id as string))).toEqual([])
    await db().from('procedures').update({ consent_template_id: null }).eq('tenant_id', rede.tenantId)
    await db().from('document_template_versions').delete().eq('tenant_id', rede.tenantId)
    await db().from('document_templates').delete().eq('tenant_id', rede.tenantId)
    if (logo) await db().storage.from('modelos-de-documento').remove([logo])
  }
  await gestor?.limpar()
  await rede?.limpar()
})

test.describe.serial('documentos: editor rico de ponta a ponta', () => {
  test('o documento emitido é a árvore v2, com o estilo do modelo e a imagem pelo hash', async ({ browser }) => {
    await como(browser, gestor!.estado, async page => {
      const r = await chamarAcao(page, 'actions/documentos.ts', 'gerarLinkDeAssinatura', `/admin/clients/${(await db().from('issued_documents').select('client_id').eq('id', doc).single()).data!.client_id}`, [doc])
      token = /\/assinar\/([A-Za-z0-9_-]{43})/.exec(r.texto)?.[1] ?? ''
    })
    expect(token).not.toBe('')
    const { data } = await db().from('issued_documents').select('status, content, content_sha256').eq('id', doc).single()
    expect(data!.status).toBe('PENDENTE')
    const arvore = JSON.parse(data!.content as string)
    expect(arvore).toMatchObject({ versao: 2, cabecalho: [{ tipo: 'paragrafo', alinhar: 'direita', trechos: [{ texto: 'Clínica Rica', negrito: true }] }] })
    const paragrafo = arvore.blocos.find((b: { tipo: string }) => b.tipo === 'paragrafo')
    expect(paragrafo).toEqual({ tipo: 'paragrafo', alinhar: 'justificado', trechos: [
      { texto: 'Eu, ', fonte: 'tinos', tamanho: 14 },
      { texto: NOME, negrito: true, fonte: 'tinos', tamanho: 14 },
      { texto: ', declaro estar ciente.', fonte: 'tinos', tamanho: 14 },
    ] })
    expect(createHash('sha256').update(data!.content as string).digest('hex')).toBe(data!.content_sha256)
  })

  test('sem sessão: a folha carrega o logo e as fontes, e assina', async ({ browser }) => {
    await como(browser, null, async page => {
      await page.setViewportSize({ width: 390, height: 844 })
      await page.goto(`/assinar/${token}`)
      await page.getByLabel('CPF').fill(CPF)
      await page.getByRole('button', { name: 'Continuar' }).click()
      const folha = page.locator('.folha-documento')
      await expect(folha.getByText('Clínica Rica')).toBeVisible()
      await expect(folha.getByText('Evitar sol por 48 horas')).toBeVisible()
      const img = folha.locator('img').first()
      await expect(img).toBeVisible()
      await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0), { message: 'o logo carregou' }).toBe(true)
      // A fonte do documento veio do servidor SEM sessão (o proxy não a manda ao login).
      const fonte = await folha.getByText('declaro estar ciente', { exact: false }).evaluate(async el => {
        await document.fonts.ready
        return { familia: getComputedStyle(el).fontFamily, carregou: document.fonts.check(`14px "doc-tinos"`) }
      })
      expect(fonte.familia).toContain('doc-tinos')
      expect(fonte.carregou).toBe(true)
      const ttf = await page.request.get('/fontes-documento/tinos-regular.ttf', { maxRedirects: 0 })
      expect(ttf.status()).toBe(200)

      await page.getByText(/li e concordo com este documento/).click()
      const quadro = page.locator('canvas').last()
      await quadro.scrollIntoViewIfNeeded()
      const caixa = (await quadro.boundingBox())!
      await page.mouse.move(caixa.x + 30, caixa.y + 50); await page.mouse.down()
      for (const [x, y] of [[120, 30], [200, 90], [280, 40]]) await page.mouse.move(caixa.x + x!, caixa.y + y!, { steps: 5 })
      await page.mouse.up()
      await page.getByRole('button', { name: 'Confirmar assinatura' }).click()
      await page.getByRole('button', { name: 'Assinar documento' }).click()
      await expect(page.getByRole('heading', { name: 'Documento assinado' })).toBeVisible()
    })
  })

  test('o PDF assinado embute as fontes usadas e desenha o logo', async () => {
    let caminho: string | null = null
    await expect.poll(async () => {
      caminho = (await db().from('issued_documents').select('signed_pdf_path').eq('id', doc).single()).data?.signed_pdf_path ?? null
      return caminho
    }, { timeout: 45_000 }).toBeTruthy()
    const { data: arquivo, error } = await db().storage.from('documentos-assinados').download(caminho!)
    expect(error).toBeNull()
    const pdf = await PDFDocument.load(Buffer.from(await arquivo!.arrayBuffer()))
    const fontes = new Set<string>()
    let imagens = 0
    for (const [, obj] of pdf.context.enumerateIndirectObjects()) {
      if (!(obj instanceof PDFDict) && !('dict' in (obj as object))) continue
      const dict = obj instanceof PDFDict ? obj : (obj as unknown as { dict: PDFDict }).dict
      const tipo = dict.get(PDFName.of('Type'))?.toString()
      const sub = dict.get(PDFName.of('Subtype'))?.toString()
      if (tipo === '/Font' && dict.get(PDFName.of('BaseFont'))) fontes.add(dict.get(PDFName.of('BaseFont'))!.toString())
      if (sub === '/Image') imagens++
    }
    const nomes = [...fontes].join(' ')
    expect(nomes).toMatch(/Tinos/)
    expect(nomes).toMatch(/Arimo/)
    // O logo, a assinatura e o QR da página de evidências.
    expect(imagens).toBeGreaterThanOrEqual(3)
  })
})
