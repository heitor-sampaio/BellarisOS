import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { apagarDocumentosEmitidos } from './apoio/limpeza'

/**
 * cli-09 (revisão do Heitor, 2026-11-02): "contrato sem documento da cliente
 * vale menos". O contrato e os termos mostravam só o CPF — a cliente
 * portuguesa com passaporte assinava um documento sem documento nenhum (ou
 * ele nem saía: o CPF obrigatório o deixava INCOMPLETO).
 *
 * Agora `cliente.cpf`, sem CPF, é o passaporte (ou o RNE) com o tipo, e
 * `cliente.documento` diz sempre o tipo.
 */

test.describe.configure({ mode: 'serial' })

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede
let gestor: MembroDeTeste
let slug = ''
const docs: string[] = []

async function como(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  test.setTimeout(180_000)
  rede = await criarOutraRede(`dpa${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  gestor = await criarMembro(`dpag${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Recepção',
    permissoes: [{ modulo: 'documents', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'VIEW' }, { modulo: 'agenda', nivel: 'MANAGE' }],
  })
  const { error } = await db().rpc('documento_modelo_salvar', {
    p_tenant: rede.tenantId, p_modelo: null, p_nome: `${PREFIXO} Termo passaporte ${marca}`, p_tipo: 'TERMO', p_origem: 'EDITOR',
    p_momento: 'AGENDAMENTO', p_exigencia: 'AVISA',
    p_texto: '# Termo\n\nEu, **{{cliente.nome}}**, documento {{cliente.documento}} (CPF: {{cliente.cpf}}), autorizo.\n\n[[assinatura]]',
    p_arquivo_path: null, p_arquivo_sha256: null, p_arquivo_nome: null, p_arquivo_tamanho: null, p_arquivo_paginas: null,
    p_variaveis: [], p_usa_pagamento: false, p_ator: null,
  })
  expect(error).toBeNull()
  const { data: modelo } = await db().from('document_templates').select('id').eq('tenant_id', rede.tenantId).eq('kind', 'TERMO').single<{ id: string }>()
  expect((await db().from('procedures').update({ consent_template_id: modelo!.id }).eq('id', rede.procedureId)).error).toBeNull()
})

test.afterAll(async () => {
  test.setTimeout(120_000)
  const { data } = await db().from('issued_documents').select('id').eq('tenant_id', rede.tenantId)
  const ids = (data ?? []).map(d => d.id as string)
  if (ids.length) expect(await apagarDocumentosEmitidos(ids)).toEqual([])
  await db().from('appointments').delete().eq('branch_id', rede.branchId)
  await db().from('procedures').update({ consent_template_id: null }).eq('id', rede.procedureId)
  await gestor?.limpar()
  await rede?.limpar()
})

async function documentoDe(rotulo: string, ficha: Record<string, unknown>): Promise<{ cliente: string; doc: string }> {
  const cliente = await rede.criarCliente(rotulo)
  expect((await db().from('clients').update({ document: null, ...ficha }).eq('id', cliente)).error).toBeNull()
  const { error } = await db().from('appointments').insert({
    branch_id: rede.branchId, client_id: cliente, procedure_id: rede.procedureId, professional_id: rede.professionalId,
    scheduled_at: new Date(Date.now() + 86_400_000).toISOString(), duration_min: 30, price: 100, status: 'SCHEDULED', source: 'INTERNAL',
  })
  expect(error).toBeNull()
  const { data } = await db().from('issued_documents').select('id').eq('client_id', cliente).single<{ id: string }>()
  docs.push(data!.id)
  return { cliente, doc: data!.id }
}

test('a cliente com passaporte: o termo sai com o passaporte, pronto para assinar', async ({ browser }) => {
  const { cliente, doc } = await documentoDe('Portuguesa', { documento_tipo: 'PASSAPORTE', documento_numero: 'CB1234567' })
  await como(browser, gestor, async p => {
    await p.goto(`/${slug}/clients/${cliente}?aba=documentos`)
    await expect(p.getByRole('region', { name: 'Termos e contratos' }).getByText('Para assinar'), 'pronto para assinar, sem "faltam dados"').toBeVisible()
  })
  const { data } = await db().from('issued_documents').select('status, content').eq('id', doc).single<{ status: string; content: string }>()
  expect(data!.status, 'não fica INCOMPLETO por falta de CPF').toBe('PENDENTE')
  expect(data!.content).toContain('documento Passaporte CB1234567')
  expect(data!.content).toContain('(CPF: Passaporte CB1234567)')
})

test('controle: sem CPF nem passaporte, o termo fica incompleto', async ({ browser }) => {
  const { cliente, doc } = await documentoDe('SemDocumento', {})
  await como(browser, gestor, async p => {
    await p.goto(`/${slug}/clients/${cliente}?aba=documentos`)
    await expect(p.getByRole('heading', { level: 1 }).first()).toBeVisible()
  })
  await expect.poll(async () => (await db().from('issued_documents').select('status').eq('id', doc).single()).data?.status).toBe('INCOMPLETO')
})
