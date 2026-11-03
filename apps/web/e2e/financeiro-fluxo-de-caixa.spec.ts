import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * r2-fin-04 (o Heitor, revisão de 03/11: "crie o gráfico"). No Financeiro, o
 * fluxo de caixa dos PRÓXIMOS meses, mês a mês: o que entra (a receber da
 * cliente e da operadora do cartão) e o que sai (as despesas a pagar), e o
 * saldo. A conta é do banco (`metrics_fluxo_de_caixa`, `lib/metrics`); o que
 * já venceu e está em aberto entra no mês atual. Numa rede [e2e] própria.
 */

const marca = Date.now().toString(36)
const db = () => banco()
const n = (v: unknown) => Number(v ?? 0)
let rede: OutraRede | null = null
let gestor: MembroDeTeste | null = null
let cliente = ''
let slug = ''
let venda = ''

/** "AAAA-MM" de uma data, em Brasília. */
const mesSP = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).format(d).slice(0, 7)
/** O mês corrente + k, "AAAA-MM". */
function mesMais(k: number) {
  const [a, m] = mesSP(new Date()).split('-').map(Number) as [number, number]
  const d = new Date(Date.UTC(a, m - 1 + k, 1))
  return d.toISOString().slice(0, 7)
}
/** Meio-dia de Brasília do dia 10 do mês corrente + k. */
const dia10 = (k: number) => `${mesMais(k)}-10T12:00:00-03:00`

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: gestor!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}
async function lancar(campos: Record<string, unknown>) {
  const { data, error } = await db().from('financial_transactions').insert({
    branch_id: rede!.branchId, client_id: cliente, created_by: 'e2e', description: `${PREFIXO} fluxo ${marca}`, ...campos,
  }).select('id').single<{ id: string }>()
  expect(error, 'lançar').toBeNull()
  return data!.id
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`fdc${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  cliente = await rede.criarCliente('Fluxo')
  gestor = await criarMembro(`fdcg${marca}`, {
    tenant: rede.tenantId, rotulo: 'Financeiro', permissoes: [{ modulo: 'financial', nivel: 'MANAGE' }, { modulo: 'cashier', nivel: 'MANAGE' }],
  })
  // A cliente deve R$ 100 vencidos no mês passado e R$ 300 que vencem no mês que vem.
  await lancar({ type: 'INCOME', category: 'Serviços', amount: 100, is_paid: false, due_date: dia10(-1) })
  await lancar({ type: 'INCOME', category: 'Serviços', amount: 300, is_paid: false, due_date: dia10(1) })
  // A clínica paga R$ 250 daqui a dois meses.
  await lancar({ type: 'EXPENSE', category: 'Contas (energia, água, internet)', amount: 250, is_paid: false, due_date: dia10(2) })
  // E a venda de R$ 900 no crédito 3x: a operadora deposita a cada 30 dias.
  venda = await lancar({ type: 'INCOME', category: 'Serviços', amount: 900, payment_method: 'CREDIT_CARD', cartao_vezes: 3, is_paid: true, paid_at: new Date().toISOString() })
})

test.afterAll(async () => {
  if (rede) await db().from('financial_transactions').delete().eq('branch_id', rede.branchId)
  await gestor?.limpar()
  await rede?.limpar()
})

test('o fluxo de caixa dos próximos 6 meses: o que entra (da cliente e da operadora), o que sai e o saldo', async ({ browser }) => {
  // O que a operadora deposita, mês a mês, pelo vencimento de cada parcela.
  const { data: parcelas } = await db().rpc('recebiveis_do_cartao_lista', { p_tenant: rede!.tenantId, p_branch_ids: null, p_from: null, p_to: null })
  const operadora: Record<string, number> = {}
  for (const p of (parcelas ?? []) as { transaction_id: string; vencimento_dia: string; valor: number }[]) {
    if (p.transaction_id !== venda) continue
    const mes = p.vencimento_dia.slice(0, 7)
    operadora[mes] = (operadora[mes] ?? 0) + n(p.valor)
  }

  const { data, error } = await db().rpc('metrics_fluxo_de_caixa', { p_tenant: rede!.tenantId, p_branch_ids: [rede!.branchId], p_meses: 6 })
  expect(error).toBeNull()
  const linhas = (data as { mes: string; da_cliente: number; da_operadora: number; a_pagar: number; saldo: number }[])
    .map(l => ({ mes: String(l.mes).slice(0, 7), cliente: n(l.da_cliente), operadora: n(l.da_operadora), pagar: n(l.a_pagar), saldo: n(l.saldo) }))
  const esperado = [0, 1, 2, 3, 4, 5].map(k => {
    const mes = mesMais(k)
    const cliente = k === 0 ? 100 : k === 1 ? 300 : 0       // o vencido entra no mês atual
    const op = operadora[mes] ?? 0
    const pagar = k === 2 ? 250 : 0
    return { mes, cliente, operadora: op, pagar, saldo: Math.round((cliente + op - pagar) * 100) / 100 }
  })
  expect(linhas).toEqual(esperado)

  await como(browser, async p => {
    for (const rota of ['/admin/financeiro', `/${slug}/financeiro`]) {
      await p.goto(rota)
      const card = p.locator('[data-fluxo-de-caixa]')
      await expect(card, rota).toBeVisible()
      await expect(card).toContainText('Fluxo de caixa')
      const proximo = card.locator(`[data-mes="${mesMais(1)}"]`)
      await expect(proximo, `${rota}: o mês que vem`).toContainText('R$ 300,00')
      await expect(card.locator(`[data-mes="${mesMais(2)}"]`)).toContainText('R$ 250,00')
    }
  })
})
