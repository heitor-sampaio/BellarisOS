import { test, expect } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * A exportação das vendas (`/api/relatorios/vendas`) de quem tem VÁRIAS
 * unidades (EQ1a/EQ1b, o Bloco Equipe; o risco anotado nele: as rotas de
 * `/api/*` que leem `ctx.branchId`). Em `/api/*` não há unidade no endereço,
 * e o `ctx.branchId` é a PRINCIPAL: sem `?branch=`, a rota exportava só ela,
 * calada, para quem tem A e B. O recorte é o das unidades DELA
 * (`ctx.unidades`/`alcancaUnidade`): sem pedido, A e B; com pedido, a pedida
 * dentre as dela; C, nunca.
 *
 * Numa rede `[e2e]` própria, com as vendas em março de 2021.
 */

test.describe.configure({ mode: 'serial', timeout: 180_000 })
test.use({ storageState: { cookies: [], origins: [] } })

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede
let pessoa: MembroDeTeste
const un = { A: '', B: '', C: '' }
const MARCO = 'period=custom&from=2021-03-01&to=2021-03-31'

test.beforeAll(async () => {
  test.setTimeout(240_000)
  rede = await criarOutraRede(`rvvu${marca}`)
  un.A = rede.branchId
  for (const letra of ['B', 'C'] as const) {
    const { data, error } = await db().from('branches')
      .insert({ tenant_id: rede.tenantId, name: `${PREFIXO} Unidade ${letra} ${marca}`, slug: `e2e-rvvu${letra.toLowerCase()}-${marca}` })
      .select('id').single<{ id: string }>()
    expect(error, `criar a unidade ${letra}`).toBeNull()
    un[letra] = data!.id
  }
  pessoa = await criarMembro(`rvvup${marca}`, {
    tenant: rede.tenantId, branchId: un.A, outrasUnidades: [un.B], rotulo: 'Duas unidades',
    permissoes: [{ modulo: 'reports', nivel: 'VIEW' }],
  })
  expect((await db().from('role_report_tabs').insert({ tenant_id: rede.tenantId, role_id: pessoa.roleId, tab: 'vendas' })).error).toBeNull()

  // Um atendimento avulso pago em cada unidade: Ana na A, Bia na B, Caio na C.
  for (const [letra, quem, valor] of [['A', 'Ana', 180], ['B', 'Bia', 250], ['C', 'Caio', 300]] as const) {
    const cliente = await rede.criarCliente(`${quem} ${letra}`)
    const ag = await db().from('appointments').insert({
      branch_id: un[letra], procedure_id: rede.procedureId, professional_id: rede.professionalId, duration_min: 30,
      client_id: cliente, status: 'COMPLETED', scheduled_at: '2021-03-10T12:00:00Z', price: valor,
    }).select('id').single<{ id: string }>()
    expect(ag.error, `o atendimento da ${letra}`).toBeNull()
    expect((await db().from('financial_transactions').insert({
      branch_id: un[letra], client_id: cliente, appointment_id: ag.data!.id, type: 'INCOME',
      category: 'Serviços', description: 'Atendimento', amount: valor,
      is_paid: true, paid_at: '2021-03-10T13:00:00Z', payment_method: 'PIX', created_by: rede.professionalId,
    })).error, `o pagamento da ${letra}`).toBeNull()
  }
})

test.afterAll(async () => {
  await pessoa?.limpar()
  await rede?.limpar()
})

test('sem unidade pedida, a exportação traz as DUAS unidades dela — e nunca a C', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: pessoa.estado })
  try {
    const p = await ctx.newPage()
    const r = await p.request.get(`/api/relatorios/vendas?${MARCO}`)
    expect(r.status()).toBe(200)
    const csv = await r.text()
    expect(csv, 'a venda da A').toContain(`Ana A`)
    expect(csv, 'a venda da B (era só a principal)').toContain(`Bia B`)
    expect(csv, 'a C não é dela').not.toContain(`Caio C`)

    const soB = await (await p.request.get(`/api/relatorios/vendas?${MARCO}&branch=${un.B}`)).text()
    expect(soB).toContain('Bia B')
    expect(soB).not.toContain('Ana A')

    expect((await p.request.get(`/api/relatorios/vendas?${MARCO}&branch=${un.C}`)).status(), 'a C pedida').toBe(404)
  } finally {
    await ctx.close()
  }
})
