import { createHash } from 'node:crypto'
import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO, apagarConversas } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'
import { apagarDocumentosEmitidos } from './apoio/limpeza'
import { subirUazapiFalsa, type UazapiFalsa } from './apoio/uazapi-falsa'

/**
 * Termos e contratos — o link de assinatura pela conversa do inbox
 * (migration 20260930000006). Escolha da REDE, desligada de nascença.
 *
 * Numa rede `[e2e]`, com uma caixa uazapi FALSA (o envio roda inteiro, sucesso
 * incluído, sem mensagem chegar a ninguém):
 * - desligada, a action recusa e nada sai;
 * - quem é de uma unidade não liga a opção da rede;
 * - ligada pela tela, o link sai pela conversa do cliente, pela caixa DELA, e
 *   abre;
 * - janela de 24h fechada: não sai, e o link volta para copiar;
 * - cliente sem conversa: recusa sem gerar link (não revoga o que existe).
 */

const marca = Date.now().toString(36)
const db = () => banco()
const CPF_A = '52998224725'
const CPF_B = '11144477735'
const sufixo = String(Date.now()).slice(-8)
const TEL_B_CADASTRO = `(48) 9${sufixo.slice(0, 4)}-${sufixo.slice(4)}`
const TEL_B_CONVERSA = `55489${sufixo}`

let rede: OutraRede | null = null
let admin: MembroDeTeste | null = null
let daUnidade: MembroDeTeste | null = null
let falsa: UazapiFalsa | null = null
let caixa = ''
let oficial = ''
let slug = ''
const conversas: string[] = []
const clientes = { a: '', b: '', c: '' }

const sha = (t: string) => createHash('sha256').update(t, 'utf8').digest('hex')

