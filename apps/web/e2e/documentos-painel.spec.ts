import { createHash, randomBytes } from 'node:crypto'
import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { apagarDocumentosEmitidos } from './apoio/limpeza'

/**
 * A tela de Documentos (pedido do Heitor, 2026-10-14): todos os termos e
 * contratos emitidos, com a SITUAÇÃO de cada um — faltam dados para gerar, a
 * enviar, enviado (por link, portal ou conversa), assinado, dispensado — e a
 * trilha inteira de um documento ao abri-lo.
 *
 * Numa rede `[e2e]` própria, com duas unidades: os documentos são gravados
 * direto (o emitir de verdade é coberto por documentos-atendimento); o que se
 * prova aqui é a leitura, a situação e o alcance.
 */

test.describe.configure({ mode: 'serial' })

const marca = Date.now().toString(36)
const db = () => banco()
const SEM_ACESSO = 'Você não tem acesso a esta área'
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
let rede: OutraRede
let daRede: MembroDeTeste
let daUnidade: MembroDeTeste
let semModulo: MembroDeTeste
let norte: string
const docs: Record<string, string> = {}
const cliente = (r: string) => `${PREFIXO} ${r} dp${marca}`
const titulo = (r: string) => `${PREFIXO} ${r} ${marca}`

test.beforeAll(async () => {
  test.setTimeout(240_000)
  rede = await criarOutraRede(`dp${marca}`)
  const ver = [{ modulo: 'documents' as const, nivel: 'VIEW' as const }]
  daRede = await criarMembro(`dpr${marca}`, { tenant: rede.tenantId, rotulo: 'Recepção da rede', permissoes: ver })
  daUnidade = await criarMembro(`dpu${marca}`, { tenant: rede.tenantId, rotulo: 'Recepção da unidade', permissoes: ver, branchId: rede.branchId })
  semModulo = await criarMembro(`dps${marca}`, { tenant: rede.tenantId, rotulo: 'Sem documentos', permissoes: [{ modulo: 'clients', nivel: 'VIEW' }] })
  const un = await db().from('branches').insert({ tenant_id: rede.tenantId, name: `${PREFIXO} Norte ${marca}`, slug: `e2e-dp-norte-${marca}` })
    .select('id').single<{ id: string }>()
  expect(un.error).toBeNull()
  norte = un.data!.id

  const { data: m, error } = await db().rpc('documento_modelo_salvar', {
    p_tenant: rede.tenantId, p_modelo: null, p_nome: titulo('Modelo'), p_tipo: 'TERMO', p_origem: 'EDITOR',
    p_momento: 'AGENDAMENTO', p_exigencia: 'BLOQUEIA', p_texto: '# Termo\n\nEu, **{{cliente.nome}}**, autorizo.\n\n[[assinatura]]',
    p_arquivo_path: null, p_arquivo_sha256: null, p_arquivo_nome: null, p_arquivo_tamanho: null, p_arquivo_paginas: null,
    p_variaveis: [], p_usa_pagamento: false, p_ator: null,
  })
  expect(error).toBeNull()
  const modelo = (m as { id: string }).id
  const { data: versao } = await db().from('document_template_versions').select('id').eq('template_id', modelo).single<{ id: string }>()

  const hash = 'a'.repeat(64)
  const emitir = async (chave: string, status: string, extra: Record<string, unknown> = {}) => {
    const c = await rede.criarCliente(chave)
    const r = await db().from('issued_documents').insert({
      tenant_id: rede.tenantId, branch_id: rede.branchId, client_id: c, template_id: modelo, template_version_id: versao!.id,
      kind: 'TERMO', source: 'EDITOR', title: titulo(`Termo ${chave}`), moment: 'AGENDAMENTO', enforcement: 'BLOQUEIA',
      status, content: status === 'INCOMPLETO' ? null : '{}', content_sha256: status === 'INCOMPLETO' ? null : hash, ...extra,
    }).select('id').single<{ id: string }>()
    expect(r.error, `emitir ${chave}`).toBeNull()
    docs[chave] = r.data!.id
    await db().from('issued_document_events').insert({ issued_document_id: r.data!.id, tenant_id: rede.tenantId, kind: 'EMITIDO' })
    return r.data!.id
  }
  const evento = (doc: string, kind: string, extra: Record<string, unknown> = {}) =>
    db().from('issued_document_events').insert({ issued_document_id: doc, tenant_id: rede.tenantId, kind, ...extra })
  const link = (doc: string, expira: Date) => db().from('document_sign_links').insert({
    tenant_id: rede.tenantId, issued_document_id: doc,
    token_hash: createHash('sha256').update(randomBytes(16)).digest('hex'), expires_at: expira.toISOString(),
  })
  const semana = new Date(Date.now() + 7 * 86_400_000)

  await emitir('Ana', 'INCOMPLETO', { missing_fields: ['cliente.cpf'] })
  await emitir('Bia', 'PENDENTE')
  const caio = await emitir('Caio', 'PENDENTE')
  await evento(caio, 'LINK_GERADO', { channel: 'LINK' })
  expect((await link(caio, semana)).error).toBeNull()
  const duda = await emitir('Duda', 'PENDENTE')
  await evento(duda, 'NOTIFICADO_PORTAL')
  const eva = await emitir('Eva', 'ASSINADO', { signed_at: new Date().toISOString(), verification_code: `E2E-${marca}`.toUpperCase() })
  await evento(eva, 'LINK_GERADO', { channel: 'LINK' })
  await evento(eva, 'IDENTIDADE_OK', { actor_is_client: true, channel: 'LINK' })
  await evento(eva, 'ASSINADO', { actor_is_client: true, channel: 'LINK' })
  expect((await db().from('document_signatures').insert({
    issued_document_id: eva, tenant_id: rede.tenantId, channel: 'LINK', identity_method: 'CPF',
    signer_name: cliente('Eva'), content_sha256: hash, signature_png: PNG,
    signature_sha256: createHash('sha256').update(PNG).digest('hex'),
  })).error).toBeNull()
  await emitir('Fabi', 'DISPENSADO', { closed_reason: 'Cliente já assinou no papel', closed_at: new Date().toISOString() })
  await emitir('Gil', 'SUBSTITUIDO')
  // Recém-criado pelo gatilho (sem texto ainda): a tela o monta ao listar.
  await emitir('Iara', 'A_GERAR', { content: null, content_sha256: null })
  const hugo = await emitir('Hugo', 'PENDENTE')
  await db().from('issued_documents').update({ branch_id: norte }).eq('id', hugo)
})

