import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, clienteComSessao, type MembroDeTeste, type ClienteDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'
import { apagarDocumentosEmitidos } from './apoio/limpeza'

/**
 * Termos e contratos — fase 5: o portal do cliente.
 *
 * Numa rede `[e2e]`: a equipe pede a assinatura no portal (o aviso é
 * GENÉRICO — o título do documento pode dizer o procedimento, e o push aparece
 * na tela de bloqueio), o cliente vê, lê e assina pelo portal, e só o DELE:
 * documento de outro cliente não abre, não se assina e o PDF não baixa.
 */

const marca = Date.now().toString(36)
const db = () => banco()
const TITULO = `${PREFIXO} Termo toxina portal ${marca}`
let rede: OutraRede | null = null
let gestor: MembroDeTeste | null = null
let cliente: ClienteDeTeste | null = null
let slug = ''

async function agendar(clientId: string) {
  const { data: ag, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: clientId, procedure_id: rede!.procedureId, professional_id: rede!.professionalId,
    scheduled_at: new Date(Date.now() + 86_400_000).toISOString(), duration_min: 30, price: 100, status: 'SCHEDULED',
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  const { data: d } = await db().from('issued_documents').select('id').eq('appointment_id', ag!.id).single<{ id: string }>()
  return d!.id
}

async function como(browser: Browser, estado: string, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`dp${marca}`)
  const { data: un } = await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()
  slug = un!.slug
  gestor = await criarMembro(`dpg${marca}`, {
    tenant: rede.tenantId, rotulo: 'Recepção portal',
    permissoes: [{ modulo: 'documents', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'VIEW' }],
  })
  cliente = await clienteComSessao(`dpc${marca}`, { id: rede.branchId, slug }, { tenant: rede.tenantId })
  const { error: eCpf } = await db().from('clients').update({ document: '52998224725' }).eq('id', cliente.clientId)
  expect(eCpf).toBeNull()
  const { data: m, error } = await db().rpc('documento_modelo_salvar', {
    p_tenant: rede.tenantId, p_modelo: null, p_nome: TITULO, p_tipo: 'TERMO', p_origem: 'EDITOR',
    p_momento: 'AGENDAMENTO', p_exigencia: 'BLOQUEIA', p_texto: '# Termo\n\nEu, {{cliente.nome}}, CPF {{cliente.cpf}}, autorizo {{procedimento.nome}}.',
    p_arquivo_path: null, p_arquivo_sha256: null, p_arquivo_nome: null, p_arquivo_tamanho: null, p_arquivo_paginas: null,
    p_variaveis: [], p_usa_pagamento: false, p_ator: null,
  })
  expect(error).toBeNull()
  await db().from('procedures').update({ consent_template_id: (m as { id: string }).id }).eq('id', rede.procedureId)
})

test.afterAll(async () => {
  if (rede) {
    const { data } = await db().from('issued_documents').select('id').eq('tenant_id', rede.tenantId)
    expect(await apagarDocumentosEmitidos((data ?? []).map(d => d.id as string))).toEqual([])
  }
  await cliente?.limpar()
  await gestor?.limpar()
  await rede?.limpar()
})

