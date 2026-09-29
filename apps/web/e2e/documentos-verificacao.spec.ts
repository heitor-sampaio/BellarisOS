import { createHash } from 'node:crypto'
import { test, expect, type Browser, type Page } from '@playwright/test'
import { PDFDocument } from 'pdf-lib'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'
import { apagarDocumentosEmitidos } from './apoio/limpeza'

/**
 * Termos e contratos — fase 4: o PDF assinado e a verificação pública
 * (migration 20260930000004).
 *
 * Numa rede `[e2e]`. Um termo é assinado na clínica; o PDF final (documento +
 * página de evidências) tem de aparecer sozinho, com o hash gravado batendo
 * com o arquivo. A página `/verificar/<código>` é aberta SEM sessão (é o único
 * jeito de a regressão aparecer: logado, ela abriria de qualquer forma) e não
 * pode mostrar o CPF nem o nome completo.
 */

const marca = Date.now().toString(36)
const db = () => banco()
const CPF = '52998224725'
const NOME = `${PREFIXO} Verificação Cliente ${marca}`
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
let rede: OutraRede | null = null
let gestor: MembroDeTeste | null = null
let doc: { id: string; codigo: string } | null = null

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: gestor!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

const pdfDoDocumento = async (id: string) =>
  (await db().from('issued_documents').select('signed_pdf_path, signed_pdf_sha256, content_sha256, verification_code').eq('id', id).single()).data!

test.beforeAll(async () => {
  rede = await criarOutraRede(`dv${marca}`)
  gestor = await criarMembro(`dvg${marca}`, {
    tenant: rede.tenantId, rotulo: 'Recepção verificação',
    permissoes: [{ modulo: 'documents', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'VIEW' }],
  })
  const { data: m, error } = await db().rpc('documento_modelo_salvar', {
    p_tenant: rede.tenantId, p_modelo: null, p_nome: `${PREFIXO} Termo verificável ${marca}`, p_tipo: 'TERMO', p_origem: 'EDITOR',
    p_momento: 'AGENDAMENTO', p_exigencia: 'BLOQUEIA',
    p_texto: '# Termo de {{procedimento.nome}}\n\nEu, **{{cliente.nome}}**, CPF {{cliente.cpf}}, autorizo.\n\n- item um\n- item dois\n\n[[assinatura]]',
    p_arquivo_path: null, p_arquivo_sha256: null, p_arquivo_nome: null, p_arquivo_tamanho: null, p_arquivo_paginas: null,
    p_variaveis: [], p_usa_pagamento: false, p_ator: null,
  })
  expect(error).toBeNull()
  await db().from('procedures').update({ consent_template_id: (m as { id: string }).id }).eq('id', rede.procedureId)
  const cliente = await rede.criarCliente('Verificação')
  await db().from('clients').update({ name: NOME, document: CPF }).eq('id', cliente)
  const { data: ag } = await db().from('appointments').insert({
    branch_id: rede.branchId, client_id: cliente, procedure_id: rede.procedureId, professional_id: rede.professionalId,
    scheduled_at: new Date(Date.now() + 3_600_000).toISOString(), duration_min: 30, price: 100, status: 'SCHEDULED',
  }).select('id').single<{ id: string }>()
  const { data: d } = await db().from('issued_documents').select('id').eq('appointment_id', ag!.id).single<{ id: string }>()
  doc = { id: d!.id, codigo: '' }
})

test.afterAll(async () => {
  if (rede) {
    const { data } = await db().from('issued_documents').select('id, signed_pdf_path').eq('tenant_id', rede.tenantId)
    const pdfs = (data ?? []).map(d => d.signed_pdf_path as string | null).filter((p): p is string => !!p)
    if (pdfs.length) await db().storage.from('documentos-assinados').remove(pdfs)
    expect(await apagarDocumentosEmitidos((data ?? []).map(d => d.id as string))).toEqual([])
  }
  await gestor?.limpar()
  await rede?.limpar()
})

