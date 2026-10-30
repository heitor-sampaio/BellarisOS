import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { clienteComSessao, type ClienteDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { apagarDocumentosEmitidos } from './apoio/limpeza'

/**
 * J-63 das simulações: o detalhe do agendamento no app não dizia se o termo
 * daquele atendimento estava assinado ou pendente. Agora a seção "Documentos
 * deste atendimento", com a situação de cada um e "Assinar" no pendente.
 */

const marca = Date.now().toString(36)
const db = () => banco()
const TITULO = `${PREFIXO} Termo do detalhe ${marca}`
let rede: OutraRede | null = null
let cliente: ClienteDeTeste | null = null
let slug = ''
let agendamento = ''
let doc = ''

async function como(browser: Browser, quem: ClienteDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: quem.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`dd${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  cliente = await clienteComSessao(`ddc${marca}`, { id: rede.branchId, slug }, { tenant: rede.tenantId })
  expect((await db().from('clients').update({ document: '52998224725' }).eq('id', cliente.clientId)).error).toBeNull()
  const { data: m, error } = await db().rpc('documento_modelo_salvar', {
    p_tenant: rede.tenantId, p_modelo: null, p_nome: TITULO, p_tipo: 'TERMO', p_origem: 'EDITOR',
    p_momento: 'AGENDAMENTO', p_exigencia: 'BLOQUEIA', p_texto: '# Termo\n\nEu, {{cliente.nome}}, autorizo {{procedimento.nome}}.',
    p_arquivo_path: null, p_arquivo_sha256: null, p_arquivo_nome: null, p_arquivo_tamanho: null, p_arquivo_paginas: null,
    p_variaveis: [], p_usa_pagamento: false, p_ator: null,
  })
  expect(error).toBeNull()
  await db().from('procedures').update({ consent_template_id: (m as { id: string }).id }).eq('id', rede.procedureId)
  const { data: ag, error: eAg } = await db().from('appointments').insert({
    branch_id: rede.branchId, client_id: cliente.clientId, procedure_id: rede.procedureId, professional_id: rede.professionalId,
    scheduled_at: new Date(Date.now() + 3 * 86_400_000).toISOString(), duration_min: 30, price: 0, status: 'SCHEDULED',
  }).select('id').single<{ id: string }>()
  expect(eAg).toBeNull()
  agendamento = ag!.id
  doc = (await db().from('issued_documents').select('id').eq('appointment_id', agendamento).single<{ id: string }>()).data!.id
})
test.afterAll(async () => {
  if (rede) {
    const { data } = await db().from('issued_documents').select('id').eq('tenant_id', rede.tenantId)
    expect(await apagarDocumentosEmitidos((data ?? []).map(d => d.id as string))).toEqual([])
    await db().from('appointments').delete().eq('branch_id', rede.branchId)
  }
  await cliente?.limpar(); await rede?.limpar()
})

test('o detalhe do agendamento diz que o termo falta assinar e leva a ele', async ({ browser }) => {
  await como(browser, cliente!, async p => {
    await p.goto(`/${slug}/cliente/agendamentos/${agendamento}`)
    const secao = p.locator('[data-documentos-do-agendamento]')
    await expect(secao).toContainText('Documentos deste atendimento')
    const linha = secao.locator(`[data-documento="${doc}"]`)
    await expect(linha).toContainText(TITULO)
    await expect(linha).toContainText('Falta a sua assinatura')
    await expect(linha.getByRole('link', { name: 'Assinar' })).toHaveAttribute('href', `/${slug}/cliente/documentos/${doc}`)
  })
})

test('dispensado pela clínica, o detalhe diz isso', async ({ browser }) => {
  expect((await db().from('issued_documents').update({ status: 'DISPENSADO' }).eq('id', doc)).error).toBeNull()
  await como(browser, cliente!, async p => {
    await p.goto(`/${slug}/cliente/agendamentos/${agendamento}`)
    const linha = p.locator(`[data-documentos-do-agendamento] [data-documento="${doc}"]`)
    await expect(linha).toContainText('Dispensado pela clínica')
    await expect(linha.getByRole('link', { name: 'Assinar' })).toHaveCount(0)
  })
})