test.describe.serial('documentos: portal do cliente', () => {
  let doc = ''

  test('a equipe pede no portal: o cliente é avisado com texto genérico', async ({ browser }) => {
    doc = await agendar(cliente!.clientId)
    await como(browser, gestor!.estado, async page => {
      await page.goto(`/admin/clients/${cliente!.clientId}?aba=documentos`)
      const linha = page.locator(`[data-documento="${doc}"]`)
      await linha.getByRole('button', { name: 'Pedir no portal' }).click()
      await expect(page.getByText(/Pedido enviado: o documento está no portal do cliente/)).toBeVisible()
    })
    const { data: avisos } = await db().from('client_notifications').select('title, body, type, data').eq('client_id', cliente!.clientId)
    expect(avisos).toHaveLength(1)
    const aviso = avisos![0]!
    expect(aviso.type).toBe('document_to_sign')
    expect(`${aviso.title} ${aviso.body}`, 'nada do documento nem do procedimento na tela de bloqueio').not.toMatch(/toxina|Proc/i)
    expect((aviso.data as { link: string }).link).toBe(`/${slug}/cliente/documentos/${doc}`)
    const { data: ev } = await db().from('issued_document_events').select('kind').eq('issued_document_id', doc).eq('kind', 'NOTIFICADO_PORTAL')
    expect(ev).toHaveLength(1)
  })

  test('o cliente vê o pedido na home, lê e assina pelo portal — e baixa o PDF', async ({ browser }) => {
    await como(browser, cliente!.estado, async page => {
      await page.goto(`/${slug}/cliente/home`)
      await page.getByTestId('documentos-para-assinar').click()
      await page.locator(`[data-documento="${doc}"]`).click()

      // Direto no modo do cliente: nada da etapa da equipe.
      await expect(page.getByRole('button', { name: 'Entregar ao cliente' })).toHaveCount(0)
      await expect(page.getByText('CPF 529.982.247-25, autorizo', { exact: false })).toBeVisible()
      await page.getByText(/li e concordo com este documento/).click()
      const quadro = page.locator('canvas').last()
      const caixa = (await quadro.boundingBox())!
      await page.mouse.move(caixa.x + 40, caixa.y + 60); await page.mouse.down()
      for (const [x, y] of [[140, 40], [240, 110], [360, 50]]) await page.mouse.move(caixa.x + x!, caixa.y + y!, { steps: 5 })
      await page.mouse.up()
      await page.getByRole('button', { name: 'Confirmar assinatura' }).click()
      await page.getByRole('button', { name: 'Assinar documento' }).click()
      await expect(page.getByRole('heading', { name: 'Documento assinado' })).toBeVisible()
      await expect(page.getByText('A clínica já recebeu o documento assinado.', { exact: false })).toBeVisible()

      await expect.poll(async () => (await db().from('issued_documents').select('signed_pdf_path').eq('id', doc).single()).data?.signed_pdf_path,
        { timeout: 30_000 }).toBeTruthy()
      const pdf = await page.request.get(`/api/documentos/${doc}/pdf`, { maxRedirects: 0 })
      expect(pdf.status(), 'o cliente baixa o PDF do documento DELE').toBe(307)
    })
    const { data: assinatura } = await db().from('document_signatures').select('channel, identity_method, conducted_by, signer_document')
      .eq('issued_document_id', doc).single()
    expect(assinatura).toEqual({ channel: 'PORTAL', identity_method: 'SESSAO_PORTAL', conducted_by: null, signer_document: '52998224725' })
  })

  test('o documento de OUTRO cliente: não abre, não se assina e o PDF não baixa', async ({ browser }) => {
    const outro = await rede!.criarCliente('Outro do portal')
    const docAlheio = await agendar(outro)
    await como(browser, cliente!.estado, async page => {
      const tela = await page.goto(`/${slug}/cliente/documentos/${docAlheio}`)
      // Em produção a página com streaming responde 200 e o 404 chega depois:
      // espera a tela dizer, em vez de conferir antes de ela desenhar.
      if (tela?.status() !== 404) await expect(page.getByText(/could not be found/)).toBeVisible()
      await expect(page.getByText(TITULO)).toHaveCount(0)
      await chamarAcao(page, 'actions/documentos-portal.ts', 'assinarNoPortal', `/${slug}/cliente/documentos/${doc}`, [{
        id: docAlheio, assinatura: 'data:image/png;base64,AAAA', hashExibido: 'x', aceite: 'invasão',
      }])
      const pdf = await page.request.get(`/api/documentos/${docAlheio}/pdf`, { maxRedirects: 0 })
      expect(pdf.status()).toBe(404)
      // E a tela de EQUIPE do documento, no portal da unidade, não é do cliente.
      await page.goto(`/${slug}/documentos/${doc}/assinar`)
      await expect(page.getByRole('button', { name: 'Entregar ao cliente' })).toHaveCount(0)
    })
    expect((await db().from('issued_documents').select('status').eq('id', docAlheio).single()).data?.status).not.toBe('ASSINADO')
  })

  test('cliente sem acesso ao portal: o pedido é recusado com o caminho certo', async ({ browser }) => {
    const semPortal = await rede!.criarCliente('Sem portal')
    // CPF é único por rede: outro, válido, diferente do cliente do portal.
    const { error: eCpf } = await db().from('clients').update({ document: '11144477735' }).eq('id', semPortal)
    expect(eCpf).toBeNull()
    const d = await agendar(semPortal)
    await como(browser, gestor!.estado, async page => {
      const r = await chamarAcao(page, 'actions/documentos.ts', 'pedirAssinaturaNoPortal', `/admin/documentos/${d}/assinar`, [d])
      expect(r.texto).toContain('não tem acesso ao portal')
    })
    expect((await db().from('client_notifications').select('id').eq('client_id', semPortal)).data).toEqual([])
  })
})
