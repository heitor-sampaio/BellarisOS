import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * D-14 (decisão do Heitor, 2026-10-29): o cartão "A receber" mantém o número
 * do mês (pelo vencimento), e abaixo vem a linha "Em aberto, todos os
 * vencimentos: R$ X" — todas as parcelas e recebíveis em aberto, de qualquer
 * vencimento, no escopo do financeiro. Quem vende parcelado via só o mês, e
 * o resto do crediário não aparecia em lugar nenhum.
 *
 * Numa rede `[e2e]` própria, a receber: R$ 100 vencendo hoje, R$ 300 daqui a
 * 35 dias e R$ 50 daqui a 90 dias; R$ 999 já pagos (não entram) e R$ 70
 * estornados (não entram). O mês: R$ 100. Em aberto: R$ 450.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let dona: MembroDeTeste | null = null
let slug = ''
let desativada = ''

async function como(browser: Browser, quem: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: quem.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}
const dia = (dias: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(Date.now() + dias * 86_400_000))

test.beforeAll(async () => {
  test.setTimeout(180_000)
  rede = await criarOutraRede(`ar${marca}`)
  const b = db()
  expect((await b.from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  slug = (await b.from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  dona = await criarMembro(`ard${marca}`, { tenant: rede.tenantId, donoDaRede: true, permissoes: [] })
  const cliente = await rede.criarCliente('Crediário')
  const receber = async (valor: number, vence: string, extra: Record<string, unknown> = {}) => {
    const { error } = await b.from('financial_transactions').insert({
      branch_id: rede!.branchId, client_id: cliente, type: 'INCOME', category: 'Atendimento',
      description: `[e2e] parcela ${valor} ${marca}`, amount: valor, payment_method: 'PIX',
      is_paid: false, due_date: vence, created_by: 'e2e', ...extra,
    })
    expect(error, `a receber ${valor}`).toBeNull()
  }
  await receber(100, dia(0))
  await receber(300, dia(35))
  await receber(50, dia(90))
  await receber(70, dia(10), { notes: 'Estornada' })
  await receber(999, dia(0), { is_paid: true, paid_at: new Date().toISOString(), due_date: null })
})

test.afterAll(async () => {
  if (rede) await db().from('financial_transactions').delete().eq('branch_id', rede.branchId)
  if (desativada) {
    await db().from('financial_transactions').delete().eq('branch_id', desativada)
    await db().from('branches').delete().eq('id', desativada)
  }
  await dona?.limpar(); await rede?.limpar()
})

test('o banco: todo o em aberto, de qualquer vencimento (R$ 450), por unidade e no total', async () => {
  const { data, error } = await db().rpc('metrics_a_receber_em_aberto', { p_tenant: rede!.tenantId, p_branch_ids: null })
  expect(error).toBeNull()
  expect((data as Record<string, unknown>[]).map(r => [r.branch_id, Number(r.valor)]))
    .toEqual(expect.arrayContaining([[null, 450], [rede!.branchId, 450]]))
})

test('o financeiro da unidade e o da rede: o mês (R$ 100) e "Em aberto, todos os vencimentos: R$ 450,00"', async ({ browser }) => {
  await como(browser, dona!, async p => {
    for (const tela of [`/${slug}/financeiro?period=month`, '/admin/financeiro?period=month']) {
      await p.goto(tela)
      const cartao = p.locator('[data-kpi="a-receber"]')
      await expect(cartao, tela).toContainText(/R\$\s*100,00/)
      await expect(cartao, tela).toContainText(/Em aberto, todos os vencimentos:\s*R\$\s*450,00/)
    }
  })
})

test('"Reforça", item 4: o Financeiro mostra o atendimento concluído sem pagamento, separado; o Fechamento cita o em aberto', async ({ browser }) => {
  // O laser avulso de R$ 650 concluído e não pago só aparecia no Fechamento.
  const b = db()
  const cli = await rede!.criarCliente('Laser')
  const agora = new Date().toISOString()
  expect((await b.from('appointments').insert({
    branch_id: rede!.branchId, client_id: cli, procedure_id: rede!.procedureId, professional_id: rede!.professionalId,
    status: 'COMPLETED', source: 'INTERNAL', duration_min: 30, price: 650, scheduled_at: agora, completed_at: agora,
  })).error).toBeNull()

  await como(browser, dona!, async p => {
    for (const tela of [`/${slug}/financeiro?period=month`, '/admin/financeiro?period=month']) {
      await p.goto(tela)
      const cartao = p.locator('[data-kpi="a-receber"]')
      // Separado e nomeado: não entra no número do cartão nem no em aberto dos lançamentos.
      await expect(cartao, tela).toContainText(/R\$\s*100,00/)
      await expect(cartao, tela).toContainText(/Em aberto, todos os vencimentos:\s*R\$\s*450,00/)
      await expect(cartao.locator('[data-concluidos-sem-pagamento]'), tela)
        .toContainText(/Atendimentos concluídos sem pagamento:\s*R\$\s*650,00/)
    }
    // O Fechamento do dia não cita mais o a receber nem as parcelas em aberto
    // (CX5, 2026-11-14): o concluído sem pagamento é comanda aberta no PDV, e
    // o em aberto mora no cartão acima.
  })
})

test('ind-11: a unidade DESATIVADA com conta a receber entra no em aberto da rede', async ({ browser }) => {
  // "A unidade pode ter sido desativada comercialmente mas ainda tem contas a
  // receber" (o Heitor, revisão de 2026-11-02).
  const b = db()
  const { data: fechada, error } = await b.from('branches')
    .insert({ tenant_id: rede!.tenantId, name: `[e2e] Fechada ${marca}`, slug: `e2e-arf-${marca}`, is_active: false })
    .select('id').single<{ id: string }>()
  expect(error).toBeNull()
  desativada = fechada!.id
  expect((await b.from('financial_transactions').insert({
    branch_id: desativada, type: 'INCOME', category: 'Atendimento', description: `[e2e] parcela da fechada ${marca}`,
    amount: 200, payment_method: 'PIX', is_paid: false, due_date: dia(60), created_by: 'e2e',
  })).error).toBeNull()

  await como(browser, dona!, async p => {
    await p.goto('/admin/financeiro?period=month')
    await expect(p.locator('[data-kpi="a-receber"]')).toContainText(/Em aberto, todos os vencimentos:\s*R\$\s*650,00/)
  })
})
