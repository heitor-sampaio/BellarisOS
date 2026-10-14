import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * O relatório de vendas (pedido do Heitor, 2026-10-14): TUDO o que foi
 * vendido no período — procedimento avulso, pacote, procedimento pré-pago e
 * plano —, uma linha por venda, com data, descrição, cliente, profissional e
 * valor.
 *
 * Venda é o fato comercial, não o dinheiro: o pacote parcelado é UMA linha, e
 * a sessão do pacote (ou do plano, ou a unidade pré-paga) que a cliente vem
 * fazer depois não é venda de novo — já foi vendida.
 *
 * Numa rede `[e2e]` própria, com as datas em 2021: o que a tela mostra é só
 * o que este teste criou.
 */

test.describe.configure({ mode: 'serial' })

const marca = Date.now().toString(36)
const db = () => banco()
let outra: OutraRede
let gestor: MembroDeTeste
let semVendas: MembroDeTeste
let pacoteId: string
const nome = (r: string) => `${PREFIXO} ${r} ${marca}`
/** O cliente da rede de teste leva a marca dela (criarCliente). */
const cliente = (r: string) => `${PREFIXO} ${r} vnd${marca}`

const MARCO = '/admin/reports?tab=vendas&period=custom&from=2021-03-01&to=2021-03-31'
const ABRIL = '/admin/reports?tab=vendas&period=custom&from=2021-04-01&to=2021-04-30'