async function como(browser: Browser, estado: string, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

async function agendar(clientId: string, dias = 1) {
  const { data: ag, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: clientId, procedure_id: rede!.procedureId, professional_id: rede!.professionalId,
    scheduled_at: new Date(Date.now() + dias * 86_400_000).toISOString(), duration_min: 30, price: 100, status: 'SCHEDULED',
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  const { data: d } = await db().from('issued_documents').select('id').eq('appointment_id', ag!.id).single<{ id: string }>()
  return d!.id
}

async function conversa(linha: Record<string, unknown>) {
  const agora = new Date().toISOString()
  const { data, error } = await db().from('conversations').insert({
    tenant_id: rede!.tenantId, status: 'open', channel: 'whatsapp', provider: 'uazapi', whatsapp_number_id: caixa,
    last_message_at: agora, last_message: 'oi', ...linha,
  }).select('id').single<{ id: string }>()
  expect(error, 'criar a conversa').toBeNull()
  conversas.push(data!.id)
  return data!.id
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`dc${marca}`)
  const { data: un } = await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()
  slug = un!.slug
  admin = await criarMembro(`dca${marca}`, {
    tenant: rede.tenantId, rotulo: 'Gerência documentos',
    permissoes: [{ modulo: 'forms', nivel: 'MANAGE' }, { modulo: 'documents', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'VIEW' }],
  })
  daUnidade = await criarMembro(`dcu${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Gerência da unidade',
    permissoes: [{ modulo: 'forms', nivel: 'MANAGE' }, { modulo: 'documents', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'VIEW' }],
  })
  const { data: m, error } = await db().rpc('documento_modelo_salvar', {
    p_tenant: rede.tenantId, p_modelo: null, p_nome: `${PREFIXO} Termo conversa ${marca}`, p_tipo: 'TERMO', p_origem: 'EDITOR',
    p_momento: 'AGENDAMENTO', p_exigencia: 'BLOQUEIA', p_texto: '# Termo\n\nEu, {{cliente.nome}}, autorizo.',
    p_arquivo_path: null, p_arquivo_sha256: null, p_arquivo_nome: null, p_arquivo_tamanho: null, p_arquivo_paginas: null,
    p_variaveis: [], p_usa_pagamento: false, p_ator: null,
  })
  expect(error).toBeNull()
  await db().from('procedures').update({ consent_template_id: (m as { id: string }).id }).eq('id', rede.procedureId)

  falsa = await subirUazapiFalsa()
  const { data: cx, error: eCx } = await db().from('whatsapp_numbers').insert({
    tenant_id: rede.tenantId, provider: 'uazapi', label: `${PREFIXO} Caixa documentos ${marca}`, is_active: true, is_default: true,
    config: { token: `e2e-doc-${marca}`, baseUrl: falsa.url },
  }).select('id').single<{ id: string }>()
  expect(eCx).toBeNull()
  caixa = cx!.id
  // Caixa OFICIAL para a janela de 24h (a uazapi não tem janela). Fechada, a
  // recusa vem antes de qualquer chamada: nada sai para a Meta.
  const pnid = `e2edoc${Date.now()}`
  const { data: of, error: eOf } = await db().from('whatsapp_numbers').insert({
    tenant_id: rede.tenantId, provider: 'official', label: `${PREFIXO} Oficial documentos ${marca}`, is_active: true,
    phone_number_id: pnid, config: { provider: 'official', phoneNumberId: pnid, accessToken: 'x', verifyToken: 'x', appSecret: 'x', graphBase: 'https://e2e.invalido' },
  }).select('id').single<{ id: string }>()
  expect(eOf).toBeNull()
  oficial = of!.id

  clientes.a = await rede.criarCliente('Conversa A')
  clientes.b = await rede.criarCliente('Conversa B')
  clientes.c = await rede.criarCliente('Sem conversa')
  const falhas = [
    (await db().from('clients').update({ document: CPF_A }).eq('id', clientes.a)).error,
    (await db().from('clients').update({ document: CPF_B, phone: TEL_B_CADASTRO }).eq('id', clientes.b)).error,
    (await db().from('clients').update({ document: '39053344705' }).eq('id', clientes.c)).error,
  ].filter(Boolean)
  expect(falhas).toEqual([])

  // A: ligada pelo client_id, janela aberta. B: achada só pelo telefone, janela fechada.
  const telA = `55479${sufixo}`
  await conversa({ client_id: clientes.a, contact_name: `${PREFIXO} A ${marca}`, contact_phone: telA, contact_external_id: telA,
    contact_aliases: [telA], last_inbound_at: new Date().toISOString() })
  await conversa({ provider: 'official', whatsapp_number_id: oficial, contact_name: `${PREFIXO} B ${marca}`, contact_phone: TEL_B_CONVERSA, contact_external_id: TEL_B_CONVERSA,
    contact_aliases: [TEL_B_CONVERSA], last_inbound_at: new Date(Date.now() - 2 * 86_400_000).toISOString() })
})

test.afterAll(async () => {
  await apagarConversas(conversas)
  if (rede) {
    const { data } = await db().from('issued_documents').select('id').eq('tenant_id', rede.tenantId)
    expect(await apagarDocumentosEmitidos((data ?? []).map(d => d.id as string))).toEqual([])
    const { error } = await db().from('whatsapp_numbers').delete().eq('tenant_id', rede.tenantId)
    expect(error).toBeNull()
  }
  await falsa?.fechar()
  await daUnidade?.limpar()
  await admin?.limpar()
  await rede?.limpar()
})

test.describe.serial('documentos: link pela conversa do inbox', () => {
  let docA = ''

  test('nasce desligada: sem botão, e a action recusa sem mandar nada', async ({ browser }) => {
    docA = await agendar(clientes.a)
    await como(browser, admin!.estado, async page => {
      await page.goto(`/admin/clients/${clientes.a}?aba=documentos`)
      const linha = page.locator(`[data-documento="${docA}"]`)
      await expect(linha.getByRole('button', { name: 'Enviar link' })).toBeVisible()
      await expect(linha.getByRole('button', { name: 'Enviar pela conversa' })).toHaveCount(0)
      const r = await chamarAcao(page, 'actions/documentos.ts', 'enviarLinkPelaConversa', `/admin/clients/${clientes.a}`, [docA])
      expect(r.texto).toContain('desligado nesta rede')
    })
    expect(falsa!.chamadas.filter(c => c.caminho.includes('send'))).toEqual([])
    expect((await db().from('document_sign_links').select('id').eq('issued_document_id', docA)).data).toEqual([])
  })

  test('quem é de uma unidade não liga a opção da rede', async ({ browser }) => {
    await como(browser, daUnidade!.estado, async page => {
      const r = await chamarAcao(page, 'actions/modelos-de-documento.ts', 'definirEnvioDoLinkPelaConversa', `/${slug}/settings?tab=documentos`, [true])
      expect(r.texto).toContain('rede inteira')
    })
    expect((await db().from('tenants').select('documentos_link_pela_conversa').eq('id', rede!.tenantId).single()).data)
      .toEqual({ documentos_link_pela_conversa: false })
  })

  test('ligada pela tela, o link sai pela conversa do cliente, pela caixa dela, e abre', async ({ browser, request }) => {
    await como(browser, admin!.estado, async page => {
      await page.goto('/admin/settings?tab=documentos')
      const secao = page.getByRole('region', { name: 'Envio do link de assinatura' })
      await secao.getByRole('button', { name: 'Também pela conversa' }).click()
      await expect(secao.getByText(/manda o link pelo WhatsApp da clínica/)).toBeVisible()
      await expect.poll(async () => (await db().from('tenants').select('documentos_link_pela_conversa').eq('id', rede!.tenantId).single()).data?.documentos_link_pela_conversa).toBe(true)

      await page.goto(`/admin/clients/${clientes.a}?aba=documentos`)
      const linha = page.locator(`[data-documento="${docA}"]`)
      await linha.getByRole('button', { name: 'Enviar pela conversa' }).click()
      await expect(page.getByText('Link enviado pela conversa do WhatsApp da clínica.')).toBeVisible()
    })

    const { data: msgs } = await db().from('messages').select('content, status, direction, whatsapp_number_id, sent_by_name')
      .eq('conversation_id', conversas[0]!)
    expect(msgs).toHaveLength(1)
    const msg = msgs![0]!
    expect(msg).toMatchObject({ status: 'sent', direction: 'outbound', whatsapp_number_id: caixa })
    expect(msg.content as string).not.toContain('Termo conversa')
    const token = /\/assinar\/([A-Za-z0-9_-]{43})/.exec(msg.content as string)?.[1]
    expect(token, 'a mensagem leva o link').toBeTruthy()
    const enviadas = falsa!.chamadas.filter(c => c.caminho.includes('send'))
    expect(enviadas).toHaveLength(1)
    expect(JSON.stringify(enviadas[0]!.corpo)).toContain(token!)

    const { data: link } = await db().from('document_sign_links').select('token_hash').eq('issued_document_id', docA).is('revoked_at', null).single()
    expect(link!.token_hash).toBe(sha(token!))
    const { data: ev } = await db().from('issued_document_events').select('details').eq('issued_document_id', docA).eq('kind', 'LINK_ENVIADO_CONVERSA')
    expect(ev).toEqual([{ details: { conversa: conversas[0] } }])

    const abre = await request.post('/api/assinar/abrir', { data: { token, cpf: CPF_A }, headers: { 'x-real-ip': '198.51.100.250' } })
    expect(abre.status(), 'o link enviado abre').toBe(200)
  })

  test('janela de 24h fechada: não sai, e o link volta para copiar', async ({ browser }) => {
    const docB = await agendar(clientes.b)
    const antes = falsa!.chamadas.length
    await como(browser, admin!.estado, async page => {
      await page.goto(`/admin/clients/${clientes.b}?aba=documentos`)
      const linha = page.locator(`[data-documento="${docB}"]`)
      await linha.getByRole('button', { name: 'Enviar pela conversa' }).click()
      await expect(page.getByText(/Não foi pela conversa: .*O link foi gerado/)).toBeVisible()
      await expect(linha.getByLabel('Link de assinatura')).toBeVisible()
    })
    expect(falsa!.chamadas.length, 'nada saiu').toBe(antes)
    expect((await db().from('messages').select('id').eq('conversation_id', conversas[1]!)).data, 'a conversa achada pelo telefone não ganhou mensagem').toEqual([])
    const { data: links } = await db().from('document_sign_links').select('id').eq('issued_document_id', docB)
    expect(links).toHaveLength(1)
  })

  test('cliente sem conversa: recusa sem gerar link', async ({ browser }) => {
    const docC = await agendar(clientes.c)
    await como(browser, admin!.estado, async page => {
      const r = await chamarAcao(page, 'actions/documentos.ts', 'enviarLinkPelaConversa', `/admin/clients/${clientes.c}`, [docC])
      expect(r.texto).toContain('não tem conversa aberta')
    })
    expect((await db().from('document_sign_links').select('id').eq('issued_document_id', docC)).data).toEqual([])
  })
})
