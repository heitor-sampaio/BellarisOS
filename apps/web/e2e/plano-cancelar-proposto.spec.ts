import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, clienteComSessao, type MembroDeTeste, type ClienteDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'

/**
 * A1a da 25ª simulação: o plano PROPOSTO (mandado à cliente, ainda não aceito)
 * e o rascunho não tinham "Cancelar". O Heitor, 18/11, à pergunta "o plano
 * proposto e ainda não aceito não tem um botão 'Cancelar'. Entra?": "sim".
 *
 * Sem dinheiro ("Uma coisa só foi vendida se foi paga."): o plano fica
 * CANCELLED com o motivo e o retrato; os documentos dele que esperavam
 * assinatura caem; o app da cliente não o oferece mais para aceitar (e a
 * action recusa com a frase clara); a Auditoria registra quem cancelou. Quem
 * cancela é quem MONTA o plano (o "Atende" na unidade dele); quem só recebe
 * não vê o botão, e a action recusa.
 *
 * Numa rede [e2e] própria.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let slug = ''
let monta: MembroDeTeste | null = null    // atende na unidade: monta o plano
let recebe: MembroDeTeste | null = null   // recebe (caixa), não atende
let portal: ClienteDeTeste | null = null
let termo = ''

async function como<T>(browser: Browser, estado: string, fn: (p: Page) => Promise<T>) {
  const ctx = await browser.newContext({ storageState: estado })
  try { return await fn(await ctx.newPage()) } finally { await ctx.close() }
}

/** Um plano da cliente do app, com uma sessão, e os documentos dele nascidos (DC4). */
async function plano(status: 'DRAFT' | 'PROPOSED', nome: string): Promise<string> {
  const { data: pl, error } = await db().from('treatment_plans').insert({
    branch_id: rede!.branchId, professional_id: monta!.userId, client_id: portal!.clientId, status,
    name: `${PREFIXO} ${nome} ${marca}`,
  }).select('id').single<{ id: string }>()
  expect(error, 'criar o plano').toBeNull()
  const { data: s } = await db().from('treatment_plan_sessions').insert({ plan_id: pl!.id, sort_order: 0 }).select('id').single<{ id: string }>()
  expect((await db().from('treatment_plan_session_procedures').insert({
    session_id: s!.id, procedure_id: rede!.procedureId, price: 300, sort_order: 0,
  })).error).toBeNull()
  expect((await db().rpc('documentos_emitir_do_plano', { p_plano: pl!.id, p_com_contrato: false })).error, 'os documentos do plano nascem').toBeNull()
  return pl!.id
}

const pendentes = async (planId: string) =>
  ((await db().from('issued_documents').select('id, status').eq('treatment_plan_id', planId)
    .in('status', ['A_GERAR', 'INCOMPLETO', 'PENDENTE'])).data ?? []).length

