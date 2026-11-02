import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * O pagamento com CRÉDITO INTERNO não é receita de novo (achado da F2b, F7 da
 * 5ª simulação). O dinheiro entrou quando a cliente pagou (o Pix do pacote
 * cancelado, que ficou), e o crédito é só o saldo dela na clínica. Quando ela
 * USA o crédito num atendimento, o lançamento "Crédito interno" é pago — e
 * `metrics_receitas_pagas` (a fonte única), o núcleo, a série, o "por
 * filial", a composição e o top de clientes o somavam: R$ 600 de receita para
 * R$ 300 que entraram.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let gestor: MembroDeTeste | null = null
let carla = ''
const agora = new Date().toISOString()
const de = new Date(Date.now() - 86_400_000).toISOString()
const ate = new Date(Date.now() + 86_400_000).toISOString()

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: gestor!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}
const brl = (t: string) => Number((/R\$\s*(-?[\d.]+,\d{2})/.exec(t)?.[1] ?? 'NaN').replace(/\./g, '').replace(',', '.'))

test.beforeAll(async () => {
  rede = await criarOutraRede(`ci${marca}`)
  gestor = await criarMembro(`cig${marca}`, {
    tenant: rede.tenantId, rotulo: 'Gestora',
    permissoes: [{ modulo: 'financial', nivel: 'VIEW' }, { modulo: 'reports', nivel: 'VIEW' }],
  })
  expect((await db().from('role_report_tabs').insert({ tenant_id: rede.tenantId, role_id: gestor.roleId, tab: 'overview' })).error).toBeNull()
  carla = await rede.criarCliente('Carla')

  // R$ 300 entram pelo Pix (o pacote que depois virou crédito na clínica).
  const pix = await db().from('financial_transactions').insert({
    branch_id: rede.branchId, client_id: carla, type: 'INCOME', category: 'Pacotes', description: `[e2e] pacote ${marca}`,
    amount: 300, payment_method: 'PIX', is_paid: true, paid_at: agora, created_by: 'e2e',
  })
  expect(pix.error).toBeNull()
  expect((await db().from('internal_credits').insert({
    client_id: carla, branch_id: rede.branchId, amount: 300, description: `[e2e] crédito do pacote cancelado ${marca}`,
  })).error).toBeNull()

  // Ela usa o crédito num atendimento de R$ 300.
  const { data: ag, error: eAg } = await db().from('appointments').insert({
    branch_id: rede.branchId, client_id: carla, procedure_id: rede.procedureId, professional_id: rede.professionalId,
    status: 'COMPLETED', source: 'INTERNAL', duration_min: 30, price: 300, scheduled_at: agora, completed_at: agora,
  }).select('id').single<{ id: string }>()
  expect(eAg).toBeNull()
  const uso = await db().from('financial_transactions').insert({
    branch_id: rede.branchId, client_id: carla, appointment_id: ag!.id, type: 'INCOME', category: 'Serviços',
    description: `[e2e] atendimento ${marca}`, amount: 300, payment_method: 'INTERNAL_CREDIT', is_paid: true, paid_at: agora, created_by: 'e2e',
  })
  expect(uso.error, 'pagar com o crédito').toBeNull()
})
test.afterAll(async () => {
  await db().from('internal_credits').delete().eq('client_id', carla)
  await db().from('financial_transactions').delete().eq('branch_id', rede!.branchId)
  await gestor?.limpar(); await rede?.limpar()
})

test('o uso do crédito interno não soma receita: R$ 300 entraram, não R$ 600', async ({ browser }) => {
  const p = { p_tenant: rede!.tenantId, p_branch_ids: [rede!.branchId], p_from: de, p_to: ate }

  // O saldo foi consumido (o gatilho): 300 − 300.
  const { data: cred } = await db().from('internal_credits').select('amount').eq('client_id', carla)
  expect((cred ?? []).reduce((s, c) => s + Number(c.amount), 0)).toBe(0)

  const { data: pagas, error: e1 } = await db().rpc('metrics_receitas_pagas', p)
  expect(e1).toBeNull()
  expect((pagas as { amount: number }[]).reduce((s, t) => s + Number(t.amount), 0)).toBe(300)

  const { data: core, error: e2 } = await db().rpc('metrics_core', p)
  expect(e2).toBeNull()
  expect(Number(core![0]!.revenue_cash)).toBe(300)

  const { data: serie, error: e3 } = await db().rpc('metrics_series', { ...p, p_granularity: 'day' })
  expect(e3).toBeNull()
  expect((serie as { revenue: number }[]).reduce((s, x) => s + Number(x.revenue), 0)).toBe(300)

  const { data: porFilial, error: e4 } = await db().rpc('metrics_by_branch', { p_tenant: rede!.tenantId, p_from: de, p_to: ate })
  expect(e4).toBeNull()
  expect(Number((porFilial as { branch_id: string; revenue_cash: number }[]).find(b => b.branch_id === rede!.branchId)!.revenue_cash)).toBe(300)

  const { data: comp, error: e5 } = await db().rpc('metrics_financeiro_composicao', p)
  expect(e5).toBeNull()
  const linhas = comp as { grupo: string; chave: string; valor: number }[]
  expect(linhas.filter(l => l.grupo === 'FORMA').map(l => [l.chave, Number(l.valor)])).toEqual([['PIX', 300]])
  expect(linhas.filter(l => l.grupo === 'RECEITA').reduce((s, l) => s + Number(l.valor), 0)).toBe(300)

  const { data: top, error: e6 } = await db().rpc('metrics_top_clients', { ...p, p_limit: 10 })
  expect(e6).toBeNull()
  expect(Number((top as { total_spent: number }[])[0]!.total_spent)).toBe(300)

  // A tela: o Faturamento dos Relatórios é o que entrou.
  await como(browser, async pg => {
    await pg.goto('/admin/reports?period=month')
    const cartao = pg.getByText('Faturamento', { exact: true }).first().locator('xpath=ancestor::div[contains(@class,"card")][1]')
    await expect.poll(async () => brl(await cartao.innerText()), { timeout: 15_000 }).toBe(300)
  })
})
