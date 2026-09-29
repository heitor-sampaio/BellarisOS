import { createHash, randomBytes } from 'node:crypto'
import { test, expect, type Browser, type Page, type APIRequestContext } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'
import { apagarDocumentosEmitidos } from './apoio/limpeza'

/**
 * Termos e contratos — fase 6: o link público de assinatura
 * (migration 20260930000005).
 *
 * Numa rede `[e2e]`. A equipe gera o link na ficha; o cliente o abre SEM
 * sessão (contexto vazio — logado, a página abriria de qualquer forma),
 * confirma o CPF e assina. Em volta, o que o link não pode deixar passar:
 * CPF errado cinco vezes, link vencido, revogado ou já usado, o hash de outro
 * documento, o limite por IP, e a sessão de um membro lendo a tabela dos links.
 *
 * O IP das chamadas diretas vai no `x-real-ip` (o que a borda do Railway
 * escreve), com endereços de documentação (198.51.100.0/24): o limite por IP
 * de um teste não bloqueia ninguém de verdade.
 */

const marca = Date.now().toString(36)
const db = () => banco()
const CPF = '52998224725'
const NOME = `${PREFIXO} Link Cliente ${marca}`
const TITULO = `${PREFIXO} Termo toxina link ${marca}`
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const IP_BASE = 100 + Math.floor(Math.random() * 100)
const ip = (n: number) => ({ 'x-real-ip': `198.51.100.${(IP_BASE + n) % 255}` })

let rede: OutraRede | null = null
let gestor: MembroDeTeste | null = null
let clienteCpf = ''
let clienteNasc = ''
let clienteSemNada = ''

const sha = (t: string) => createHash('sha256').update(t, 'utf8').digest('hex')

async function agendar(clientId: string, dias = 1) {
  const { data: ag, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: clientId, procedure_id: rede!.procedureId, professional_id: rede!.professionalId,
    scheduled_at: new Date(Date.now() + dias * 86_400_000).toISOString(), duration_min: 30, price: 100, status: 'SCHEDULED',
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  const { data: d } = await db().from('issued_documents').select('id').eq('appointment_id', ag!.id).single<{ id: string }>()
  return d!.id
}

/**
 * Gera o link pela action, como a equipe (ela monta o texto antes: o documento
 * recém-emitido ainda está A_GERAR). `vencido` recua a validade no banco.
 */
async function linkDireto(browser: Browser, doc: string, clientId: string, vencido = false) {
  let token = ''
  await como(browser, gestor!.estado, async page => {
    const r = await chamarAcao(page, 'actions/documentos.ts', 'gerarLinkDeAssinatura', `/admin/clients/${clientId}`, [doc])
    token = /\/assinar\/([A-Za-z0-9_-]{43})/.exec(r.texto)?.[1] ?? ''
  })
  expect(token, 'a action devolveu o link').not.toBe('')
  const { data: link } = await db().from('document_sign_links').select('id').eq('token_hash', sha(token)).single<{ id: string }>()
  if (vencido) {
    const { error } = await db().from('document_sign_links').update({ expires_at: new Date(Date.now() - 60_000).toISOString() }).eq('id', link!.id)
    expect(error).toBeNull()
  }
  return { token, id: link!.id }
}

async function hashDoDocumento(doc: string, request: APIRequestContext, token: string, cpf = CPF, n = 0) {
  const r = await request.post('/api/assinar/abrir', { data: { token, cpf }, headers: ip(n) })
  expect(r.status()).toBe(200)
  const { doc: d } = await r.json() as { doc: { id: string; conteudo: string } }
  expect(d.id).toBe(doc)
  return createHash('sha256').update(d.conteudo, 'utf8').digest('hex')
}

async function semSessao(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

async function como(browser: Browser, estado: string, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`dl${marca}`)
  gestor = await criarMembro(`dlg${marca}`, {
    tenant: rede.tenantId, rotulo: 'Recepção link',
    permissoes: [{ modulo: 'documents', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'VIEW' }],
  })
  const { data: m, error } = await db().rpc('documento_modelo_salvar', {
    p_tenant: rede.tenantId, p_modelo: null, p_nome: TITULO, p_tipo: 'TERMO', p_origem: 'EDITOR',
    p_momento: 'AGENDAMENTO', p_exigencia: 'BLOQUEIA', p_texto: '# Termo\n\nEu, {{cliente.nome}}, autorizo {{procedimento.nome}}.\n\n[[assinatura]]',
    p_arquivo_path: null, p_arquivo_sha256: null, p_arquivo_nome: null, p_arquivo_tamanho: null, p_arquivo_paginas: null,
    p_variaveis: [], p_usa_pagamento: false, p_ator: null,
  })
  expect(error).toBeNull()
  await db().from('procedures').update({ consent_template_id: (m as { id: string }).id }).eq('id', rede.procedureId)

  clienteCpf = await rede.criarCliente('Link CPF')
  clienteNasc = await rede.criarCliente('Link Nascimento')
  clienteSemNada = await rede.criarCliente('Link Sem Nada')
  const falhas = [
    (await db().from('clients').update({ name: NOME, document: CPF, phone: '(11) 98888-7777' }).eq('id', clienteCpf)).error,
    (await db().from('clients').update({ document: null, birth_date: '1990-05-17T00:00:00Z' }).eq('id', clienteNasc)).error,
    (await db().from('clients').update({ document: null, birth_date: null }).eq('id', clienteSemNada)).error,
  ].filter(Boolean)
  expect(falhas).toEqual([])
})

