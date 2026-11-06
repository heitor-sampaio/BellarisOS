import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * Os atritos do estoque da 7ª simulação (2026-11-05), da F32:
 * - A40: não havia "quem recebeu o lote X" para recall. O lote, no Estoque,
 *   ganha "Aplicado em": a cliente, o dia, a profissional e a quantidade (a
 *   ligação já está em `stock_movement_batches`). A baixa segue FEFO (regra).
 * - A41: o lote que vence em 10 dias não aparecia no dashboard, só no Estoque.
 * - A50: "Insumos e produtos" não dizia o que soma, e a tela não dizia que a
 *   perda e o ajuste ficam fora do lucro (regra F7).
 *
 * Numa rede [e2e] própria.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let slug = ''
let gerente: MembroDeTeste | null = null
let soEstoque: MembroDeTeste | null = null
let idToxina = ''
let cliente = ''
const toxina = `${PREFIXO} Toxina ${marca}`
const lote = `LA-${marca}`
const diaISO = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d)
const emDias = (n: number) => new Date(Date.now() + n * 86_400_000)

async function como(browser: Browser, quem: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: quem.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  test.setTimeout(150_000)
  rede = await criarOutraRede(`es7${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  const { data: p1, error: e1 } = await db().from('products')
    .insert({ tenant_id: rede.tenantId, name: toxina, unit: 'frasco', consumption_unit: 'UI', units_per_package: 100 })
    .select('id').single<{ id: string }>()
  expect(e1).toBeNull()
  idToxina = p1!.id
  // 2 frascos de um lote que vence em 10 dias.
  expect((await db().rpc('estoque_entrada', {
    p_produto: idToxina, p_unidade: rede.branchId, p_quantidade: 2, p_custo: 900, p_observacao: null,
    p_lote: lote, p_validade: diaISO(emDias(10)), p_autor: 'e2e',
  })).error).toBeNull()
  // A Ana recebeu 20 UI do lote num atendimento da profissional (o gatilho liga a baixa ao lote, FEFO).
  cliente = await rede.criarCliente('Ana Recall')
  const quando = new Date(Date.now() - 2 * 86_400_000).toISOString()
  const ag = await db().from('appointments').insert({
    branch_id: rede.branchId, client_id: cliente, procedure_id: rede.procedureId, professional_id: rede.professionalId,
    status: 'COMPLETED', source: 'INTERNAL', duration_min: 30, price: 0, scheduled_at: quando, completed_at: quando,
  }).select('id').single<{ id: string }>()
  expect(ag.error).toBeNull()
  expect((await db().from('stock_movements').insert({
    branch_id: rede.branchId, product_id: idToxina, type: 'PROCEDURE_USAGE', quantity: -20, balance_after: 180,
    appointment_id: ag.data!.id, created_by: 'e2e',
  })).error).toBeNull()
  gerente = await criarMembro(`es7g${marca}`, {
    tenant: rede.tenantId, rotulo: 'Gerente',
    permissoes: [{ modulo: 'stock', nivel: 'VIEW' }, { modulo: 'clients', nivel: 'VIEW' }, { modulo: 'reports', nivel: 'VIEW' }, { modulo: 'financial', nivel: 'VIEW' }],
  })
  expect((await db().from('role_report_tabs').insert({ tenant_id: rede.tenantId, role_id: gerente.roleId, tab: 'financeiro' })).error).toBeNull()
  soEstoque = await criarMembro(`es7e${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Estoque', permissoes: [{ modulo: 'stock', nivel: 'VIEW' }],
  })
})

test.afterAll(async () => {
  if (rede) await db().from('appointments').delete().eq('branch_id', rede.branchId)
  await gerente?.limpar(); await soEstoque?.limpar(); await rede?.limpar()
})

test('A40: o lote diz em quem foi aplicado — a cliente, o dia, a profissional e a quantidade', async ({ browser }) => {
  await como(browser, gerente!, async p => {
    await p.goto(`/admin/estoque`)
    await p.getByRole('row').filter({ hasText: toxina }).first().click()
    const linha = p.locator('[data-lotes-do-produto]').filter({ hasText: lote })
    await linha.getByRole('button', { name: 'Aplicado em' }).click()
    const janela = p.getByRole('dialog', { name: /Aplicado em/ })
    await expect(janela).toContainText('Ana Recall')
    await expect(janela).toContainText('20 UI')
    await expect(janela).toContainText(`Prof es7${marca}`)
  })
})

test('A40: sem Clientes no cargo, o lote não abre a lista de quem recebeu', async ({ browser }) => {
  await como(browser, soEstoque!, async p => {
    await p.goto(`/${slug}/estoque`)
    await p.getByRole('row').filter({ hasText: toxina }).first().click()
    const linha = p.locator('[data-lotes-do-produto]').filter({ hasText: lote })
    await expect(linha).toBeVisible()
    await expect(linha.getByRole('button', { name: 'Aplicado em' })).toHaveCount(0)
  })
})

test('A41: o lote que vence em 30 dias aparece no dashboard de quem tem o Estoque', async ({ browser }) => {
  await como(browser, gerente!, async p => {
    await p.goto('/admin/dashboard')
    const cartao = p.locator('[data-lotes-vencendo]')
    await expect(cartao).toContainText(toxina)
    await expect(cartao).toContainText(lote)
  })
  await como(browser, soEstoque!, async p => {
    await p.goto(`/${slug}/dashboard`)
    await expect(p.locator('[data-lotes-vencendo]')).toContainText(toxina)
  })
})

test('A50: "Insumos e produtos vendidos" diz o que soma, e a tela diz que perda e ajuste ficam fora do lucro', async ({ browser }) => {
  await como(browser, gerente!, async p => {
    await p.goto('/admin/reports?tab=financeiro')
    await p.getByRole('button', { name: /O que entra em Insumos e produtos/ }).click()
    await expect(p.getByText(/insumo usado nos atendimentos/)).toBeVisible()
    await expect(p.locator('[data-fora-do-lucro]')).toContainText('A perda e o ajuste de estoque ficam fora do lucro')
  })
})
