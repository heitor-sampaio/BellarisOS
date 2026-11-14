import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'
import { diaEmQueAUnidadeAbre } from './apoio/datas'

/**
 * Os atritos dos termos da 11ª simulação (2026-11-10, a Renata, a Vera e a
 * Tatiane da [sim] Clínica Violeta), numa rede [e2e] própria:
 *
 * - A5: o termo de injetável saía com "Profissional responsável: ____" — a
 *   variável da profissional só valia no contrato. No termo do PLANO (sem
 *   agendamento), a profissional é a do plano.
 * - A8: o "Enviar link" de assinatura só existia na ficha → Documentos; a
 *   janela da agenda e o checkout tinham só "Colher assinatura".
 * - A9: a janela dizia "Faltam dados do cadastro · bloqueia o início" sem dizer
 *   o quê (a Vera salvou o nascimento, e faltava o CPF).
 */

test.setTimeout(180_000)

const marca = Date.now().toString(36)
const db = () => banco()
const DIA = diaEmQueAUnidadeAbre(2)
const nome = (r: string) => `${PREFIXO} ${r} ${marca}`
let rede: OutraRede
let recepcao: MembroDeTeste
let caixa: MembroDeTeste
let slug = ''
let nomeDaProfissional = ''
const TEXTO = '# Termo da toxina\n\nProfissional responsável: {{profissional.nome}}.\n\nEu, **{{cliente.nome}}**, CPF {{cliente.cpf}}, autorizo.\n\n[[assinatura]]'

async function como(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado, viewport: { width: 1440, height: 900 } })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

async function agendar(cliente: string, hora: string): Promise<string> {
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede.branchId, client_id: cliente, procedure_id: rede.procedureId, professional_id: rede.professionalId,
    status: 'SCHEDULED', source: 'INTERNAL', duration_min: 30, price: 0, scheduled_at: new Date(`${DIA}T${hora}:00-03:00`).toISOString(),
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  return data!.id
}