test.beforeAll(async () => {
  test.setTimeout(180_000)
  rede = await criarOutraRede(`pcp${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  const { data: m, error: eM } = await db().rpc('documento_modelo_salvar', {
    p_tenant: rede.tenantId, p_modelo: null, p_nome: `${PREFIXO} Termo pcp ${marca}`, p_tipo: 'TERMO', p_origem: 'EDITOR',
    p_momento: null, p_exigencia: 'AVISA', p_texto: '# Termo\n\n{{cliente.nome}} autoriza.\n\n[[assinatura]]',
    p_arquivo_path: null, p_arquivo_sha256: null, p_arquivo_nome: null, p_arquivo_tamanho: null, p_arquivo_paginas: null,
    p_variaveis: [], p_usa_pagamento: false, p_ator: null,
  })
  expect(eM, 'o modelo do termo').toBeNull()
  termo = (m as { id: string }).id
  expect((await db().from('procedures').update({ consent_template_id: termo, price: 300, duration_min: 30 }).eq('id', rede.procedureId)).error).toBeNull()
  monta = await criarMembro(`pcpm${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Monta', atendeEm: [rede.branchId],
    permissoes: [{ modulo: 'atendimento', nivel: 'MANAGE' }, { modulo: 'agenda', nivel: 'VIEW' }, { modulo: 'clients', nivel: 'VIEW' }],
  })
  recebe = await criarMembro(`pcpr${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Recebe',
    permissoes: [{ modulo: 'atendimento', nivel: 'VIEW' }, { modulo: 'agenda', nivel: 'VIEW' }, { modulo: 'clients', nivel: 'VIEW' }, { modulo: 'cashier', nivel: 'MANAGE' }],
  })
  portal = await clienteComSessao(`pcpc${marca}`, { id: rede.branchId, slug }, { tenant: rede.tenantId })
})

test.afterAll(async () => {
  await monta?.limpar(); await recebe?.limpar(); await portal?.limpar()
  await rede?.limpar()
})

test('A1a: o proposto se cancela — status cancelado, o documento pendente sai, o app não oferece aceitar e a Auditoria registra quem', async ({ browser }) => {
  const planId = await plano('PROPOSED', 'Proposto')
  expect(await pendentes(planId), 'o termo do plano espera assinatura').toBeGreaterThan(0)
  // A cliente vê o plano proposto no app antes.
  await como(browser, portal!.estado, async p => {
    await p.goto(`/${slug}/cliente/home`)
    await expect(p.locator('[data-plano-proposto]')).toBeVisible()
  })

  await como(browser, monta!.estado, async p => {
    await p.goto(`/${slug}/planejamentos/${planId}`)
    await p.locator('[data-cancelar-proposto]').click()
    const janela = p.getByRole('dialog', { name: 'Cancelar plano' })
    await expect(janela).toContainText('nada foi vendido nem recebido')
    // Sem o motivo, não confirma (o do aceito também pede).
    await expect(janela.locator('[data-confirmar-cancelamento]')).toBeDisabled()
    await janela.getByLabel('Motivo do cancelamento *').fill('A cliente decidiu não fazer agora')
    await janela.locator('[data-confirmar-cancelamento]').click()
    // O retrato só de leitura, na hora.
    const retrato = p.locator('[data-retrato-do-cancelamento]')
    await expect(retrato).toContainText('Cancelado antes do aceite: nada foi vendido nem recebido.', { timeout: 20_000 })
    await expect(retrato).toContainText('Motivo: A cliente decidiu não fazer agora')
    await expect(p.locator('[data-cancelar-proposto]')).toHaveCount(0)
    await expect(p.getByRole('button', { name: 'Aceitar plano' })).toHaveCount(0)
  })

  const { data: tp } = await db().from('treatment_plans')
    .select('status, cancelado_em, cancelado_por, cancelamento_motivo, cancelamento').eq('id', planId).single()
  expect(tp!.status).toBe('CANCELLED')
  expect(tp!.cancelado_por).toBe(monta!.userId)
  expect(tp!.cancelamento_motivo).toBe('A cliente decidiu não fazer agora')
  expect((tp!.cancelamento as Record<string, unknown>).antes_do_aceite).toBe(true)
  expect(await pendentes(planId), 'o documento que esperava assinatura saiu').toBe(0)
  // Sem dinheiro e sem comanda: nada foi vendido.
  expect((await db().from('financial_transactions').select('id').eq('treatment_plan_id', planId)).data ?? []).toHaveLength(0)
  expect((await db().from('comandas').select('id').eq('treatment_plan_id', planId)).data ?? []).toHaveLength(0)
  // A Auditoria: quem cancelou.
  await expect.poll(async () => ((await db().from('auditoria').select('ator_user_id, colunas')
    .eq('tabela', 'treatment_plans').eq('registro_id', planId).eq('operacao', 'editou')).data ?? [])
    .some(a => a.ator_user_id === monta!.userId && (a.colunas as string[]).includes('status')), { timeout: 15_000 }).toBe(true)

  // O app: nem o cartão do Início, nem a página do plano; e o aceite recusa com a frase clara.
  await como(browser, portal!.estado, async p => {
    await p.goto(`/${slug}/cliente/home`)
    await expect(p.locator('[data-plano-proposto]')).toHaveCount(0)
    const r = await p.goto(`/${slug}/cliente/planos/${planId}`)
    if (r?.status() !== 404) await expect(p.getByRole('heading', { name: 'Página não encontrada' })).toBeVisible()
    const res = await chamarAcao(p, 'actions/plano-da-cliente.ts', 'aceitarPlanoPelaCliente', `/${slug}/cliente/planos/${planId}`, [planId])
    expect(JSON.stringify(res)).toContain('Este plano foi cancelado e não pode mais ser aceito.')
  })
  expect((await db().from('treatment_plans').select('status').eq('id', planId).single()).data!.status).toBe('CANCELLED')
})

test('A1a: o rascunho também se cancela, por quem monta', async ({ browser }) => {
  const planId = await plano('DRAFT', 'Rascunho')
  await como(browser, monta!.estado, async p => {
    await p.goto(`/${slug}/planejamentos/${planId}`)
    await p.locator('[data-cancelar-proposto]').click()
    const janela = p.getByRole('dialog', { name: 'Cancelar plano' })
    await janela.getByLabel('Motivo do cancelamento *').fill('Montado por engano')
    await janela.locator('[data-confirmar-cancelamento]').click()
    await expect(p.locator('[data-retrato-do-cancelamento]')).toContainText('Cancelado antes do aceite', { timeout: 20_000 })
  })
  expect((await db().from('treatment_plans').select('status').eq('id', planId).single()).data!.status).toBe('CANCELLED')
})

test('A1a: quem não monta o plano não vê o "Cancelar plano" do proposto, e a action recusa', async ({ browser }) => {
  const planId = await plano('PROPOSED', 'Sem permissão')
  await como(browser, recebe!.estado, async p => {
    await p.goto(`/${slug}/planejamentos/${planId}`)
    // Controle: quem recebe aceita o proposto (A44 da 5ª) — a página abriu com os botões dela.
    await expect(p.getByRole('button', { name: 'Aceitar plano' })).toBeVisible()
    await expect(p.locator('[data-cancelar-proposto]')).toHaveCount(0)
    const res = await chamarAcao(p, 'actions/treatment-plans.ts', 'cancelarPlanoProposto', `/${slug}/planejamentos/${planId}`,
      [planId, { motivo: 'tentativa' }])
    expect(JSON.stringify(res)).toContain('Quem monta o plano é quem atende na unidade dele')
  })
  expect((await db().from('treatment_plans').select('status').eq('id', planId).single()).data!.status).toBe('PROPOSED')
  expect(await pendentes(planId), 'o documento continua esperando assinatura').toBeGreaterThan(0)
})

test('A1a: o aceito NÃO se cancela por aqui (é o "Cancelar plano" do Financeiro, com o dinheiro)', async ({ browser }) => {
  const planId = await plano('PROPOSED', 'Aceito')
  expect((await db().rpc('plano_aceitar', { p_tenant: rede!.tenantId, p_plano: planId })).error).toBeNull()
  await como(browser, monta!.estado, async p => {
    await p.goto(`/${slug}/planejamentos/${planId}`)
    await expect(p.locator('[data-cancelar-proposto]')).toHaveCount(0)
    const res = await chamarAcao(p, 'actions/treatment-plans.ts', 'cancelarPlanoProposto', `/${slug}/planejamentos/${planId}`,
      [planId, { motivo: 'tentativa' }])
    expect(JSON.stringify(res)).toContain('Este plano já foi aceito')
  })
  expect((await db().from('treatment_plans').select('status').eq('id', planId).single()).data!.status).toBe('ACCEPTED')
})
