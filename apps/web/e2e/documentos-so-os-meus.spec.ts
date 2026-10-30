import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste, type Permissao } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { apagarDocumentosEmitidos } from './apoio/limpeza'
import { chamarAcao } from './apoio/acao-direta'

/**
 * Os documentos emitidos seguem o prontuário "só os meus" (decisão do Heitor,
 * 2026-10-29). Com `medical_records` OWN, a tela de Documentos e a lista de
 * documentos da ficha mostram só os das clientes que ela atende — um
 * agendamento com ela, qualquer um, inclusive futuro (a regra do prontuário).
 * Vale também pelo id: abrir, a trilha, o PDF, gerar link, dispensar.
 *
 * Numa rede `[e2e]` própria; os documentos são gravados direto (o emitir de
 * verdade é coberto por documentos-atendimento). Controle: o mesmo cargo com
 * o prontuário de todas.
 */

test.describe.configure({ mode: 'serial' })

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede
let ela: MembroDeTeste
let todas: MembroDeTeste
let slug = ''
let atendida = ''
let naoAtendida = ''
const docs: Record<'dela' | 'deOutra' | 'assinadoDeOutra', string> = {} as never
const titulo = (r: string) => `${PREFIXO} Termo ${r} ${marca}`

const cargo = (escopo: 'OWN' | 'ALL'): Permissao[] => [
  { modulo: 'documents', nivel: 'MANAGE' },
  { modulo: 'clients', nivel: 'VIEW' },
  { modulo: 'medical_records', nivel: 'VIEW', escopo },
]

