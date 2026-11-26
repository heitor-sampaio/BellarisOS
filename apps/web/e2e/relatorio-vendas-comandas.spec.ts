import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * RL1 (a revisão do Heitor, 2026-11-13: "rl1 ok"): Relatórios → Vendas lista
 * as COMANDAS do PDV — cada venda, do que for: atendimento avulso, pacote,
 * plano, produto e crédito. Cada linha diz o número da comanda dela; o
 * crédito interno vendido entra na lista, no filtro e no Total vendido (o
 * Heitor, 25/11: "se o crédito foi vendido, é venda, tem que contar, não conta
 * é quando só usa"). O CSV leva a comanda.
 *
 * Rede `[e2e]` própria, com as datas em maio de 2021.
 */

test.describe.configure({ mode: 'serial' })

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede
let gestor: MembroDeTeste
let pacoteId = ''
let comandaDoCredito = 0
let comandaDoPacote = 0
const nome = (r: string) => `${PREFIXO} ${r} ${marca}`

const MAIO = '/admin/reports?tab=vendas&period=custom&from=2021-05-01&to=2021-05-31'

test.beforeAll(async () => {
  test.setTimeout(180_000)
  rede = await criarOutraRede(`rl1${marca}`)
  gestor = await criarMembro(`rl1g${marca}`, { tenant: rede.tenantId, rotulo: 'Relatórios', permissoes: [{ modulo: 'reports', nivel: 'VIEW' }] })
  expect((await db().from('role_report_tabs').insert({ tenant_id: rede.tenantId, role_id: gestor.roleId, tab: 'vendas' })).error).toBeNull()

  const ana = await rede.criarCliente('Ana')
  const bia = await rede.criarCliente('Bia')

  // O pacote vendido e recebido no PDV: a comanda nasce do recebimento.
  const sp = await db().from('service_packages').insert({
    tenant_id: rede.tenantId, procedure_id: rede.procedureId, name: nome('Pacote Glow'), total_sessions: 2, price: 400,
  }).select('id').single<{ id: string }>()
  expect(sp.error).toBeNull()
  pacoteId = sp.data!.id
  const cp = await db().from('client_packages').insert({
    client_id: bia, package_id: pacoteId, branch_id: rede.branchId, purchased_at: '2021-05-12T15:00:00Z',
    total_sessions: 2, used_sessions: 0, price: 400, preco_tabela: 400, desconto: 0, sold_by: rede.professionalId,
  }).select('id').single<{ id: string }>()
  expect(cp.error).toBeNull()
  expect((await db().from('financial_transactions').insert({
    branch_id: rede.branchId, client_id: bia, client_package_id: cp.data!.id, type: 'INCOME', category: 'Pacote',
    description: 'Pacote', amount: 400, is_paid: true, paid_at: '2021-05-12T15:00:00Z', created_at: '2021-05-12T15:00:00Z',
    payment_method: 'PIX', created_by: 'e2e',
  })).error, 'o recebimento do pacote').toBeNull()

  // O crédito na clínica vendido (R$ 300) no PDV.
  const cv = await db().from('creditos_vendidos').insert({
    tenant_id: rede.tenantId, branch_id: rede.branchId, client_id: ana, valor: 300,
    registrado_por_nome: 'e2e', created_at: '2021-05-14T15:00:00Z',
  }).select('id').single<{ id: string }>()
  expect(cv.error, cv.error?.message).toBeNull()
  expect((await db().from('financial_transactions').insert({
    branch_id: rede.branchId, client_id: ana, credito_vendido_id: cv.data!.id, type: 'INCOME', category: 'Crédito interno',
    description: 'Crédito interno', amount: 300, is_paid: true, paid_at: '2021-05-14T15:00:00Z', created_at: '2021-05-14T15:00:00Z',
    payment_method: 'PIX', created_by: 'e2e',
  })).error, 'o recebimento do crédito').toBeNull()

  const { data: comandas } = await db().from('comandas').select('numero, credito_vendido_id, client_package_id').eq('tenant_id', rede.tenantId)
  comandaDoCredito = (comandas ?? []).find(c => c.credito_vendido_id === cv.data!.id)?.numero as number
  comandaDoPacote = (comandas ?? []).find(c => c.client_package_id === cp.data!.id)?.numero as number
  expect(comandaDoCredito, 'a comanda do crédito').toBeGreaterThan(0)
  expect(comandaDoPacote, 'a comanda do pacote').toBeGreaterThan(0)
})

test.afterAll(async () => {
  await gestor?.limpar()
  await rede?.limpar()
})

async function como(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado, viewport: { width: 1440, height: 900 } })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

const linhas = (p: Page) => p.locator('[data-venda]')

test('cada linha é uma comanda — o crédito também —, e o crédito vendido conta no Total vendido', async ({ browser }) => {
  await como(browser, gestor, async p => {
    await p.goto(MAIO)
    await expect(linhas(p)).toHaveCount(2)
    const credito = linhas(p).nth(0)
    await expect(credito).toContainText('14/05/2021')
    await expect(credito).toContainText('Crédito interno')
    await expect(credito.locator('[data-comanda]')).toHaveText(`Nº ${comandaDoCredito}`)
    await expect(linhas(p).nth(1).locator('[data-comanda]')).toHaveText(`Nº ${comandaDoPacote}`)

    // O Total vendido é o pacote e o crédito vendido (o Heitor, 25/11).
    await expect(p.locator('[data-total-vendas]')).toContainText('R$ 700,00')
    await expect(p.locator('[data-total-vendas]')).toContainText('2 vendas')
    await expect(p.locator('[data-credito-fora-do-total]')).toHaveCount(0)

    // O filtro por tipo tem o crédito.
    await p.getByRole('button', { name: 'Créditos', exact: true }).click()
    await expect(linhas(p)).toHaveCount(1)
    await expect(linhas(p).first()).toContainText('Crédito interno')
  })
})

test('o CSV leva a comanda e o crédito', async ({ browser }) => {
  await como(browser, gestor, async p => {
    await p.goto(MAIO)
    const href = await p.getByRole('link', { name: /Exportar/ }).getAttribute('href')
    const r = await p.request.get(href!)
    expect(r.status()).toBe(200)
    const csv = (await r.text()).replace(/^﻿/, '').trim().split(/\r?\n/)
    expect(csv[0]).toBe('Data;Comanda;Tipo;Descrição;Cliente;Profissional;Unidade;Valor')
    expect(csv).toHaveLength(3)
    expect(csv[1]).toMatch(new RegExp(`^14/05/2021;${comandaDoCredito};Crédito interno;`))
    expect(csv[1]).toContain('300,00')
    expect(csv[2]).toMatch(new RegExp(`^12/05/2021;${comandaDoPacote};Pacote;`))
  })
})
