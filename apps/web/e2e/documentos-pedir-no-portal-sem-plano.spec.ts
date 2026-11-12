import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO, criarLoginDeTeste } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'
import { apagarDocumentosEmitidos } from './apoio/limpeza'
import { FUNCIONALIDADES } from '@estetica-os/nucleo/lib/planos/recursos'

/**
 * C57a do levantamento das regras (F69): numa rede cujo plano NÃO tem o
 * portal, "Pedir no portal" respondia "Pedido enviado" e gravava
 * NOTIFICADO_PORTAL — e o aviso nunca saía (o `notifyClient` pula a rede sem
 * portal, calado). A tela mentia que a cliente foi avisada.
 *
 * Sem o portal no plano: o botão não aparece, e a action recusa sem gravar.
 */

test.setTimeout(150_000)

const marca = Date.now().toString(36)
const db = () => banco()
const TITULO = `${PREFIXO} Termo sem portal ${marca}`
let rede: OutraRede
let gestor: MembroDeTeste
let cliente = ''
let login = ''
let plano = ''
let doc = ''

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: gestor.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`dsp${marca}`)
  // O plano da rede: tudo, MENOS o portal — ANTES de qualquer sessão abrir (a
  // rede nova ainda não tem o plano no cache da clínica).
  const { data: p, error: eP } = await db().from('platform_plans').insert({ nome: `${PREFIXO} Plano sem portal ${marca}`, valor_centavos: 0 }).select('id').single<{ id: string }>()
  expect(eP).toBeNull()
  plano = p!.id
  const { error: eS } = await db().from('tenant_subscriptions').upsert({
    tenant_id: rede.tenantId, plan_id: plano, valor_centavos: 0,
    recursos: { funcionalidades: FUNCIONALIDADES.map(f => f.chave).filter(c => c !== 'portal'), limites: { unidades: null, membros: null, whatsapp: null } },
  }, { onConflict: 'tenant_id' })
  expect(eS, eS?.message).toBeNull()

  gestor = await criarMembro(`dspg${marca}`, {
    tenant: rede.tenantId, rotulo: 'Recepção sem portal',
    permissoes: [{ modulo: 'documents', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'VIEW' }],
  })
  // A cliente TEM o login do app (era o que mostrava "Pedir no portal").
  cliente = await rede.criarCliente('Com app')
  login = await criarLoginDeTeste(db(), `e2e-cli-dsp-${marca}@bellaris.invalid`, 'a cliente com app')
  expect((await db().from('clients').update({ auth_id: login, document: '52998224725' }).eq('id', cliente)).error).toBeNull()

  const { data: m, error } = await db().rpc('documento_modelo_salvar', {
    p_tenant: rede.tenantId, p_modelo: null, p_nome: TITULO, p_tipo: 'TERMO', p_origem: 'EDITOR',
    p_momento: 'AGENDAMENTO', p_exigencia: 'BLOQUEIA', p_texto: '# Termo\n\nEu, {{cliente.nome}}, autorizo {{procedimento.nome}}.',
    p_arquivo_path: null, p_arquivo_sha256: null, p_arquivo_nome: null, p_arquivo_tamanho: null, p_arquivo_paginas: null,
    p_variaveis: [], p_usa_pagamento: false, p_ator: null,
  })
  expect(error).toBeNull()
  await db().from('procedures').update({ consent_template_id: (m as { id: string }).id }).eq('id', rede.procedureId)
  const { data: ag, error: eAg } = await db().from('appointments').insert({
    branch_id: rede.branchId, client_id: cliente, procedure_id: rede.procedureId, professional_id: rede.professionalId,
    scheduled_at: new Date(Date.now() + 86_400_000).toISOString(), duration_min: 30, price: 100, status: 'SCHEDULED',
  }).select('id').single<{ id: string }>()
  expect(eAg).toBeNull()
  doc = (await db().from('issued_documents').select('id').eq('appointment_id', ag!.id).single<{ id: string }>()).data!.id
})

test.afterAll(async () => {
  const { data } = await db().from('issued_documents').select('id').eq('tenant_id', rede.tenantId)
  expect(await apagarDocumentosEmitidos((data ?? []).map(d => d.id as string))).toEqual([])
  await db().from('tenant_subscriptions').delete().eq('tenant_id', rede.tenantId)
  await gestor?.limpar(); await rede?.limpar()
  if (login) await db().auth.admin.deleteUser(login)
  if (plano) await db().from('platform_plans').delete().eq('id', plano)
})

test('sem o portal no plano: o botão não aparece, e a action recusa sem gravar', async ({ browser }) => {
  await como(browser, async p => {
    const rota = `/admin/clients/${cliente}?aba=documentos`
    await p.goto(rota)
    const linha = p.locator(`[data-documento="${doc}"]`)
    await expect(linha.getByRole('button', { name: 'Enviar link' })).toBeVisible({ timeout: 20_000 })
    await expect(linha.getByRole('button', { name: 'Pedir no portal' })).toHaveCount(0)

    const r = await chamarAcao(p, 'actions/documentos.ts', 'pedirAssinaturaNoPortal', rota, [doc])
    expect(r.texto).toContain('O plano desta clínica não tem o portal do cliente')
  })
  const { data: ev } = await db().from('issued_document_events').select('kind').eq('issued_document_id', doc).eq('kind', 'NOTIFICADO_PORTAL')
  expect(ev ?? [], 'nada de "notificado" quando ninguém foi avisado').toHaveLength(0)
})