test.beforeAll(async () => {
  test.setTimeout(240_000)
  rede = await criarOutraRede(`dso${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  ela = await criarMembro(`dsoe${marca}`, { tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Profissional', permissoes: cargo('OWN') })
  todas = await criarMembro(`dsot${marca}`, { tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Todas', permissoes: cargo('ALL') })
  atendida = await rede.criarCliente('Atendida')
  naoAtendida = await rede.criarCliente('Nao atendida')
  // A cliente dela: um agendamento FUTURO com ela.
  const { error: eAg } = await db().from('appointments').insert({
    branch_id: rede.branchId, client_id: atendida, procedure_id: rede.procedureId, professional_id: ela.userId,
    status: 'SCHEDULED', source: 'INTERNAL', duration_min: 30, price: 100,
    scheduled_at: new Date(Date.now() + 2 * 86_400_000).toISOString(),
  })
  expect(eAg).toBeNull()

  const { data: m, error } = await db().rpc('documento_modelo_salvar', {
    p_tenant: rede.tenantId, p_modelo: null, p_nome: titulo('Modelo'), p_tipo: 'TERMO', p_origem: 'EDITOR',
    p_momento: 'AGENDAMENTO', p_exigencia: 'AVISA', p_texto: '# Termo\n\nEu, **{{cliente.nome}}**, autorizo.\n\n[[assinatura]]',
    p_arquivo_path: null, p_arquivo_sha256: null, p_arquivo_nome: null, p_arquivo_tamanho: null, p_arquivo_paginas: null,
    p_variaveis: [], p_usa_pagamento: false, p_ator: null,
  })
  expect(error).toBeNull()
  const modelo = (m as { id: string }).id
  const { data: versao } = await db().from('document_template_versions').select('id').eq('template_id', modelo).single<{ id: string }>()
  const emitir = async (chave: keyof typeof docs, cliente: string, status: string, extra: Record<string, unknown> = {}) => {
    const r = await db().from('issued_documents').insert({
      tenant_id: rede.tenantId, branch_id: rede.branchId, client_id: cliente, template_id: modelo, template_version_id: versao!.id,
      kind: 'TERMO', source: 'EDITOR', title: titulo(chave), moment: 'AGENDAMENTO', enforcement: 'AVISA',
      status, content: '{}', content_sha256: 'a'.repeat(64), ...extra,
    }).select('id').single<{ id: string }>()
    expect(r.error, `emitir ${chave}`).toBeNull()
    docs[chave] = r.data!.id
    await db().from('issued_document_events').insert({ issued_document_id: r.data!.id, tenant_id: rede.tenantId, kind: 'EMITIDO' })
  }
  await emitir('dela', atendida, 'PENDENTE')
  await emitir('deOutra', naoAtendida, 'PENDENTE')
  await emitir('assinadoDeOutra', naoAtendida, 'ASSINADO', { signed_at: new Date().toISOString(), verification_code: `DSO-${marca}`.toUpperCase() })
})

test.afterAll(async () => {
  test.setTimeout(120_000)
  const ids = Object.values(docs)
  if (ids.length) {
    await db().from('document_sign_links').delete().in('issued_document_id', ids)
    expect(await apagarDocumentosEmitidos(ids)).toEqual([])
  }
  if (rede) await db().from('appointments').delete().eq('branch_id', rede.branchId)
  await ela?.limpar()
  await todas?.limpar()
  await rede?.limpar()
})

async function como(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test('a tela de Documentos, com o prontuário "só os meus", mostra só os das clientes que ela atende', async ({ browser }) => {
  await como(browser, ela, async p => {
    await p.goto(`/${slug}/documentos`)
    await expect(p.locator(`[data-documento="${docs.dela}"]`), 'o da cliente dela').toBeVisible()
    await expect(p.locator(`[data-documento="${docs.deOutra}"]`), 'o de cliente que ela não atende').toHaveCount(0)
    await expect(p.locator(`[data-documento="${docs.assinadoDeOutra}"]`)).toHaveCount(0)
  })
  await como(browser, todas, async p => {
    await p.goto(`/${slug}/documentos`)
    await expect(p.locator(`[data-documento="${docs.dela}"]`)).toBeVisible()
    await expect(p.locator(`[data-documento="${docs.deOutra}"]`), 'controle: com o prontuário de todas, aparece').toBeVisible()
  })
})

test('a ficha da cliente que ela não atende não lista os documentos', async ({ browser }) => {
  await como(browser, ela, async p => {
    await p.goto(`/${slug}/clients/${atendida}?aba=documentos`)
    await expect(p.locator(`[data-documento="${docs.dela}"]`), 'a cliente dela: lista').toBeVisible()
    await p.goto(`/${slug}/clients/${naoAtendida}?aba=documentos`)
    await expect(p.getByRole('heading', { level: 1 }).first()).toBeVisible()
    await expect(p.locator(`[data-documento="${docs.deOutra}"]`), 'a ficha da outra não lista').toHaveCount(0)
    await expect(p.getByText(titulo('assinadoDeOutra')), 'nem o assinado, no histórico').toHaveCount(0)
  })
  await como(browser, todas, async p => {
    await p.goto(`/${slug}/clients/${naoAtendida}?aba=documentos`)
    await expect(p.locator(`[data-documento="${docs.deOutra}"]`), 'controle').toBeVisible()
  })
})

test('pelo id: o documento de cliente que ela não atende não abre, não baixa e não se mexe', async ({ browser }) => {
  const ficha = `/${slug}/clients/${atendida}`
  await como(browser, ela, async p => {
    await p.goto(`/${slug}/documentos`)
    const trilha = await chamarAcao(p, 'actions/documentos.ts', 'trilhaDoDocumento', `/${slug}/documentos`, [docs.deOutra])
    expect(trilha.texto, 'chegou à action').not.toContain('Server action not found')
    expect(trilha.texto, 'a trilha').toContain('Documento não encontrado')
    const minha = await chamarAcao(p, 'actions/documentos.ts', 'trilhaDoDocumento', `/${slug}/documentos`, [docs.dela])
    expect(minha.texto, 'a trilha do dela abre').toContain(titulo('dela'))

    const link = await chamarAcao(p, 'actions/documentos.ts', 'gerarLinkDeAssinatura', ficha, [docs.deOutra])
    expect(link.texto, 'gerar link').toContain('Documento não encontrado')
    const dispensa = await chamarAcao(p, 'actions/documentos.ts', 'dispensarDocumento', ficha, [docs.deOutra, 'invasão'])
    expect(dispensa.texto, 'dispensar').toContain('Documento não encontrado')

    const pdf = await p.request.get(`/api/documentos/${docs.assinadoDeOutra}/pdf`, { maxRedirects: 0 })
    expect(pdf.status(), 'o PDF').toBe(404)

    await p.goto(`/${slug}/documentos/${docs.deOutra}/assinar`)
    await expect(p.getByText(titulo('deOutra')), 'a tela do documento').toHaveCount(0)
  })
  const { data } = await db().from('issued_documents').select('status').eq('id', docs.deOutra).single<{ status: string }>()
  expect(data!.status, 'não foi dispensado').toBe('PENDENTE')

  await como(browser, todas, async p => {
    await p.goto(`/${slug}/documentos`)
    const trilha = await chamarAcao(p, 'actions/documentos.ts', 'trilhaDoDocumento', `/${slug}/documentos`, [docs.deOutra])
    expect(trilha.texto, 'controle: a trilha abre').toContain(titulo('deOutra'))
    const pdf = await p.request.get(`/api/documentos/${docs.assinadoDeOutra}/pdf`, { maxRedirects: 0 })
    expect(pdf.status(), 'controle: o PDF passa da conferência').not.toBe(404)
    await p.goto(`/${slug}/documentos/${docs.deOutra}/assinar`)
    await expect(p.getByText(titulo('deOutra')).first(), 'controle: a tela abre').toBeVisible()
  })
})
