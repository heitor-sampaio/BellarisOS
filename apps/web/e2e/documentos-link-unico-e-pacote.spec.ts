import { createHash } from 'node:crypto'
import { test, expect, type Browser, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, clienteComSessao, type MembroDeTeste, type ClienteDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'
import { apagarDocumentosEmitidos } from './apoio/limpeza'

/**
 * Bloco Documentos, leva 2 (2026-11-14) — a revisão do Heitor de 13/11:
 * - DC3/AG1/PC10: uma assinatura para todos, em todo canal. O link é UM por
 *   cliente e momento (o agendamento, o pacote vendido, o plano), com todos
 *   os documentos abertos dele; a cliente abre cada um, marca o aceite que diz
 *   os títulos e assina uma vez — cada documento com a sua evidência (a mesma
 *   imagem, o hash DELE), o seu PDF e o seu código. O que tem "faltam dados"
 *   não entra, e a tela diz qual falta. O aparelho na clínica e o portal
 *   fazem o mesmo.
 * - PC2: a venda do pacote emite o contrato de pacote (com `pacote.*` e
 *   `pagamento.*` da venda) e os documentos puxados dos procedimentos que
 *   ficaram; a venda não espera a assinatura (princípios 2 e 6).
 * - DC1c/PC9b: o pop-up do pacote lista o contrato de pacote e os documentos
 *   puxados, cada um com "Excluir"; a exclusão fica gravada no pacote.
 *
 * Numa rede [e2e] própria.
 */

const marca = Date.now().toString(36)
const db = () => banco()
const CPF = '52998224725'
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const IP_BASE = 100 + Math.floor(Math.random() * 100)
const ip = (n: number) => ({ 'x-real-ip': `198.51.100.${(IP_BASE + n) % 255}` })
const sha = (t: string) => createHash('sha256').update(t, 'utf8').digest('hex')

const NOME = {
  cliente:  `${PREFIXO} Cliente Unico ${marca}`,
  termo:    `${PREFIXO} Termo lu ${marca}`,
  imagem:   `${PREFIXO} Uso de imagem lu ${marca}`,
  endereco: `${PREFIXO} Declaracao endereco lu ${marca}`,
  contrato: `${PREFIXO} Contrato proc lu ${marca}`,
  termoB:   `${PREFIXO} Termo B lu ${marca}`,
  pacote:   `${PREFIXO} Pacote lu ${marca}`,
}

let rede: OutraRede | null = null
let gestor: MembroDeTeste | null = null
let portal: ClienteDeTeste | null = null
let cliente = ''
let outraCliente = ''
let procB = ''
let pacote = ''
let vendido = ''
const modelos = { termo: '', imagem: '', endereco: '', contrato: '', termoB: '', pacote: '' }

async function modelo(nome: string, tipo: string, texto: string, usaPagamento = false) {
  const { data, error } = await db().rpc('documento_modelo_salvar', {
    p_tenant: rede!.tenantId, p_modelo: null, p_nome: nome, p_tipo: tipo, p_origem: 'EDITOR',
    p_momento: null, p_exigencia: 'AVISA', p_texto: texto,
    p_arquivo_path: null, p_arquivo_sha256: null, p_arquivo_nome: null, p_arquivo_tamanho: null, p_arquivo_paginas: null,
    p_variaveis: [], p_usa_pagamento: usaPagamento, p_ator: null,
  })
  expect(error, `criar o modelo ${nome}`).toBeNull()
  return (data as { id: string }).id
}

async function agendar(clientId: string, dias: number) {
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: clientId, procedure_id: rede!.procedureId, professional_id: rede!.professionalId,
    scheduled_at: new Date(Date.now() + dias * 86_400_000).toISOString(), duration_min: 30, price: 100, status: 'SCHEDULED',
  }).select('id').single<{ id: string }>()
  expect(error, 'agendar').toBeNull()
  const docs = ((await db().from('issued_documents').select('id, template_id').eq('appointment_id', data!.id)).data ?? []) as { id: string; template_id: string }[]
  const de = (t: string) => docs.find(d => d.template_id === t)!.id
  return { ap: data!.id, termo: de(modelos.termo), imagem: de(modelos.imagem), endereco: de(modelos.endereco), contrato: de(modelos.contrato) }
}

