import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * O filtro de Tags nos Relatórios (CLAUDE.md §1, o Heitor, 13/11: "onde tiver
 * for passível de filtro, um dos filtros que ela pode usar são as tags").
 *
 * Decisões do Claude (docs/regras/indicadores.md, "O filtro de Tags nos
 * Relatórios"): a tag filtra PESSOAS — a linha entra se a cliente dela tem
 * TODAS as tags marcadas (E), sem distinguir a caixa. Na aba Comercial, a tag
 * é a da PESSOA da oportunidade (o Heitor, 18/11: "a tag é da pessoa e pode
 * ter mais de uma tag"): a cliente ligada e, sem ela, o contato — `leads.tags`
 * não conta. O filtro vai na consulta (`p_tags`), e o CSV o segue.
 * Visão geral, Financeiro e Estoque não têm o filtro.
 *
 * Numa rede [e2e] própria: Ana (VIP, Noivas) pagou R$ 300; Bia (vip) pagou
 * R$ 100; Caio (sem tag) pagou R$ 50.
 */

test.describe.configure({ mode: 'serial' })

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede
let gestor: MembroDeTeste
const horas = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString()
const janela = () => ({ p_tenant: rede.tenantId, p_branch_ids: [rede.branchId], p_from: horas(-24), p_to: horas(24) })

test.beforeAll(async () => {
  test.setTimeout(180_000)
  rede = await criarOutraRede(`rft${marca}`)
  gestor = await criarMembro(`rftg${marca}`, {
    tenant: rede.tenantId, rotulo: 'Relatórios', permissoes: [{ modulo: 'reports', nivel: 'VIEW' }],
  })
  expect((await db().from('role_report_tabs').insert(['overview', 'vendas', 'clientes', 'comercial'].map(tab => ({
    tenant_id: rede.tenantId, role_id: gestor.roleId, tab,
  })))).error, 'as abas').toBeNull()

  const clienteDe: Record<string, string> = {}
  for (const [nome, tags, valor] of [['Ana', ['VIP', 'Noivas'], 300], ['Bia', ['vip'], 100], ['Caio', [], 50]] as const) {
    const cliente = await rede.criarCliente(nome)
    clienteDe[nome] = cliente
    expect((await db().from('clients').update({ tags: [...tags] }).eq('id', cliente)).error, `as tags da ${nome}`).toBeNull()
    const ag = await db().from('appointments').insert({
      branch_id: rede.branchId, client_id: cliente, procedure_id: rede.procedureId, professional_id: rede.professionalId,
      duration_min: 30, status: 'COMPLETED', source: 'INTERNAL', price: valor, scheduled_at: horas(-3), completed_at: horas(-3),
    }).select('id').single<{ id: string }>()
    expect(ag.error, ag.error?.message).toBeNull()
    expect((await db().from('financial_transactions').insert({
      branch_id: rede.branchId, client_id: cliente, appointment_id: ag.data!.id, type: 'INCOME', category: 'Serviços',
      description: `${PREFIXO} Atendimento ${marca}`, amount: valor, is_paid: true, paid_at: horas(-2), payment_method: 'PIX', created_by: 'e2e',
    })).error, `o pagamento da ${nome}`).toBeNull()
  }

  // As oportunidades — a aba Comercial filtra pela tag da PESSOA de cada uma:
  // 1. a da Ana (a cliente ligada: VIP e Noivas);
  // 2. a de um contato sem ficha, com a tag "vip" no contato;
  // 3. a de um contato sem tag: não conta. (A oportunidade não tem tag própria —
  //    o Heitor, 18/11: "a tag é da pessoa"; a 20261125500002 tirou `leads.tags`.)
  const f = await db().from('crm_funnels').insert({ tenant_id: rede.tenantId, name: `${PREFIXO} Funil ${marca}`, is_default: true }).select('id').single<{ id: string }>()
  expect(f.error).toBeNull()
  const e = await db().from('crm_stages').insert({ tenant_id: rede.tenantId, funnel_id: f.data!.id, name: 'Primeiro contato', position: 0 }).select('id').single<{ id: string }>()
  expect(e.error).toBeNull()
  const contato = await db().from('contacts').insert({
    tenant_id: rede.tenantId, name: `${PREFIXO} Contato ${marca}`, tags: ['vip'],
  }).select('id').single<{ id: string }>()
  expect(contato.error, contato.error?.message).toBeNull()
  const semTag = await db().from('contacts').insert({
    tenant_id: rede.tenantId, name: `${PREFIXO} Contato sem tag ${marca}`, tags: [],
  }).select('id').single<{ id: string }>()
  expect(semTag.error, semTag.error?.message).toBeNull()
  const oportunidades: Record<string, unknown>[] = [
    { client_id: clienteDe.Ana },
    { contato_id: contato.data!.id },
    { contato_id: semTag.data!.id },
  ]
  for (const [i, ligacao] of oportunidades.entries()) {
    expect((await db().from('leads').insert({
      tenant_id: rede.tenantId, name: `${PREFIXO} Oportunidade ${i} ${marca}`, phone: '5548' + String(Date.now() + i).slice(-9),
      crm_stage_id: e.data!.id, source: 'Instagram', ...ligacao,
    })).error, `a oportunidade ${i}`).toBeNull()
  }
})

test.afterAll(async () => {
  await gestor?.limpar()
  await rede?.limpar()
})

test('nas funções: E, sem distinguir a caixa; sem tag, tudo; a linha sem a tag sai', async () => {
  const resumo = async (tags?: string[]) => {
    const { data, error } = await db().rpc('metrics_vendas_resumo', { ...janela(), ...(tags ? { p_tags: tags } : {}) })
    expect(error, error?.message).toBeNull()
    const geral = (data as { tipo: string | null; quantidade: number; total: number }[]).find(r => r.tipo === null)
    return { q: Number(geral?.quantidade ?? 0), total: Number(geral?.total ?? 0) }
  }
  expect(await resumo(), 'sem tag: as três').toEqual({ q: 3, total: 450 })
  expect(await resumo(['vip']), '"vip" é "VIP": Ana e Bia').toEqual({ q: 2, total: 400 })
  expect(await resumo(['VIP', 'noivas']), 'as duas tags: só a Ana').toEqual({ q: 1, total: 300 })
  expect(await resumo(['Inexistente'])).toEqual({ q: 0, total: 0 })

  const { data: pagina, error: eP } = await db().rpc('metrics_vendas_pagina', {
    ...janela(), p_tipo: null, p_limite: 50, p_offset: 0, p_tags: ['Noivas'],
  })
  expect(eP).toBeNull()
  expect((pagina as { cliente: string }[]).map(l => l.cliente)).toEqual([expect.stringContaining('Ana')])

  // O núcleo (os cartões das abas de pessoas): o dinheiro e os atendimentos dela.
  const { data: core, error: eC } = await db().rpc('metrics_core', { ...janela(), p_tags: ['noivas'] })
  expect(eC, eC?.message).toBeNull()
  expect(core?.[0]).toMatchObject({ appointments_completed: 1, revenue_cash: 300 })

  // Os agregados da aba: as execuções e a base de clientes.
  const relatorio = async (aba: string, tags: string[]) => {
    const { data, error } = await db().rpc('metrics_relatorio', {
      ...janela(), p_prev_from: horas(-48), p_prev_to: horas(-24), p_aba: aba, p_granularidade: 'day', p_tags: tags,
    })
    expect(error, error?.message).toBeNull()
    return data as Record<string, unknown>
  }
  expect(Number((await relatorio('procedimentos', ['VIP'])).execucoes_total), 'as execuções de Ana e Bia').toBe(2)
  expect(Number((await relatorio('clientes', ['Noivas'])).total_ativos), 'a base: só a Ana').toBe(1)

  // A aba Comercial: a tag é a da PESSOA da oportunidade (a cliente; sem ela, o contato).
  const comercial = async (tags?: string[]) => {
    const { data, error } = await db().rpc('metrics_comercial', { ...janela(), p_owner: null, ...(tags ? { p_tags: tags } : {}) })
    expect(error, error?.message).toBeNull()
    return Number((data as Record<string, unknown>).total_leads)
  }
  expect(await comercial()).toBe(3)
  expect(await comercial(['vip']), 'a da Ana (pela ficha) e a do contato — não a que tem a tag só na oportunidade').toBe(2)
  expect(await comercial(['Noivas']), 'só a da Ana').toBe(1)
})

async function como(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado, viewport: { width: 1440, height: 900 } })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test('na tela: o gatilho "Tags" nas abas de pessoas, a URL guarda a escolha, e o CSV a segue', async ({ browser }) => {
  await como(browser, gestor, async p => {
    await p.goto('/admin/reports?tab=vendas&period=today')
    const filtro = p.locator('[data-filtro-de-tags]')
    await expect(filtro).toBeVisible({ timeout: 30_000 })
    await expect(p.locator('[data-total-vendas]')).toContainText('3 vendas')

    await filtro.getByRole('button', { name: 'Tags', exact: true }).click()
    await p.locator('[data-painel-picker]').getByRole('button', { name: 'Noivas' }).click()
    await expect(p).toHaveURL(/[?&]tags=Noivas/)
    await expect(p.locator('[data-total-vendas]')).toContainText('1 venda')
    await expect(filtro).toContainText('Tags · 1')

    const href = await p.getByRole('link', { name: /Exportar/ }).getAttribute('href')
    expect(href).toContain('tags=Noivas')
    const csv = await (await p.request.get(href!)).text()
    expect(csv).toContain('Ana')
    expect(csv).not.toContain('Bia')
    expect(csv).not.toContain('Caio')

    // Na Visão geral o filtro não existe (o lucro não é de uma cliente).
    await p.goto('/admin/reports?tab=overview&period=today&tags=Noivas')
    await expect(p.getByRole('button', { name: 'Visão Geral', exact: true })).toBeVisible({ timeout: 30_000 })
    await expect(p.locator('[data-filtro-de-tags]')).toHaveCount(0)
  })
})