test.afterAll(async () => {
  if (rede) {
    const { data } = await db().from('issued_documents').select('id').eq('tenant_id', rede.tenantId)
    expect(await apagarDocumentosEmitidos((data ?? []).map(d => d.id as string))).toEqual([])
  }
  await gestor?.limpar()
  await rede?.limpar()
})

test.describe.serial('documentos: link público de assinatura', () => {
  let doc = ''
  let token = ''

  test('a equipe gera o link na ficha: só o hash vai para o banco, e o WhatsApp sai pronto', async ({ browser }) => {
    doc = await agendar(clienteCpf)
    await como(browser, gestor!.estado, async page => {
      await page.goto(`/admin/clients/${clienteCpf}?aba=documentos`)
      const linha = page.locator(`[data-documento="${doc}"]`)
      await linha.getByRole('button', { name: 'Enviar link' }).click()
      const campo = linha.getByLabel('Link de assinatura')
      await expect(campo).toBeVisible()
      const url = await campo.inputValue()
      expect(url).toMatch(/\/assinar\/[A-Za-z0-9_-]{43}$/)
      token = url.split('/assinar/')[1]!
      const wa = await linha.getByRole('link', { name: 'Abrir no WhatsApp' }).getAttribute('href')
      expect(wa).toContain('https://wa.me/5511988887777?text=')
      const texto = decodeURIComponent(wa!.split('text=')[1]!)
      expect(texto).toContain(url)
      expect(texto, 'a prévia do WhatsApp não diz o documento').not.toContain('toxina')
    })
    const { data: links } = await db().from('document_sign_links').select('token_hash, used_at, revoked_at').eq('issued_document_id', doc)
    expect(links).toHaveLength(1)
    expect(links![0]!.token_hash).toBe(sha(token))
    expect(JSON.stringify(links), 'o token não está no banco').not.toContain(token)
    const { data: ev } = await db().from('issued_document_events').select('kind').eq('issued_document_id', doc).eq('kind', 'LINK_GERADO')
    expect(ev).toHaveLength(1)
  })

  test('sem sessão: antes do CPF nada do documento; CPF errado conta; o certo abre, assina e consome o link', async ({ browser }) => {
    await semSessao(browser, async page => {
      await page.goto(`/assinar/${token}`)
      await expect(page.getByRole('heading', { name: /pediu a sua assinatura em um documento/ })).toBeVisible()
      await expect(page.getByText(TITULO)).toHaveCount(0)
      await expect(page.getByText(NOME)).toHaveCount(0)
      expect(await page.locator('meta[name="robots"]').getAttribute('content')).toContain('noindex')
      expect(await page.locator('meta[name="referrer"]').getAttribute('content')).toBe('no-referrer')

      await page.getByLabel('CPF').fill('111.444.777-35')
      await page.getByRole('button', { name: 'Continuar' }).click()
      await expect(page.getByText(/Os dados não conferem com o cadastro\. Restam 4 tentativas/)).toBeVisible()

      await page.getByLabel('CPF').fill('529.982.247-25')
      await page.getByRole('button', { name: 'Continuar' }).click()
      await expect(page.getByText(`Eu, ${NOME}, autorizo`, { exact: false })).toBeVisible()
      await page.getByText(/li e concordo com este documento/).click()
      const quadro = page.locator('canvas').last()
      const caixa = (await quadro.boundingBox())!
      await page.mouse.move(caixa.x + 40, caixa.y + 60); await page.mouse.down()
      for (const [x, y] of [[140, 40], [240, 110], [360, 50]]) await page.mouse.move(caixa.x + x!, caixa.y + y!, { steps: 5 })
      await page.mouse.up()
      await page.getByRole('button', { name: 'Confirmar assinatura' }).click()
      await page.getByRole('button', { name: 'Assinar documento' }).click()
      await expect(page.getByRole('heading', { name: 'Documento assinado' })).toBeVisible()
      await expect(page.getByRole('link', { name: 'Conferir a assinatura' })).toBeVisible()

      // O mesmo link, de novo: já foi usado.
      await page.goto(`/assinar/${token}`)
      await expect(page.getByRole('heading', { name: 'Documento já assinado' })).toBeVisible()
    })
    const { data: assinatura } = await db().from('document_signatures')
      .select('channel, identity_method, conducted_by, signer_document, link_id').eq('issued_document_id', doc).single()
    const { data: link } = await db().from('document_sign_links').select('id, used_at, failed_attempts').eq('issued_document_id', doc).single()
    expect(assinatura).toEqual({ channel: 'LINK', identity_method: 'CPF', conducted_by: null, signer_document: CPF, link_id: link!.id })
    expect(link!.used_at).not.toBeNull()
    expect(link!.failed_attempts).toBe(1)
    const { data: evs } = await db().from('issued_document_events').select('kind').eq('issued_document_id', doc)
    const tipos = (evs ?? []).map(e => e.kind)
    expect(tipos).toEqual(expect.arrayContaining(['IDENTIDADE_FALHOU', 'IDENTIDADE_OK', 'ASSINADO']))
    await expect.poll(async () => (await db().from('issued_documents').select('signed_pdf_path').eq('id', doc).single()).data?.signed_pdf_path,
      { timeout: 30_000 }).toBeTruthy()
  })

  test('cinco CPFs errados revogam o link, e o certo depois não abre mais', async ({ browser, request }) => {
    const d = await agendar(clienteCpf, 2)
    const { token: t } = await linkDireto(browser, d, clienteCpf)
    for (let i = 1; i <= 4; i++) {
      const r = await request.post('/api/assinar/abrir', { data: { token: t, cpf: '11144477735' }, headers: ip(1) })
      expect(r.status(), `tentativa ${i}`).toBe(403)
    }
    const quinta = await request.post('/api/assinar/abrir', { data: { token: t, cpf: '11144477735' }, headers: ip(1) })
    expect(quinta.status()).toBe(410)
    expect((await quinta.json()).erro).toContain('não vale mais')
    const certo = await request.post('/api/assinar/abrir', { data: { token: t, cpf: CPF }, headers: ip(1) })
    expect(certo.status()).toBe(410)
    const { data: link } = await db().from('document_sign_links').select('revoked_at, failed_attempts').eq('issued_document_id', d).single()
    expect(link!.failed_attempts).toBe(5)
    expect(link!.revoked_at).not.toBeNull()
  })

  test('vencido e revogado pela equipe: a página diz o porquê, e a assinatura é recusada', async ({ browser, request }) => {
    const d = await agendar(clienteCpf, 3)
    const vencido = await linkDireto(browser, d, clienteCpf, true)
    await semSessao(browser, async page => {
      await page.goto(`/assinar/${vencido.token}`)
      await expect(page.getByText('Este link venceu.', { exact: false })).toBeVisible()
      await page.goto(`/assinar/${randomBytes(32).toString('base64url')}`)
      await expect(page.getByText('Este link não existe.', { exact: false })).toBeVisible()
    })

    const ativo = await linkDireto(browser, d, clienteCpf)
    const hash = await hashDoDocumento(d, request, ativo.token, CPF, 2)
    await como(browser, gestor!.estado, async page => {
      const r = await chamarAcao(page, 'actions/documentos.ts', 'revogarLinkDeAssinatura', `/admin/clients/${clienteCpf}`, [d])
      expect(r.status).toBe(200)
    })
    await semSessao(browser, async page => {
      await page.goto(`/assinar/${ativo.token}`)
      await expect(page.getByText('Este link não vale mais.', { exact: false })).toBeVisible()
    })
    const r = await request.post('/api/assinar/assinar', {
      data: { token: ativo.token, cpf: CPF, assinatura: PNG, hashExibido: hash, aceite: 'teste' }, headers: ip(2),
    })
    expect(r.status()).toBe(410)
    expect((await db().from('issued_documents').select('status').eq('id', d).single()).data?.status).toBe('PENDENTE')
  })

  test('o token de um documento com o hash de OUTRO: recusado, e nenhum dos dois é assinado', async ({ browser, request }) => {
    const a = await agendar(clienteCpf, 4)
    const b = await agendar(clienteCpf, 5)
    const la = await linkDireto(browser, a, clienteCpf)
    const lb = await linkDireto(browser, b, clienteCpf)
    await db().from('clients').update({ name: `${NOME} B` }).eq('id', clienteCpf)
    const hashB = await hashDoDocumento(b, request, lb.token, CPF, 3)
    await db().from('clients').update({ name: NOME }).eq('id', clienteCpf)
    await hashDoDocumento(a, request, la.token, CPF, 3)
    const r = await request.post('/api/assinar/assinar', {
      data: { token: la.token, cpf: CPF, assinatura: PNG, hashExibido: hashB, aceite: 'teste' }, headers: ip(3),
    })
    expect(r.status()).toBe(409)
    expect((await r.json()).erro).toContain('O documento mudou')
    const { data } = await db().from('issued_documents').select('status').in('id', [a, b])
    expect((data ?? []).map(x => x.status)).toEqual(['PENDENTE', 'PENDENTE'])
    const { data: usados } = await db().from('document_sign_links').select('id').in('issued_document_id', [a, b]).not('used_at', 'is', null)
    expect(usados, 'o link não foi consumido').toEqual([])
  })

  test('sem CPF, a data de nascimento; sem nenhum dos dois, o link não é gerado', async ({ browser }) => {
    const d = await agendar(clienteNasc)
    const { token: t } = await linkDireto(browser, d, clienteNasc)
    await semSessao(browser, async page => {
      await page.goto(`/assinar/${t}`)
      await expect(page.getByText('confirme a sua data de nascimento', { exact: false })).toBeVisible()
      await page.getByLabel('Data de nascimento').fill('1990-05-18')
      await page.getByRole('button', { name: 'Continuar' }).click()
      await expect(page.getByText(/Os dados não conferem/)).toBeVisible()
      await page.getByLabel('Data de nascimento').fill('1990-05-17')
      await page.getByRole('button', { name: 'Continuar' }).click()
      await expect(page.getByText(/li e concordo com este documento/)).toBeVisible()
    })

    const semNada = await agendar(clienteSemNada)
    await como(browser, gestor!.estado, async page => {
      const r = await chamarAcao(page, 'actions/documentos.ts', 'gerarLinkDeAssinatura', `/admin/clients/${clienteSemNada}`, [semNada])
      expect(r.texto).toContain('não tem CPF nem data de nascimento')
    })
    expect((await db().from('document_sign_links').select('id').eq('issued_document_id', semNada)).data).toEqual([])
  })

  test('limite por IP: 20 erros na hora param aquele IP, mesmo com o CPF certo', async ({ browser, request }) => {
    const d = await agendar(clienteCpf, 6)
    const { token: t, id: link } = await linkDireto(browser, d, clienteCpf)
    const endereco = ip(4)['x-real-ip']
    const { error } = await db().from('document_link_attempts')
      .insert(Array.from({ length: 20 }, () => ({ link_id: link, ip: endereco, ok: false })))
    expect(error).toBeNull()
    const barrado = await request.post('/api/assinar/abrir', { data: { token: t, cpf: CPF }, headers: ip(4) })
    expect(barrado.status()).toBe(429)
    const outroIp = await request.post('/api/assinar/abrir', { data: { token: t, cpf: CPF }, headers: ip(5) })
    expect(outroIp.status(), 'controle: de outro IP abre').toBe(200)
  })

  test('quem só VÊ documentos não gera nem revoga link', async ({ browser }) => {
    const d = await agendar(clienteCpf, 7)
    const leitor = await criarMembro(`dll${marca}`, {
      tenant: rede!.tenantId, rotulo: 'Só vê documentos',
      permissoes: [{ modulo: 'documents', nivel: 'VIEW' }, { modulo: 'clients', nivel: 'VIEW' }],
    })
    try {
      await como(browser, leitor.estado, async page => {
        const r = await chamarAcao(page, 'actions/documentos.ts', 'gerarLinkDeAssinatura', `/admin/clients/${clienteCpf}`, [d])
        expect(r.texto).not.toMatch(/\/assinar\/[A-Za-z0-9_-]{43}/)
      })
      expect((await db().from('document_sign_links').select('id').eq('issued_document_id', d)).data, 'nenhum link nasceu').toEqual([])
      // Controle: o gestor, no mesmo documento, gera.
      await linkDireto(browser, d, clienteCpf)
      await como(browser, leitor.estado, async page => {
        await chamarAcao(page, 'actions/documentos.ts', 'revogarLinkDeAssinatura', `/admin/clients/${clienteCpf}`, [d])
      })
      const { data: ativo } = await db().from('document_sign_links').select('id').eq('issued_document_id', d).is('revoked_at', null)
      expect(ativo, 'o link continua valendo').toHaveLength(1)
    } finally {
      await leitor.limpar()
    }
  })

  test('a sessão de um membro não lê os links nem chama as funções do link', async () => {
    const sessao = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${gestor!.accessToken}` } },
    })
    const { data: links } = await sessao.from('document_sign_links').select('token_hash')
    expect(links ?? []).toEqual([])
    const { data: tentativas } = await sessao.from('document_link_attempts').select('ip')
    expect(tentativas ?? []).toEqual([])
    const { error } = await sessao.rpc('documento_link_criar', {
      p_doc: doc, p_tenant: rede!.tenantId, p_token_hash: sha('x'), p_expira: new Date().toISOString(), p_ator: null,
    })
    expect(error, 'a função não é da sessão').not.toBeNull()
    // Controle: a mesma sessão lê os documentos da rede dela.
    const { data: docs } = await sessao.from('issued_documents').select('id').eq('id', doc)
    expect(docs).toHaveLength(1)
  })
})