test.beforeAll(async () => {
  test.setTimeout(240_000)
  outra = await criarOutraRede(`vnd${marca}`)
  const reports = [{ modulo: 'reports' as const, nivel: 'VIEW' as const }]
  gestor = await criarMembro(`vndg${marca}`, { tenant: outra.tenantId, rotulo: 'Gestor', permissoes: reports })
  semVendas = await criarMembro(`vnds${marca}`, { tenant: outra.tenantId, rotulo: 'Financeiro', permissoes: reports })
  const abas = await db().from('role_report_tabs').insert([
    { tenant_id: outra.tenantId, role_id: gestor.roleId, tab: 'vendas' },
    { tenant_id: outra.tenantId, role_id: semVendas.roleId, tab: 'financeiro' },
  ])
  expect(abas.error, 'liberar as abas').toBeNull()

  const ana  = await outra.criarCliente('Ana')
  const bia  = await outra.criarCliente('Bia')
  const caio = await outra.criarCliente('Caio')
  const duda = await outra.criarCliente('Duda')
  const base = { branch_id: outra.branchId, procedure_id: outra.procedureId, professional_id: outra.professionalId, duration_min: 30 }

  // 1. Procedimento avulso concluído, com desconto na recepção: vale 180.
  const avulso = await db().from('appointments').insert({
    ...base, client_id: ana, status: 'COMPLETED', scheduled_at: '2021-03-10T12:00:00Z', price: 200,
  }).select('id').single<{ id: string }>()
  expect(avulso.error).toBeNull()
  const pago = await db().from('financial_transactions').insert({
    branch_id: outra.branchId, client_id: ana, appointment_id: avulso.data!.id, type: 'INCOME',
    category: 'Serviços', description: 'Atendimento', amount: 180, sale_discount: 20,
    is_paid: true, paid_at: '2021-03-10T13:00:00Z', payment_method: 'PIX', created_by: outra.professionalId,
  })
  expect(pago.error).toBeNull()
  // Cancelado: não é venda.
  expect((await db().from('appointments').insert({
    ...base, client_id: ana, status: 'CANCELLED', scheduled_at: '2021-03-11T12:00:00Z', price: 999,
  })).error).toBeNull()

  // 2. Pacote vendido com desconto (500 → 450), e a sessão dele feita: a
  //    sessão não é venda de novo.
  const sp = await db().from('service_packages').insert({
    tenant_id: outra.tenantId, branch_id: outra.branchId, procedure_id: outra.procedureId,
    name: nome('Pacote Glow'), total_sessions: 1, price: 500,
  }).select('id').single<{ id: string }>()
  expect(sp.error).toBeNull()
  pacoteId = sp.data!.id
  const cp = await db().from('client_packages').insert({
    client_id: bia, package_id: pacoteId, branch_id: outra.branchId, purchased_at: '2021-03-12T15:00:00Z',
    total_sessions: 1, used_sessions: 1, price: 450, preco_tabela: 500, desconto: 50, sold_by: outra.professionalId,
  }).select('id').single<{ id: string }>()
  expect(cp.error).toBeNull()
  const sessao = await db().from('appointments').insert({
    ...base, client_id: bia, status: 'COMPLETED', scheduled_at: '2021-03-13T12:00:00Z', price: 450,
  }).select('id').single<{ id: string }>()
  expect(sessao.error).toBeNull()
  expect((await db().from('package_sessions').insert({
    client_package_id: cp.data!.id, appointment_id: sessao.data!.id, status: 'USED',
    session_number: 1, procedure_id: outra.procedureId, preco: 450,
  })).error).toBeNull()
  // Vendido em abril: fora de março.
  expect((await db().from('client_packages').insert({
    client_id: bia, package_id: pacoteId, branch_id: outra.branchId, purchased_at: '2021-04-02T15:00:00Z',
    total_sessions: 1, used_sessions: 0, price: 500, preco_tabela: 500, desconto: 0, sold_by: outra.professionalId,
  })).error).toBeNull()

  // 3. Procedimento pré-pago: 3 unidades por 300.
  expect((await db().from('procedure_sales').insert({
    tenant_id: outra.tenantId, branch_id: outra.branchId, client_id: caio, procedure_id: outra.procedureId,
    quantity: 3, preco_unitario_tabela: 100, preco_tabela: 300, desconto: 0, price: 300,
    sold_by: outra.professionalId, sold_at: '2021-03-15T15:00:00Z',
  })).error).toBeNull()

  // 4. Plano fechado: o valor é o dos procedimentos dele (500 + 300).
  const plano = await db().from('treatment_plans').insert({
    branch_id: outra.branchId, professional_id: outra.professionalId, client_id: duda,
    status: 'ACCEPTED', name: nome('Plano Duda'), aceito_em: '2021-03-20T15:00:00Z',
  }).select('id').single<{ id: string }>()
  expect(plano.error, 'o plano fechado').toBeNull()
  const s1 = await db().from('treatment_plan_sessions').insert({ plan_id: plano.data!.id, sort_order: 0 }).select('id').single<{ id: string }>()
  const s2 = await db().from('treatment_plan_sessions').insert({ plan_id: plano.data!.id, sort_order: 1 }).select('id').single<{ id: string }>()
  expect((await db().from('treatment_plan_session_procedures').insert([
    { session_id: s1.data!.id, procedure_id: outra.procedureId, price: 500 },
    { session_id: s2.data!.id, procedure_id: outra.procedureId, price: 300 },
  ])).error).toBeNull()
  // A sessão do plano feita: já foi vendida no plano.
  expect((await db().from('appointments').insert({
    ...base, client_id: duda, status: 'COMPLETED', scheduled_at: '2021-03-25T12:00:00Z', price: 500,
    treatment_plan_id: plano.data!.id,
  })).error).toBeNull()
  // Plano em rascunho: não é venda.
  expect((await db().from('treatment_plans').insert({
    branch_id: outra.branchId, professional_id: outra.professionalId, client_id: duda, status: 'DRAFT', name: nome('Rascunho'),
  })).error).toBeNull()

  // Abril: 52 pré-pagos + o pacote de 2/4 = 53 vendas, para a paginação (50
  // por página) e a exportação, que leva TODAS.
  expect((await db().from('procedure_sales').insert(Array.from({ length: 52 }, (_, i) => ({
    tenant_id: outra.tenantId, branch_id: outra.branchId, client_id: caio, procedure_id: outra.procedureId,
    quantity: 1, preco_unitario_tabela: 10, preco_tabela: 10, desconto: 0, price: 10,
    sold_by: outra.professionalId, sold_at: new Date(Date.UTC(2021, 3, 5, 12, i)).toISOString(),
  })))).error).toBeNull()
})

test.afterAll(async () => {
  await gestor?.limpar()
  await semVendas?.limpar()
  if (pacoteId) {
    // O pacote do catálogo sai antes do procedimento que ele aponta (o
    // `limpar` da rede apaga os procedimentos); os vendidos, antes dele.
    const { data: vendidos } = await db().from('client_packages').select('id').eq('package_id', pacoteId)
    const ids = (vendidos ?? []).map(v => v.id as string)
    if (ids.length) {
      await db().from('package_sessions').delete().in('client_package_id', ids)
      await db().from('client_packages').delete().in('id', ids)
    }
    await db().from('service_packages').delete().eq('id', pacoteId)
  }
  await outra?.limpar()
})

