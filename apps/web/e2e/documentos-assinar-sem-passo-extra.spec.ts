import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { clienteComSessao, type ClienteDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { apagarDocumentosEmitidos } from './apoio/limpeza'

/**
 * J-62 das simulações: a tela de assinatura não dizia o que faltava para
 * liberar "Assinar documento" (o botão ficava apagado, sem explicação), e
 * havia um passo a mais — "Confirmar assinatura" no quadro, antes do "Assinar
 * documento". A prova não muda: o aceite escrito, o desenho e o SHA-256 do que
 * se viu vão juntos a `documento_assinar`, no MESMO clique de "Assinar
 * documento", que é o ato de assinar.
 */

const marca = Date.now().toString(36)
const db = () => banco()
const TITULO = `${PREFIXO} Termo um passo ${marca}`
let rede: OutraRede | null = null
let cliente: ClienteDeTeste | null = null
let slug = ''
let doc = ''

async function como(browser: Browser, quem: ClienteDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: quem.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`a1${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  cliente = await clienteComSessao(`a1c${marca}`, { id: rede.branchId, slug }, { tenant: rede.tenantId })
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
    scheduled_at: new Date(Date.now() + 86_400_000).toISOString(), duration_min: 30, price: 0, status: 'SCHEDULED',
  }).select('id').single<{ id: string }>()
  expect(eAg).toBeNull()
  doc = (await db().from('issued_documents').select('id').eq('appointment_id', ag!.id).single<{ id: string }>()).data!.id
})
test.afterAll(async () => {
  if (rede) {
    const { data } = await db().from('issued_documents').select('id').eq('tenant_id', rede.tenantId)
    expect(await apagarDocumentosEmitidos((data ?? []).map(d => d.id as string))).toEqual([])
    await db().from('appointments').delete().eq('branch_id', rede.branchId)
  }
  await cliente?.limpar(); await rede?.limpar()
})

test('a tela diz o que falta e assina sem o "Confirmar assinatura"', async ({ browser }) => {
  await como(browser, cliente!, async page => {
    await page.goto(`/${slug}/cliente/documentos/${doc}`)
    const assinar = page.getByRole('button', { name: 'Assinar documento' })
    const falta = page.locator('[data-falta-para-assinar]')
    await expect(assinar).toBeDisabled()
    await expect(falta).toContainText('marcar que leu e concorda')
    await expect(falta).toContainText('assinar no quadro')

    await page.getByText(/li e concordo com este documento/).click()
    await expect(falta).not.toContainText('marcar que leu e concorda')
    await expect(falta).toContainText('assinar no quadro')

    const quadro = page.locator('canvas').last()
    const caixa = (await quadro.boundingBox())!
    await page.mouse.move(caixa.x + 40, caixa.y + 60); await page.mouse.down()
    for (const [x, y] of [[140, 40], [240, 110], [360, 50]]) await page.mouse.move(caixa.x + x!, caixa.y + y!, { steps: 5 })
    await page.mouse.up()

    // Desenhou: nada mais a confirmar no quadro.
    await expect(page.getByRole('button', { name: 'Confirmar assinatura' })).toHaveCount(0)
    await expect(falta).toHaveCount(0)
    await expect(assinar).toBeEnabled()
    await assinar.click()
    await expect(page.getByRole('heading', { name: 'Documento assinado' })).toBeVisible()
  })
  // A prova é a mesma: o desenho, o aceite e o hash do que se viu.
  const { data: s, error } = await db().from('document_signatures')
    .select('channel, signature_sha256, accepted_text, content_sha256').eq('issued_document_id', doc).single()
  expect(error).toBeNull()
  expect(s?.channel).toBe('PORTAL')
  expect(s?.signature_sha256).toMatch(/^[0-9a-f]{64}$/)
  expect(s?.accepted_text).toContain('li e concordo com este documento')
  expect(s?.content_sha256).toMatch(/^[0-9a-f]{64}$/)
})
