import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { apagarDocumentosEmitidos } from './apoio/limpeza'
import { diaEmQueAUnidadeAbre } from './apoio/datas'

/**
 * A34 da 6ª simulação (2026-11-04): a janela do agendamento não dizia se o
 * termo que BLOQUEIA o início estava assinado — isso só aparecia dentro da
 * sessão, e a recepção descobria na hora de iniciar.
 *
 * Agora a janela lista os termos e contratos do agendamento, com a situação
 * ("Assinado", "Falta assinar") e quando bloqueiam o início.
 */
const marca = Date.now().toString(36)
const db = () => banco()
const DIA = diaEmQueAUnidadeAbre(2)
const titulo = (r: string) => `${PREFIXO} ${r} ${marca}`
let rede: OutraRede | null = null
let recepcao: MembroDeTeste | null = null
let slug = ''
let agendamento = ''
const docs: string[] = []

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: recepcao!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`ajt${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  expect((await db().from('users').update({ provides_services: true, branch_id: rede.branchId }).eq('id', rede.professionalId)).error).toBeNull()
  recepcao = await criarMembro(`ajtr${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Recepcao',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'VIEW' }],
  })
  const cliente = await rede.criarCliente('Termo')
  const { data: ap, error } = await db().from('appointments').insert({
    branch_id: rede.branchId, client_id: cliente, procedure_id: rede.procedureId, professional_id: rede.professionalId,
    status: 'SCHEDULED', source: 'INTERNAL', duration_min: 60, price: 0, scheduled_at: new Date(`${DIA}T10:00:00-03:00`).toISOString(),
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  agendamento = ap!.id
  for (const [nome, status, exigencia] of [['Termo de toxina', 'PENDENTE', 'BLOQUEIA'], ['Contrato de serviço', 'ASSINADO', 'AVISA']] as const) {
    // Um modelo para cada (um documento por modelo em cada agendamento).
    const { data: m, error: eM } = await db().rpc('documento_modelo_salvar', {
      p_tenant: rede.tenantId, p_modelo: null, p_nome: titulo(`Modelo ${nome}`), p_tipo: 'TERMO', p_origem: 'EDITOR',
      p_momento: 'AGENDAMENTO', p_exigencia: exigencia, p_texto: '# Termo\n\nEu, **{{cliente.nome}}**, autorizo.\n\n[[assinatura]]',
      p_arquivo_path: null, p_arquivo_sha256: null, p_arquivo_nome: null, p_arquivo_tamanho: null, p_arquivo_paginas: null,
      p_variaveis: [], p_usa_pagamento: false, p_ator: null,
    })
    expect(eM).toBeNull()
    const modelo = (m as { id: string }).id
    const { data: versao } = await db().from('document_template_versions').select('id').eq('template_id', modelo).single<{ id: string }>()
    const r = await db().from('issued_documents').insert({
      tenant_id: rede.tenantId, branch_id: rede.branchId, client_id: cliente, appointment_id: agendamento, template_id: modelo,
      template_version_id: versao!.id, kind: 'TERMO', source: 'EDITOR', title: titulo(nome), moment: 'AGENDAMENTO', enforcement: exigencia,
      status, content: '{}', content_sha256: 'a'.repeat(64),
      ...(status === 'ASSINADO' ? { signed_at: new Date().toISOString(), verification_code: `AJT-${marca}`.toUpperCase() } : {}),
    }).select('id').single<{ id: string }>()
    expect(r.error, nome).toBeNull()
    docs.push(r.data!.id)
  }
})

test.afterAll(async () => {
  if (docs.length) expect(await apagarDocumentosEmitidos(docs)).toEqual([])
  if (rede) await db().from('appointments').delete().eq('branch_id', rede.branchId)
  await recepcao?.limpar(); await rede?.limpar()
})

test('a janela do agendamento diz o termo que bloqueia e se está assinado', async ({ browser }) => {
  await como(browser, async p => {
    await p.goto(`/${slug}/agenda?date=${DIA}`)
    await p.locator(`[data-agendamento="${agendamento}"]`).first().click()
    const janela = p.getByRole('dialog', { name: 'Agendamento' })
    const lista = janela.locator('[data-documentos-do-agendamento]')
    await expect(lista.locator('li', { hasText: titulo('Termo de toxina') })).toContainText('Falta assinar · bloqueia o início')
    await expect(lista.locator('li', { hasText: titulo('Contrato de serviço') })).toContainText('Assinado')
    // A29 da 7ª: o nome do termo não sai cortado sem dizer o nome inteiro.
    const nome = lista.locator('[data-titulo-do-documento]', { hasText: titulo('Termo de toxina') })
    await expect(nome).toHaveAttribute('title', titulo('Termo de toxina'))
    expect(await nome.evaluate(el => el.scrollWidth <= el.clientWidth + 1), 'o nome inteiro cabe (quebra a linha)').toBe(true)
  })
})