const termoDe = async (filtro: { appointment_id?: string; treatment_plan_id?: string }) => {
  let q = db().from('issued_documents').select('id, status, content, missing_fields').eq('tenant_id', rede.tenantId).eq('kind', 'TERMO')
  if (filtro.appointment_id) q = q.eq('appointment_id', filtro.appointment_id)
  if (filtro.treatment_plan_id) q = q.eq('treatment_plan_id', filtro.treatment_plan_id)
  const { data } = await q.not('status', 'in', '(CANCELADO,SUBSTITUIDO)').maybeSingle<{ id: string; status: string; content: string | null; missing_fields: string[] | null }>()
  return data
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`doc11${marca}`)
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  nomeDaProfissional = (await db().from('users').select('name').eq('id', rede.professionalId).single<{ name: string }>()).data!.name
  expect((await db().from('users').update({ atende_em: [rede.branchId], provides_services: true }).eq('id', rede.professionalId)).error).toBeNull()
  const { data: m, error: eM } = await db().rpc('documento_modelo_salvar', {
    p_tenant: rede.tenantId, p_modelo: null, p_nome: nome('Termo da toxina'), p_tipo: 'TERMO', p_origem: 'EDITOR',
    p_momento: 'AGENDAMENTO', p_exigencia: 'BLOQUEIA', p_texto: TEXTO,
    p_arquivo_path: null, p_arquivo_sha256: null, p_arquivo_nome: null, p_arquivo_tamanho: null, p_arquivo_paginas: null,
    p_variaveis: [], p_usa_pagamento: false, p_ator: null,
  })
  expect(eM).toBeNull()
  expect((await db().from('procedures').update({ consent_template_id: (m as { id: string }).id }).eq('id', rede.procedureId)).error).toBeNull()
  recepcao = await criarMembro(`doc11r${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Recepcao',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE', escopo: 'ALL' }, { modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'documents', nivel: 'MANAGE' }],
  })
  // O caixa do checkout: recebe, sem o módulo de Termos (a exceção de 2026-10-20).
  caixa = await criarMembro(`doc11c${marca}`, {
    tenant: rede.tenantId, rotulo: 'Caixa',
    permissoes: [{ modulo: 'cashier', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'VIEW' }, { modulo: 'agenda', nivel: 'VIEW', escopo: 'ALL' }],
  })
})

test.afterAll(async () => {
  await recepcao?.limpar()
  await caixa?.limpar()
  await rede?.limpar()
})

test('A9: a janela da agenda diz QUAL dado falta no cadastro, e leva a completá-lo', async ({ browser }) => {
  const cliente = await rede.criarCliente('Helena sem CPF')
  const ag = await agendar(cliente, '09:00')
  await como(browser, recepcao, async p => {
    await p.goto(`/${slug}/agenda?date=${DIA}`)
    await p.locator(`[data-agendamento="${ag}"]`).first().click()
    const lista = p.getByRole('dialog', { name: 'Agendamento' }).locator('[data-documentos-do-agendamento]')
    await expect(lista).toContainText('Faltam dados: CPF · bloqueia o início')
    await expect(lista.locator('[data-completar-cadastro]')).toHaveAttribute('href', new RegExp(`/clients/${cliente}\\?aba=dados$`))
  })
})

test('A8 e A5: a janela manda o link de assinatura, e o termo diz a profissional que atende', async ({ browser }) => {
  const cliente = await rede.criarCliente('Patricia com CPF')
  expect((await db().from('clients').update({ document: '52998224725' }).eq('id', cliente)).error).toBeNull()
  const ag = await agendar(cliente, '10:00')
  await como(browser, recepcao, async p => {
    await p.goto(`/${slug}/agenda?date=${DIA}`)
    await p.locator(`[data-agendamento="${ag}"]`).first().click()
    const lista = p.getByRole('dialog', { name: 'Agendamento' }).locator('[data-documentos-do-agendamento]')
    await expect(lista).toContainText('Falta assinar · bloqueia o início')
    await lista.getByRole('button', { name: 'Enviar link de assinatura' }).click()
    await expect(lista.locator('[data-link-de-assinatura] input')).toHaveValue(/\/assinar\//)
  })
  const termo = await termoDe({ appointment_id: ag })
  expect(termo?.status).toBe('PENDENTE')
  expect(termo?.content).toContain(nomeDaProfissional)
})

test('A5: no termo do PLANO (sem agendamento), a profissional é a do plano — e o termo não fica incompleto', async ({ browser }) => {
  const { planId, clientId } = await rede.criarPlanoProposto('Plano A5', { semTermo: true })
  expect((await db().from('clients').update({ document: '11144477735' }).eq('id', clientId)).error).toBeNull()
  await como(browser, caixa, async p => {
    // Fase 3 do PDV (PT1b): o plano se aceita antes, e os documentos do receber se preparam no PDV.
    const aceite = await chamarAcao(p, 'actions/treatment-plans.ts', 'aceitarPlano', '/admin/pdv', [planId])
    expect(aceite.texto).not.toContain('"error":"')
    const r = await chamarAcao(p, 'actions/documentos.ts', 'prepararDocumentosDoCheckout', '/admin/pdv', [planId, { forma: 'AVISTA', metodo: 'PIX' }])
    expect(r.texto).not.toContain('"error":"')
  })
  const termo = await termoDe({ treatment_plan_id: planId })
  expect(termo?.missing_fields ?? [], 'nada falta').toEqual([])
  expect(termo?.status).toBe('PENDENTE')
  expect(termo?.content).toContain(nomeDaProfissional)

  // A8: e o caixa do checkout manda o link dele (era só quem tem os Termos).
  await como(browser, caixa, async p => {
    const r = await chamarAcao(p, 'actions/documentos.ts', 'gerarLinkDeAssinatura', '/admin/pdv', [termo!.id])
    expect(r.texto).toContain('/assinar/')
  })
})