async function como(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

const linhas = (p: Page) => p.locator('[data-venda]')

test('lista cada venda do período — procedimento, pacote, pré-pago e plano —, e só elas', async ({ browser }) => {
  await como(browser, gestor, async p => {
    await p.goto(MARCO)
    await expect(p.getByRole('button', { name: 'Vendas', exact: true })).toBeVisible()
    await expect(linhas(p)).toHaveCount(4)

    // Da mais recente para a mais antiga, com tipo, descrição, cliente,
    // profissional e valor.
    // O Intl põe espaço não separável depois do "R$".
    const texto = (await linhas(p).allInnerTexts()).map(t => t.replace(/ /g, ' '))
    const prof = `${PREFIXO} Prof vnd${marca}`
    expect(texto[0]).toContain('20/03/2021'); expect(texto[0]).toContain('Plano')
    expect(texto[0]).toContain(nome('Plano Duda')); expect(texto[0]).toContain(cliente('Duda'))
    expect(texto[0]).toContain(prof); expect(texto[0]).toContain('R$ 800,00')
    expect(texto[1]).toContain('Pré-pago'); expect(texto[1]).toContain('3×'); expect(texto[1]).toContain(cliente('Caio'))
    expect(texto[1]).toContain('R$ 300,00')
    expect(texto[2]).toContain('Pacote'); expect(texto[2]).toContain(nome('Pacote Glow')); expect(texto[2]).toContain(cliente('Bia'))
    expect(texto[2]).toContain('R$ 450,00')
    expect(texto[3]).toContain('10/03/2021'); expect(texto[3]).toContain('Procedimento')
    expect(texto[3]).toContain(`${PREFIXO} Proc vnd${marca}`); expect(texto[3]).toContain(cliente('Ana'))
    expect(texto[3]).toContain(prof); expect(texto[3]).toContain('R$ 180,00')

    // O total vem do banco, e bate com as linhas.
    await expect(p.locator('[data-total-vendas]')).toContainText('R$ 1.730,00')
    await expect(p.locator('[data-total-vendas]')).toContainText('4 vendas')

    // Filtro por tipo.
    await p.getByRole('button', { name: 'Pacotes', exact: true }).click()
    await expect(linhas(p)).toHaveCount(1)
    await expect(linhas(p).first()).toContainText(nome('Pacote Glow'))
    await expect(p.locator('[data-total-vendas]')).toContainText('R$ 450,00')
  })
})

test('pagina de 50 em 50, e a exportação leva todas as vendas do período', async ({ browser }) => {
  await como(browser, gestor, async p => {
    await p.goto(ABRIL)
    await expect(linhas(p)).toHaveCount(50)
    await expect(p.getByText('1–50 de 53')).toBeVisible()
    await p.getByRole('button', { name: 'Próxima', exact: true }).click()
    await expect(linhas(p)).toHaveCount(3)
    await expect(p.getByText('51–53 de 53')).toBeVisible()

    const exportar = p.getByRole('link', { name: /Exportar/ })
    const href = await exportar.getAttribute('href')
    const r = await p.request.get(href!)
    expect(r.status()).toBe(200)
    expect(r.headers()['content-type']).toContain('text/csv')
    const csv = (await r.text()).replace(/^﻿/, '').trim().split(/\r?\n/)
    expect(csv[0]).toBe('Data;Tipo;Descrição;Cliente;Profissional;Unidade;Valor')
    expect(csv).toHaveLength(54)
    // Da mais recente para a mais antiga: o pacote de 2/4 é a última.
    expect(csv[1]).toContain('Pré-pago')
    expect(csv[53]).toContain('Pacote')
  })
})

test('a aba é do cargo: quem não a tem não a vê, nem pela URL, nem pela exportação', async ({ browser }) => {
  await como(browser, semVendas, async p => {
    await p.goto(MARCO)
    await expect(p.getByRole('button', { name: 'Financeiro', exact: true })).toBeVisible()
    await expect(p.getByRole('button', { name: 'Vendas', exact: true })).toHaveCount(0)
    await expect(linhas(p)).toHaveCount(0)
    const r = await p.request.get('/api/relatorios/vendas?period=custom&from=2021-03-01&to=2021-03-31')
    expect(r.status()).toBe(403)
  })
})