test.describe.serial('documentos: PDF assinado e verificação pública', () => {
  test('assinado na clínica, o PDF final aparece sozinho e o hash gravado é o do arquivo', async ({ browser }) => {
    await como(browser, async page => {
      // Abrir a tela monta o texto e o hash.
      await page.goto(`/admin/documentos/${doc!.id}/assinar`)
      await expect(page.getByRole('button', { name: 'Entregar ao cliente' })).toBeVisible()
      const { content_sha256 } = await pdfDoDocumento(doc!.id)
      const r = await chamarAcao(page, 'actions/documentos.ts', 'assinarNaClinica', `/admin/documentos/${doc!.id}/assinar`, [{
        id: doc!.id, assinatura: PNG, hashExibido: content_sha256, identidadeConferida: true, aceite: 'li e concordo',
      }])
      // O payload do dev traz outros "error" do React: quem diz se assinou é o banco.
      expect(r.status).toBe(200)
    })
    const { data: assinado } = await db().from('issued_documents').select('status').eq('id', doc!.id).single()
    expect(assinado!.status).toBe('ASSINADO')

    // Gerado em after(): chega em seguida, sem ninguém pedir.
    await expect.poll(async () => (await pdfDoDocumento(doc!.id)).signed_pdf_path, { timeout: 30_000 }).toBeTruthy()
    const gravado = await pdfDoDocumento(doc!.id)
    doc!.codigo = gravado.verification_code!
    const { data: arquivo } = await db().storage.from('documentos-assinados').download(gravado.signed_pdf_path!)
    const bytes = Buffer.from(await arquivo!.arrayBuffer())
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(gravado.signed_pdf_sha256)
    const pdf = await PDFDocument.load(bytes)
    expect(pdf.getPageCount(), 'o documento e a página de evidências').toBeGreaterThanOrEqual(2)
    expect(pdf.getTitle()).toBe(`${PREFIXO} Termo verificável ${marca}`)
    const { data: eventos } = await db().from('issued_document_events').select('kind').eq('issued_document_id', doc!.id)
    expect((eventos ?? []).map(e => e.kind)).toContain('PDF_GERADO')
  })

  test('a rota do PDF: quem vê documentos baixa; quem não tem o módulo, não', async ({ browser }) => {
    await como(browser, async page => {
      const r = await page.request.get(`/api/documentos/${doc!.id}/pdf`, { maxRedirects: 0 })
      expect(r.status()).toBe(307)
      expect(r.headers()['location']).toContain('documentos-assinados')
    })
    const semModulo = await criarMembro(`dvs${marca}`, { tenant: rede!.tenantId, rotulo: 'Sem documentos', permissoes: [{ modulo: 'clients', nivel: 'VIEW' }] })
    const ctx = await browser.newContext({ storageState: semModulo.estado })
    try {
      const r = await ctx.request.get(`/api/documentos/${doc!.id}/pdf`, { maxRedirects: 0 })
      expect(r.status()).toBe(403)
    } finally {
      await ctx.close()
      await semModulo.limpar()
    }
  })

  test.describe('sem sessão', () => {
    test.use({ storageState: { cookies: [], origins: [] } })

    test('a verificação mostra o autêntico e o hash, sem CPF nem nome completo, e confere o arquivo', async ({ page }) => {
      await page.goto('/verificar')
      await page.getByLabel('Código de verificação').fill(doc!.codigo.toLowerCase().replace(/-/g, ' '))
      await page.getByRole('button', { name: 'Verificar' }).click()
      await expect(page).toHaveURL(new RegExp(`/verificar/${doc!.codigo}$`))
      await expect(page.getByRole('heading', { name: 'Documento autêntico' })).toBeVisible()
      const gravado = await pdfDoDocumento(doc!.id)
      await expect(page.getByText(gravado.signed_pdf_sha256!)).toBeVisible()
      const corpo = await page.locator('main').innerText()
      expect(corpo, 'o CPF não aparece').not.toContain('529.982.247-25')
      expect(corpo).not.toContain(CPF)
      expect(corpo, 'o nome completo não aparece').not.toContain(NOME)

      // Conferir o arquivo: o hash é calculado no navegador.
      const { data: arquivo } = await db().storage.from('documentos-assinados').download(gravado.signed_pdf_path!)
      const bytes = Buffer.from(await arquivo!.arrayBuffer())
      await page.getByLabel('Arquivo para conferir').setInputFiles({ name: 'termo.pdf', mimeType: 'application/pdf', buffer: bytes })
      await expect(page.getByText('Este arquivo é o PDF assinado, sem nenhuma alteração.')).toBeVisible()
      const alterado = Buffer.concat([bytes, Buffer.from('\n% mexido')])
      await page.getByLabel('Arquivo para conferir').setInputFiles({ name: 'termo.pdf', mimeType: 'application/pdf', buffer: alterado })
      await expect(page.getByText(/NÃO confere/)).toBeVisible()
    })

    test('código torto e código que não existe', async ({ page }) => {
      await page.goto('/verificar?codigo=abc')
      await expect(page.getByText('Este código não é válido.', { exact: false })).toBeVisible()
      await page.goto('/verificar/ZZZZ-ZZZZ-ZZZZ')
      await expect(page.getByRole('heading', { name: 'Código não encontrado' })).toBeVisible()
    })
  })
})