async function como<T>(browser: Browser, estado: string, fn: (p: Page) => Promise<T>) {
  const ctx = await browser.newContext({ storageState: estado })
  try { return await fn(await ctx.newPage()) } finally { await ctx.close() }
}

async function semSessao(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

/** O link pela action, como a equipe: o token sai da resposta. */
async function gerarLink(browser: Browser, doc: string, clientId: string): Promise<string> {
  const token = await como(browser, gestor!.estado, async p => {
    const r = await chamarAcao(p, 'actions/documentos.ts', 'gerarLinkDeAssinatura', `/admin/clients/${clientId}`, [doc])
    return /\/assinar\/([A-Za-z0-9_-]{43})/.exec(r.texto)?.[1] ?? ''
  })
  expect(token, 'a action devolveu o link').not.toBe('')
  return token
}

const linhasDoLink = async (token: string) =>
  ((await db().from('document_sign_links').select('id, issued_document_id, used_at, revoked_at, failed_attempts').eq('token_hash', sha(token))).data ?? []) as
    { id: string; issued_document_id: string; used_at: string | null; revoked_at: string | null; failed_attempts: number }[]

async function assinarNoQuadro(p: Page) {
  const quadro = p.locator('canvas').last()
  await quadro.scrollIntoViewIfNeeded()
  const caixa = (await quadro.boundingBox())!
  await p.mouse.move(caixa.x + 40, caixa.y + 60); await p.mouse.down()
  for (const [x, y] of [[140, 40], [240, 110], [360, 50]]) await p.mouse.move(caixa.x + x!, caixa.y + y!, { steps: 5 })
  await p.mouse.up()
}

/** Na lista de "assinar juntos": abre cada documento, marca o aceite e assina. */
async function lerTodosEAssinar(p: Page, titulos: string[]) {
  const botao = p.getByRole('button', { name: `Assinar os ${titulos.length} documentos` })
  await expect(botao).toBeDisabled()
  await expect(p.locator('[data-falta-para-assinar]')).toContainText('abrir')
  for (const t of titulos) await p.getByRole('button', { name: `Ler ${t}` }).click()
  const aceite = p.getByText(/li e concordo com os documentos:/)
  for (const t of titulos) await expect(aceite).toContainText(t)
  await aceite.click()
  await assinarNoQuadro(p)
  await botao.click()
  await expect(p.getByRole('heading', { name: 'Documentos assinados' })).toBeVisible({ timeout: 20_000 })
}

const statusDe = async (ids: string[]) => Object.fromEntries((((await db().from('issued_documents').select('id, status').in('id', ids)).data ?? []) as { id: string; status: string }[]).map(d => [d.id, d.status]))

test.beforeAll(async () => {
  test.setTimeout(180_000)
  rede = await criarOutraRede(`lu${marca}`)
  expect((await db().from('users').update({ provides_services: true, branch_id: rede.branchId }).eq('id', rede.professionalId)).error).toBeNull()
  expect((await db().rpc('documentos_modelos_padrao', { p_tenant: rede.tenantId })).error).toBeNull()
  modelos.pacote = ((await db().from('document_templates').select('id').eq('tenant_id', rede.tenantId).eq('kind', 'CONTRATO_PACOTE').eq('is_active', true).single()).data!.id) as string
  modelos.termo = await modelo(NOME.termo, 'TERMO', '# Termo\n\nEu, **{{cliente.nome}}**, autorizo.\n\n[[assinatura]]')
  modelos.imagem = await modelo(NOME.imagem, 'DOCUMENTO', '# Uso de imagem\n\n{{cliente.nome}} autoriza o uso da imagem.\n\n[[assinatura]]')
  // Pede o endereço, que a ficha não tem: nasce com "faltam dados".
  modelos.endereco = await modelo(NOME.endereco, 'DOCUMENTO', '# Declaração\n\n{{cliente.nome}} mora em {{cliente.endereco}}.\n\n[[assinatura]]')
  // Cita o pagamento: sem ele combinado, o contrato do procedimento fica com "faltam dados".
  modelos.contrato = await modelo(NOME.contrato, 'CONTRATO', '# Contrato\n\n{{cliente.nome}} paga {{pagamento.forma}}.\n\n[[assinatura]]', true)
  modelos.termoB = await modelo(NOME.termoB, 'TERMO', '# Termo B\n\n{{cliente.nome}} autoriza.\n\n[[assinatura]]')
  expect((await db().from('procedures').update({
    consent_template_id: modelos.termo, contract_template_id: modelos.contrato, outros_documentos: [modelos.imagem, modelos.endereco], price: 300,
  }).eq('id', rede.procedureId)).error).toBeNull()
  const { data: b, error: eB } = await db().from('procedures').insert({
    tenant_id: rede.tenantId, name: `${PREFIXO} Proc B lu ${marca}`, category: 'e2e', duration_min: 30, price: 100, consent_template_id: modelos.termoB,
  }).select('id').single<{ id: string }>()
  expect(eB).toBeNull()
  procB = b!.id

  cliente = await rede.criarCliente('Unico')
  outraCliente = await rede.criarCliente('Outra')
  expect((await db().from('clients').update({ name: NOME.cliente, document: CPF }).eq('id', cliente)).error).toBeNull()
  expect((await db().from('clients').update({ document: '11144477735' }).eq('id', outraCliente)).error).toBeNull()

  gestor = await criarMembro(`lug${marca}`, {
    tenant: rede.tenantId, branchId: null, rotulo: 'Documentos e vendas',
    permissoes: [
      { modulo: 'documents', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'procedures', nivel: 'MANAGE' },
      { modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'financial', nivel: 'MANAGE' }, { modulo: 'cashier', nivel: 'MANAGE' },
    ],
  })
})

test.afterAll(async () => {
  if (rede) {
    const { data } = await db().from('issued_documents').select('id').eq('tenant_id', rede.tenantId)
    expect(await apagarDocumentosEmitidos((data ?? []).map(d => d.id as string))).toEqual([])
  }
  await portal?.limpar()
  await gestor?.limpar()
  // O resto (agendamentos, pacotes, modelos) sai com a rede.
  await rede?.limpar()
})

test.describe.serial('documentos: o link único, uma assinatura para todos e o pacote', () => {
  let token = ''
  let docs: Awaited<ReturnType<typeof agendar>> | null = null

  test('DC3: o link é um só para o agendamento — leva os abertos prontos; o de "faltam dados" fica de fora e a tela diz qual falta', async ({ browser }) => {
    docs = await agendar(cliente, 1)
    // O contrato do procedimento espera o pagamento: fica de fora também.
    await como(browser, gestor!.estado, async p => {
      await p.goto(`/admin/clients/${cliente}?aba=documentos`)
      const linha = p.locator(`[data-documento="${docs!.termo}"]`)
      await linha.getByRole('button', { name: 'Enviar link' }).click()
      const painel = p.locator('[data-link-de-assinatura]')
      const campo = painel.getByLabel('Link de assinatura')
      await expect(campo).toBeVisible({ timeout: 20_000 })
      token = (await campo.inputValue()).split('/assinar/')[1]!
      await expect(painel.locator('[data-vai-no-link]')).toContainText(NOME.termo)
      await expect(painel.locator('[data-vai-no-link]')).toContainText(NOME.imagem)
      const fora = painel.locator('[data-fora-do-link]')
      await expect(fora).toContainText(NOME.endereco)
      await expect(fora).toContainText(/Endereço/)
      await expect(fora).toContainText(NOME.contrato)
    })
    const linhas = await linhasDoLink(token)
    expect(linhas.map(l => l.issued_document_id).sort()).toEqual([docs.termo, docs.imagem].sort())
    expect((await statusDe([docs.endereco]))[docs.endereco]).toBe('INCOMPLETO')
  })

  test('DC3: sem sessão, a cliente vê a lista, abre cada um, marca o aceite com os títulos e assina UMA vez — cada documento com a sua evidência', async ({ browser }) => {
    await semSessao(browser, async p => {
      await p.goto(`/assinar/${token}`)
      await expect(p.getByRole('heading', { name: /pediu a sua assinatura em 2 documentos/ })).toBeVisible()
      await expect(p.getByText(NOME.termo)).toHaveCount(0)
      await p.getByLabel('CPF').fill('529.982.247-25')
      await p.getByRole('button', { name: 'Continuar' }).click()
      await lerTodosEAssinar(p, [NOME.termo, NOME.imagem])
      await p.goto(`/assinar/${token}`)
      await expect(p.getByRole('heading', { name: /já assinado/ })).toBeVisible()
    })
    const assinaturas = ((await db().from('document_signatures')
      .select('issued_document_id, channel, identity_method, content_sha256, signature_sha256, link_id, accepted_text')
      .in('issued_document_id', [docs!.termo, docs!.imagem])).data ?? []) as
      { issued_document_id: string; channel: string; identity_method: string; content_sha256: string; signature_sha256: string; link_id: string; accepted_text: string }[]
    expect(assinaturas).toHaveLength(2)
    const emitidos = ((await db().from('issued_documents').select('id, status, content_sha256, verification_code').in('id', [docs!.termo, docs!.imagem])).data ?? []) as
      { id: string; status: string; content_sha256: string; verification_code: string }[]
    for (const e of emitidos) {
      const a = assinaturas.find(x => x.issued_document_id === e.id)!
      expect(e.status).toBe('ASSINADO')
      expect(a.content_sha256, 'o hash DELE').toBe(e.content_sha256)
      expect(a).toMatchObject({ channel: 'LINK', identity_method: 'CPF' })
      expect(a.accepted_text).toContain(NOME.termo)
      expect(a.accepted_text).toContain(NOME.imagem)
    }
    expect(new Set(assinaturas.map(a => a.signature_sha256)).size, 'a mesma imagem').toBe(1)
    expect(new Set(emitidos.map(e => e.verification_code)).size, 'um código para cada').toBe(2)
    const linhas = await linhasDoLink(token)
    expect(new Set(assinaturas.map(a => a.link_id))).toEqual(new Set(linhas.map(l => l.id)))
    expect(linhas.every(l => l.used_at)).toBe(true)
    expect((await statusDe([docs!.endereco]))[docs!.endereco], 'o de faltam dados segue esperando').toBe('INCOMPLETO')
    // Cada um com o seu PDF.
    await expect.poll(async () => ((await db().from('issued_documents').select('signed_pdf_path').in('id', [docs!.termo, docs!.imagem])).data ?? [])
      .filter(d => d.signed_pdf_path).length, { timeout: 40_000 }).toBe(2)
  })

  test('DC3: a segurança vale para o link inteiro — documento de fora não entra, e cinco CPFs errados derrubam todos', async ({ browser, request }) => {
    const d = await agendar(cliente, 2)
    const t = await gerarLink(browser, d.termo, cliente)
    const deOutra = (await agendar(outraCliente, 2)).termo
    const r = await request.post('/api/assinar/abrir', { data: { token: t, cpf: CPF }, headers: ip(1) })
    expect(r.status()).toBe(200)
    const aberto = await r.json() as { documentos: { id: string; conteudo: string }[] }
    expect(aberto.documentos.map(x => x.id).sort()).toEqual([d.termo, d.imagem].sort())
    const itens = aberto.documentos.map(x => ({ id: x.id, hashExibido: sha(x.conteudo) }))
    // O id de um documento de outra cliente no meio: recusado, nada assinado.
    const intruso = await request.post('/api/assinar/assinar', {
      data: { token: t, cpf: CPF, assinatura: PNG, itens: [...itens, { id: deOutra, hashExibido: 'x' }] }, headers: ip(1),
    })
    expect(intruso.status()).toBe(409)
    // Só um dos dois do link: recusado também (o link assina todos de uma vez).
    const metade = await request.post('/api/assinar/assinar', {
      data: { token: t, cpf: CPF, assinatura: PNG, itens: itens.slice(0, 1) }, headers: ip(1),
    })
    expect(metade.status()).toBe(409)
    const st = await statusDe([d.termo, d.imagem, deOutra])
    expect([st[d.termo], st[d.imagem]]).toEqual(['PENDENTE', 'PENDENTE'])
    expect(st[deOutra]).not.toBe('ASSINADO')
    expect(((await db().from('document_signatures').select('id').in('issued_document_id', [d.termo, d.imagem, deOutra])).data ?? [])).toEqual([])

    for (let i = 1; i <= 5; i++) await request.post('/api/assinar/abrir', { data: { token: t, cpf: '11144477735' }, headers: ip(2) })
    const linhas = await linhasDoLink(t)
    expect(linhas).toHaveLength(2)
    expect(linhas.every(l => l.revoked_at && l.failed_attempts === 5), 'as tentativas são do link inteiro').toBe(true)
    expect((await request.post('/api/assinar/abrir', { data: { token: t, cpf: CPF }, headers: ip(2) })).status()).toBe(410)
  })

  test('DC3: as funções do link de grupo são só do servidor, e o grupo é de UMA cliente', async () => {
    const d = await agendar(cliente, 3)
    const deOutra = await agendar(outraCliente, 3)
    const misturado = await db().rpc('documentos_link_criar', {
      p_docs: [d.termo, deOutra.termo], p_tenant: rede!.tenantId, p_token_hash: sha(`mix${marca}`), p_expira: new Date(Date.now() + 86_400_000).toISOString(), p_ator: null,
    })
    expect(misturado.error?.message).toMatch(/de uma cliente só/)
    const sessao = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${gestor!.accessToken}` } },
    })
    const criar = await sessao.rpc('documentos_link_criar', {
      p_docs: [d.termo], p_tenant: rede!.tenantId, p_token_hash: sha(`s${marca}`), p_expira: new Date().toISOString(), p_ator: null,
    })
    expect(criar.error, 'criar o link não é da sessão').not.toBeNull()
    const assinar = await sessao.rpc('documentos_assinar', {
      p_tenant: rede!.tenantId, p_itens: [{ id: d.termo, hash: 'x' }], p_canal: 'CLINICA', p_identidade: 'PRESENCIAL',
      p_png: PNG, p_png_sha256: 'x', p_nome: 'x', p_documento: null, p_ip: null, p_ua: null, p_conduzido_por: null,
      p_link_hash: null, p_scan_path: null, p_scan_sha256: null, p_aceite: null,
    })
    expect(assinar.error, 'assinar não é da sessão').not.toBeNull()
  })

  test('DC3 na clínica: "Entregar ao cliente" leva os abertos do agendamento juntos, e uma assinatura assina todos', async ({ browser }) => {
    const d = await agendar(cliente, 4)
    await como(browser, gestor!.estado, async p => {
      await p.goto(`/admin/documentos/${d.termo}/assinar`)
      const juntos = p.locator('[data-assinam-juntos]')
      await expect(juntos).toContainText(NOME.imagem)
      await expect(p.locator('[data-fora-do-link]')).toContainText(NOME.endereco)
      await p.getByText(/Conferi o documento de identidade/).click()
      await p.getByRole('button', { name: 'Entregar ao cliente' }).click()
      await lerTodosEAssinar(p, [NOME.termo, NOME.imagem])
      await expect(p.getByText('Devolva o aparelho à equipe.')).toBeVisible()
    })
    expect(await statusDe([d.termo, d.imagem])).toEqual({ [d.termo]: 'ASSINADO', [d.imagem]: 'ASSINADO' })
    const canais = ((await db().from('document_signatures').select('channel, conducted_by').in('issued_document_id', [d.termo, d.imagem])).data ?? [])
    expect(canais).toEqual([{ channel: 'CLINICA', conducted_by: gestor!.userId }, { channel: 'CLINICA', conducted_by: gestor!.userId }])
  })

  test('DC1c/PC9b: o pacote guarda o que a rede exclui dos documentos puxados', async ({ browser }) => {
    await como(browser, gestor!.estado, async p => {
      const r = await chamarAcao(p, 'actions/pacotes.ts', 'salvarPacote', '/admin/pacotes', [{
        name: NOME.pacote, itens: [{ procedure_id: rede!.procedureId, quantity: 2 }, { procedure_id: procB, quantity: 1 }],
        price: 700, validity_days: 90, is_active: true, documentos_excluidos: [modelos.imagem],
      }])
      expect(r.status).toBe(200)
    })
    const { data } = await db().from('service_packages').select('id, documentos_excluidos').eq('tenant_id', rede!.tenantId).eq('name', NOME.pacote).single()
    pacote = data!.id as string
    expect(data!.documentos_excluidos).toEqual([modelos.imagem])
  })

  test('DC1c/PC9b: o pop-up do pacote mostra o contrato de pacote e os documentos puxados, cada um com Excluir', async ({ browser }) => {
    await como(browser, gestor!.estado, async p => {
      await p.goto('/admin/pacotes')
      await p.locator('[data-pacote]', { hasText: NOME.pacote }).getByRole('button', { name: 'Editar' }).click()
      const secao = p.getByRole('group', { name: 'Documentos do pacote' })
      await expect(secao.locator('[data-contrato-do-pacote]')).toContainText(/Contrato de pacote|Contrato de prestação/)
      await expect(secao.locator(`[data-puxado="${modelos.termo}"]`)).toContainText(NOME.termo)
      await expect(secao.locator(`[data-puxado="${modelos.termoB}"]`)).toContainText(NOME.termoB)
      // O contrato do procedimento não é puxado.
      await expect(secao.getByText(NOME.contrato)).toHaveCount(0)
      await expect(secao.locator(`[data-puxado="${modelos.imagem}"]`).getByRole('button', { name: 'Incluir de novo' })).toBeVisible()
      await secao.locator(`[data-puxado="${modelos.endereco}"]`).getByRole('button', { name: 'Excluir' }).click()
      await p.getByRole('button', { name: 'Salvar pacote' }).click()
      await expect.poll(async () => ((await db().from('service_packages').select('documentos_excluidos').eq('id', pacote).single()).data?.documentos_excluidos as string[] ?? []).sort())
        .toEqual([modelos.imagem, modelos.endereco].sort())
    })
    // Volta como estava para a venda: só o "uso de imagem" excluído.
    expect((await db().from('service_packages').update({ documentos_excluidos: [modelos.imagem] }).eq('id', pacote)).error).toBeNull()
  })

  test('PC2: a venda do pacote emite o contrato de pacote preenchido e os puxados que ficaram — e não espera a assinatura', async ({ browser }) => {
    const slug = `e2e-un-lu${marca}`
    await como(browser, gestor!.estado, async p => {
      const r = await chamarAcao(p, 'actions/pacotes.ts', 'venderPacote', `/${slug}/pdv`,
        [cliente, pacote, rede!.branchId, { forma: 'AVISTA', metodo: 'PIX' }, null, null, null])
      vendido = /"clientPackageId":"([0-9a-f-]{36})"/.exec(r.texto)?.[1] ?? ''
    })
    expect(vendido, 'a venda fechou sem esperar a assinatura').not.toBe('')
    const emitidos = ((await db().from('issued_documents').select('template_id, kind, status, moment, appointment_id, content_text, missing_fields')
      .eq('client_package_id', vendido)).data ?? []) as
      { template_id: string; kind: string; status: string; moment: string; appointment_id: string | null; content_text: string | null; missing_fields: string[] }[]
    expect(emitidos.map(e => e.template_id).sort(), 'o contrato de pacote, os termos e o documento que ficou; nem o contrato do procedimento, nem o excluído')
      .toEqual([modelos.pacote, modelos.termo, modelos.termoB, modelos.endereco].sort())
    expect(new Set(emitidos.map(e => e.moment))).toEqual(new Set(['VENDA_PACOTE']))
    expect(emitidos.every(e => e.appointment_id === null)).toBe(true)
    const contrato = emitidos.find(e => e.kind === 'CONTRATO_PACOTE')!
    expect(contrato.status).toBe('PENDENTE')
    expect(contrato.content_text).toContain(NOME.pacote)
    expect(contrato.content_text).toMatch(/Pix/i)
    expect(contrato.content_text).toMatch(/700,00/)
    expect(contrato.content_text).toMatch(/90 dias, até/)
    expect(emitidos.find(e => e.template_id === modelos.endereco)!.status).toBe('INCOMPLETO')
  })

  test('PC10: o link do pacote leva os documentos abertos da venda, num link só', async ({ browser }) => {
    const contrato = (await db().from('issued_documents').select('id').eq('client_package_id', vendido).eq('kind', 'CONTRATO_PACOTE').single()).data!.id as string
    const t = await gerarLink(browser, contrato, cliente)
    const linhas = await linhasDoLink(t)
    const ids = ((await db().from('issued_documents').select('id, template_id').eq('client_package_id', vendido)).data ?? []) as { id: string; template_id: string }[]
    const de = (m: string) => ids.find(i => i.template_id === m)!.id
    expect(linhas.map(l => l.issued_document_id).sort()).toEqual([de(modelos.pacote), de(modelos.termo), de(modelos.termoB)].sort())
  })

  test('PC2: o documento do pacote em "Bloqueia" trava a SESSÃO do pacote até a assinatura — a venda não', async () => {
    // A sessão do pacote não emite documento (o pacote tem os dele); o que ele
    // tem em aberto vale para as sessões dele.
    const sessao = (await db().from('package_sessions').select('id, procedure_id').eq('client_package_id', vendido).order('session_number').limit(1).single()).data as { id: string; procedure_id: string }
    const { data: ag, error } = await db().from('appointments').insert({
      branch_id: rede!.branchId, client_id: cliente, procedure_id: sessao.procedure_id, professional_id: rede!.professionalId,
      scheduled_at: new Date(Date.now() + 3 * 86_400_000).toISOString(), duration_min: 30, price: 0, status: 'SCHEDULED',
    }).select('id').single<{ id: string }>()
    expect(error, 'agendar a sessão').toBeNull()
    expect((await db().from('package_sessions').update({ appointment_id: ag!.id }).eq('id', sessao.id)).error).toBeNull()
    const pendentes = ((await db().rpc('documentos_pendentes_do_atendimento', { p_agendamento: ag!.id })).data ?? []) as { id: string; kind: string }[]
    expect(pendentes.map(p => p.kind), 'os abertos do pacote valem para a sessão').toContain('CONTRATO_PACOTE')

    expect((await db().from('issued_documents').update({ enforcement: 'BLOQUEIA' }).eq('client_package_id', vendido).eq('kind', 'CONTRATO_PACOTE')).error).toBeNull()
    const inicio = await db().from('appointments').update({ status: 'IN_PROGRESS' }).eq('id', ag!.id)
    expect(inicio.error?.message ?? '', 'a sessão não começa sem o contrato do pacote assinado').toMatch(/Falta assinar/)
    expect((await db().from('issued_documents').update({ enforcement: 'AVISA' }).eq('client_package_id', vendido).eq('kind', 'CONTRATO_PACOTE')).error).toBeNull()
    // Solta a sessão: o próximo teste cancela o pacote.
    expect((await db().from('package_sessions').update({ appointment_id: null }).eq('id', sessao.id)).error).toBeNull()
    expect((await db().from('appointments').update({ status: 'CANCELLED' }).eq('id', ag!.id)).error).toBeNull()
  })

  test('cancelar o pacote cancela os documentos abertos dele', async () => {
    expect((await db().from('client_packages').update({ cancelado_em: new Date().toISOString() }).eq('id', vendido)).error).toBeNull()
    const docs = ((await db().from('issued_documents').select('status, closed_reason').eq('client_package_id', vendido)).data ?? []) as { status: string; closed_reason: string | null }[]
    expect(docs.length).toBe(4)
    expect(docs.every(d => d.status === 'CANCELADO' && /Pacote cancelado/.test(d.closed_reason ?? ''))).toBe(true)
  })

  test('CA4: no portal, "Assinar todos" assina os abertos da cliente de uma vez', async ({ browser }) => {
    const slug = `e2e-un-lu${marca}`
    portal = await clienteComSessao(`lup${marca}`, { id: rede!.branchId, slug }, { tenant: rede!.tenantId })
    const d = await agendar(portal.clientId, 5)
    await como(browser, portal.estado, async p => {
      await p.goto(`/${slug}/cliente/documentos`)
      await p.getByRole('link', { name: /Assinar todos/ }).click()
      await lerTodosEAssinar(p, [NOME.termo, NOME.imagem])
    })
    expect(await statusDe([d.termo, d.imagem])).toEqual({ [d.termo]: 'ASSINADO', [d.imagem]: 'ASSINADO' })
    const canais = ((await db().from('document_signatures').select('channel').in('issued_document_id', [d.termo, d.imagem])).data ?? []).map(c => c.channel)
    expect(canais).toEqual(['PORTAL', 'PORTAL'])
  })
})
