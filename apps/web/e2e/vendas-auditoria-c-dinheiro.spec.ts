import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { clienteComSessao, criarMembro, type ClienteDeTeste, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'

/**
 * As correções da auditoria das regras (2026-11-18), agente C — o dinheiro, na
 * tela e no banco (o resto em `tests/auditoria-c-dinheiro.test.ts`):
 *
 * - item 6 (decisão do Claude pelos princípios, sobre a fala do Heitor no
 *   bônus: "não vamos fazer as clinicas perderem dinheiro"): o estorno da venda
 *   de crédito devolve só o crédito VENDIDO que sobrou — o concedido fica com a
 *   cliente, e a janela diz quanto;
 * - item 7 (decisão do Claude pelo princípio 2): o plano com a proposta vencida
 *   se aceita pelo app, com o aviso.
 *
 * Numa rede [e2e] própria.
 */

const marca = Date.now().toString(36)
const db = () => banco()
const n = (v: unknown) => Number(v ?? 0)
let rede: OutraRede | null = null
let slug = ''
let dona: MembroDeTeste | null = null
let cliente: ClienteDeTeste | null = null
let rosana = ''
let plano = ''

async function comMembro(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}
async function comCliente(browser: Browser, c: ClienteDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: c.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}
const saldoDe = async (id: string) => {
  const { data, error } = await db().from('internal_credits').select('amount').eq('client_id', id)
  expect(error).toBeNull()
  return Math.round((data ?? []).reduce((s, r) => s + n(r.amount), 0) * 100) / 100
}

test.beforeAll(async () => {
  test.setTimeout(150_000)
  rede = await criarOutraRede(`audc${marca}`)
  const b = db()
  expect((await b.from('tenants').update({ onboarding_completed_at: new Date().toISOString(), plano_validade_dias: 10 }).eq('id', rede.tenantId)).error).toBeNull()
  slug = (await b.from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  dona = await criarMembro(`audcd${marca}`, { tenant: rede.tenantId, donoDaRede: true, rotulo: 'Dona', permissoes: [] })
  rosana = await rede.criarCliente('Rosana')
  cliente = await clienteComSessao(`audcc${marca}`, { id: rede.branchId, slug }, { tenant: rede.tenantId })
  // O plano proposto há 40 dias, com a validade de 10: venceu.
  const { data: pl, error: ePl } = await b.from('treatment_plans').insert({
    branch_id: rede.branchId, client_id: cliente.clientId, professional_id: rede.professionalId,
    status: 'PROPOSED', name: `[e2e] Plano vencido ${marca}`, created_at: new Date(Date.now() - 40 * 86_400_000).toISOString(),
  }).select('id').single<{ id: string }>()
  expect(ePl).toBeNull()
  plano = pl!.id
  const { data: sessao, error: eS } = await b.from('treatment_plan_sessions').insert({ plan_id: plano, sort_order: 0 }).select('id').single<{ id: string }>()
  expect(eS).toBeNull()
  expect((await b.from('treatment_plan_session_procedures').insert({ session_id: sessao!.id, procedure_id: rede.procedureId, price: 300 })).error).toBeNull()
})
test.afterAll(async () => {
  if (plano) await db().from('treatment_plans').delete().eq('id', plano)
  await cliente?.limpar(); await rede?.limpar()
})

test('item 6: o estorno da venda de crédito não devolve em dinheiro o crédito concedido', async ({ browser }) => {
  test.setTimeout(120_000)
  // R$ 300 vendidos no Pix, R$ 100 concedidos pela rede ("Conceder crédito"), R$ 119 usados.
  await comMembro(browser, dona!, async p => {
    await p.goto(`/${slug}/pdv`)
    const r = await chamarAcao(p, 'actions/credito-interno.ts', 'venderCredito', `/${slug}/pdv`, [rosana, rede!.branchId, '300', { forma: 'AVISTA', metodo: 'PIX' }, null])
    expect(r.texto).toContain('vendaId')
  })
  expect((await db().from('internal_credits').insert({ client_id: rosana, branch_id: rede!.branchId, amount: 100, description: 'Cortesia [e2e]', concedido: true })).error).toBeNull()
  expect((await db().from('financial_transactions').insert({
    branch_id: rede!.branchId, client_id: rosana, type: 'INCOME', category: 'Serviços', description: 'Limpeza paga com crédito [e2e]',
    amount: 119, is_paid: true, paid_at: new Date().toISOString(), payment_method: 'INTERNAL_CREDIT', created_by: dona!.userId,
  })).error).toBeNull()
  expect(await saldoDe(rosana)).toBe(281)

  await comMembro(browser, dona!, async p => {
    await p.goto(`/${slug}/financeiro?aba=movimentacoes`)
    const linha = p.locator('[data-lancamento]', { hasText: 'Crédito interno' }).filter({ hasText: '300,00' }).first()
    await linha.getByRole('button', { name: 'Estornar' }).click()
    const dlg = p.getByRole('dialog', { name: 'Estornar a venda de crédito interno?' })
    // Era "Volta à cliente R$ 281,00": os R$ 100 de presente viravam dinheiro.
    await expect(dlg.locator('[data-concedido-fica]')).toContainText(/R\$\s100,00/)
    await expect(dlg.locator('[data-conta-do-estorno-do-credito]')).toContainText(/Volta à cliente\s*R\$\s181,00/)
    await dlg.getByRole('radio', { name: /Estorno parcial/ }).check()
    await dlg.getByLabel('Motivo do estorno').fill('Desistiu do vale [e2e]')
    await dlg.getByRole('button', { name: 'Confirmar estorno' }).click()
    await expect(dlg).toBeHidden({ timeout: 15_000 })
  })
  const { data: contra } = await db().from('financial_transactions').select('amount, payment_method').eq('client_id', rosana).eq('category', 'Estorno')
  expect((contra ?? []).map(c => [n(c.amount), c.payment_method])).toEqual([[181, 'PIX']])
  expect(await saldoDe(rosana), 'o concedido fica com ela, como crédito').toBe(100)
})

test('item 7: o plano com a proposta vencida se aceita pelo app, com o aviso', async ({ browser }) => {
  test.setTimeout(90_000)
  await comCliente(browser, cliente!, async p => {
    await p.goto(`/${slug}/cliente/planos/${plano}`)
    await expect(p.locator('[data-proposta-vencida]')).toContainText('os valores podem ter mudado')
    await p.getByRole('button', { name: 'Aceitar o plano' }).click()
    await expect(p.locator('[data-plano-aceito-no-app]')).toBeVisible({ timeout: 20_000 })
  })
  expect((await db().from('treatment_plans').select('status').eq('id', plano).single()).data!.status).toBe('ACCEPTED')
})
