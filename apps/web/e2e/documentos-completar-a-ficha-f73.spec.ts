import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { apagarDocumentosEmitidos } from './apoio/limpeza'

/**
 * F73 — A22 da 14ª simulação (princípio 7: a tela que uma pessoa nova não
 * entende sozinha). Em Documentos, "Faltam dados — Falta: CPF" não dizia onde
 * completar. Agora ao lado vem "Completar o cadastro" (o nome: o Heitor, 25/11,
 * "Completar cadastro"), que leva à aba Dados da
 * cliente — o mesmo caminho que a janela do agendamento já dava
 * (`[data-completar-cadastro]`, A9 da 11ª).
 */

const marca = `dc${Date.now().toString(36)}`
const db = () => banco()
let rede: OutraRede
let recepcao: MembroDeTeste
let soVe: MembroDeTeste
let cliente = ''
let doc = ''

async function como(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  test.setTimeout(180_000)
  rede = await criarOutraRede(marca)
  recepcao = await criarMembro(`r${marca}`, {
    tenant: rede.tenantId, rotulo: 'Recepção da rede',
    permissoes: [{ modulo: 'clients', nivel: 'MANAGE' }],
  })
  // DOC-01 da varredura de 18/11: quem só VÊ a cliente vê os documentos, mas
  // não edita a ficha — o link não aparece (§14: botão que não se pode usar).
  soVe = await criarMembro(`v${marca}`, {
    tenant: rede.tenantId, rotulo: 'Só vê clientes',
    permissoes: [{ modulo: 'clients', nivel: 'VIEW' }],
  })
  const { data: m, error } = await db().rpc('documento_modelo_salvar', {
    p_tenant: rede.tenantId, p_modelo: null, p_nome: `${PREFIXO} Modelo ${marca}`, p_tipo: 'TERMO', p_origem: 'EDITOR',
    p_momento: 'AGENDAMENTO', p_exigencia: 'BLOQUEIA', p_texto: '# Termo\n\nEu, **{{cliente.nome}}**, CPF {{cliente.cpf}}.\n\n[[assinatura]]',
    p_arquivo_path: null, p_arquivo_sha256: null, p_arquivo_nome: null, p_arquivo_tamanho: null, p_arquivo_paginas: null,
    p_variaveis: [], p_usa_pagamento: false, p_ator: null,
  })
  expect(error).toBeNull()
  const modelo = (m as { id: string }).id
  const { data: versao } = await db().from('document_template_versions').select('id').eq('template_id', modelo).single<{ id: string }>()
  cliente = await rede.criarCliente('Ana')
  const r = await db().from('issued_documents').insert({
    tenant_id: rede.tenantId, branch_id: rede.branchId, client_id: cliente, template_id: modelo, template_version_id: versao!.id,
    kind: 'TERMO', source: 'EDITOR', title: `${PREFIXO} Termo ${marca}`, moment: 'AGENDAMENTO', enforcement: 'BLOQUEIA',
    status: 'INCOMPLETO', content: null, content_sha256: null, missing_fields: ['cliente.cpf'],
  }).select('id').single<{ id: string }>()
  expect(r.error).toBeNull()
  doc = r.data!.id
})

test.afterAll(async () => {
  if (doc) await apagarDocumentosEmitidos([doc])
  await recepcao?.limpar()
  await soVe?.limpar()
  await rede?.limpar()
})

test('A22: "Faltam dados" em Documentos leva à aba Dados da cliente', async ({ browser }) => {
  await como(browser, recepcao, async p => {
    await p.goto('/admin/documentos')
    const linha = p.locator(`[data-documento="${doc}"]`)
    await expect(linha).toHaveAttribute('data-situacao', 'FALTAM_DADOS')
    const completar = linha.locator('[data-completar-cadastro]')
    await expect(completar).toHaveText('Completar o cadastro')
    await expect(completar).toHaveAttribute('href', new RegExp(`/clients/${cliente}\\?aba=dados$`))
    await completar.click()
    await expect(p).toHaveURL(new RegExp(`/clients/${cliente}\\?aba=dados`))
  })
})

test('DOC-01: quem só vê a cliente não recebe o "Completar o cadastro"', async ({ browser }) => {
  await como(browser, soVe, async p => {
    await p.goto('/admin/documentos')
    const linha = p.locator(`[data-documento="${doc}"]`)
    await expect(linha).toHaveAttribute('data-situacao', 'FALTAM_DADOS')
    await expect(linha).toContainText('Falta:')
    await expect(linha.locator('[data-completar-cadastro]')).toHaveCount(0)
  })
})