test.afterAll(async () => {
  const ids = Object.values(docs)
  if (ids.length) {
    await db().from('document_sign_links').delete().in('issued_document_id', ids)
    await apagarDocumentosEmitidos(ids)
  }
  await daRede?.limpar()
  await daUnidade?.limpar()
  await semModulo?.limpar()
  if (norte) await db().from('branches').delete().eq('id', norte)
  await rede?.limpar()
})

async function como(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

const linha = (p: Page, chave: string) => p.locator(`[data-documento="${docs[chave]}"]`)

test('a rede vê cada documento com a sua situação — e os números vêm do banco', async ({ browser }) => {
  await como(browser, daRede, async p => {
    await p.goto('/admin/documentos')
    // O substituído não entra (foi trocado por outro).
    await expect(p.locator('[data-documento]')).toHaveCount(8)
    await expect(linha(p, 'Gil')).toHaveCount(0)
    // O A_GERAR foi montado ao listar: vira pendente de verdade, a enviar.
    await expect(linha(p, 'Iara')).toHaveAttribute('data-situacao', 'A_ENVIAR')
    expect((await db().from('issued_documents').select('status').eq('id', docs['Iara']!).single()).data!.status).toBe('PENDENTE')

    await expect(linha(p, 'Ana')).toHaveAttribute('data-situacao', 'FALTAM_DADOS')
    await expect(linha(p, 'Ana')).toContainText('CPF')
    await expect(linha(p, 'Bia')).toHaveAttribute('data-situacao', 'A_ENVIAR')
    await expect(linha(p, 'Caio')).toHaveAttribute('data-situacao', 'ENVIADO')
    await expect(linha(p, 'Caio')).toContainText('Link')
    await expect(linha(p, 'Duda')).toHaveAttribute('data-situacao', 'ENVIADO')
    await expect(linha(p, 'Duda')).toContainText('Portal')
    await expect(linha(p, 'Eva')).toHaveAttribute('data-situacao', 'ASSINADO')
    await expect(linha(p, 'Eva')).toContainText('por link')
    await expect(linha(p, 'Fabi')).toHaveAttribute('data-situacao', 'DISPENSADO')
    await expect(linha(p, 'Hugo')).toContainText(`${PREFIXO} Norte ${marca}`)
    await expect(linha(p, 'Eva')).toContainText(cliente('Eva'))

    // Abertos: faltam dados (1) + a enviar (3) + enviados (2).
    await expect(p.locator('[data-kpi="abertos"]')).toContainText('6')
    await expect(p.locator('[data-kpi="a-enviar"]')).toContainText('3')
    await expect(p.locator('[data-kpi="enviados"]')).toContainText('2')
    await expect(p.locator('[data-kpi="assinados"]')).toContainText('1')

    // Filtro por situação.
    await p.getByRole('button', { name: 'Situação', exact: true }).click()
    await p.locator('[data-painel-picker]').getByRole('button', { name: 'A enviar', exact: true }).click()
    await expect(p.locator('[data-documento]')).toHaveCount(3)
    await expect(linha(p, 'Bia')).toBeVisible()
    await expect(linha(p, 'Hugo')).toBeVisible()
  })
})

test('abrir um documento mostra a trilha: emitido, link, identidade e assinatura', async ({ browser }) => {
  await como(browser, daRede, async p => {
    await p.goto('/admin/documentos')
    await linha(p, 'Eva').click()
    const janela = p.getByRole('dialog')
    await expect(janela).toContainText(titulo('Termo Eva'))
    await expect(janela).toContainText('Emitido')
    await expect(janela).toContainText('Link de assinatura gerado')
    await expect(janela).toContainText('Identidade conferida')
    await expect(janela).toContainText('Assinado')
    await expect(janela).toContainText(cliente('Eva'))
    await expect(janela.getByRole('link', { name: /ficha/i })).toBeVisible()
  })
})

test('quem é da unidade vê só a dela; sem o módulo, a tela é fechada', async ({ browser }) => {
  await como(browser, daUnidade, async p => {
    await p.goto(`/e2e-un-dp${marca}/documentos`)
    await expect(p.locator('[data-documento]')).toHaveCount(7)
    await expect(linha(p, 'Hugo')).toHaveCount(0)
  })
  await como(browser, semModulo, async p => {
    await p.goto('/admin/documentos')
    await expect(p.getByText(SEM_ACESSO)).toBeVisible()
    await expect(p.locator('[data-documento]')).toHaveCount(0)
  })
})
