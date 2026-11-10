import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * Os textos do dinheiro da 10ª simulação (2026-11-10), da F49 — princípio 3:
 * - D4: o resultado dizia "competência" e deixava de fora o aluguel de
 *   novembro a pagar (R$ 9.000) — a regra é a despesa PAGA, como a receita
 *   (indicadores.md: "Receita e despesa simétricas"). A frase passa a dizer a
 *   regra, com o "A pagar no período, fora do resultado" ao lado.
 * - D8: a perda "não sai do lucro: já foi paga na compra" — mas a compra
 *   também fica fora do lucro, e a perda nunca entra nele. O texto diz a regra.
 * Numa rede [e2e] própria, de uma unidade.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let slug = ''
let dona: MembroDeTeste | null = null

async function como(browser: Browser, m: { estado: string }, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  test.setTimeout(150_000)
  rede = await criarOutraRede(`fa10${marca}`)
  const b = db()
  expect((await b.from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  slug = (await b.from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  dona = await criarMembro(`fa10d${marca}`, { tenant: rede.tenantId, donoDaRede: true, rotulo: 'Dona', permissoes: [] })
  // O aluguel do mês, a pagar (vence hoje), e uma despesa paga.
  const hoje = new Date().toISOString()
  expect((await b.from('financial_transactions').insert([
    { branch_id: rede.branchId, type: 'EXPENSE', category: 'Aluguel', description: 'Aluguel de novembro', amount: 9000, is_paid: false, due_date: hoje, created_by: 'e2e' },
    { branch_id: rede.branchId, type: 'EXPENSE', category: 'Outros', description: 'Material de escritório', amount: 200, is_paid: true, paid_at: hoje, payment_method: 'PIX', created_by: 'e2e' },
  ])).error).toBeNull()
})

test.afterAll(async () => {
  await dona?.limpar(); await rede?.limpar()
})

test('D4: o resultado diz a regra (o que foi pago) e o que fica a pagar fora dele', async ({ browser }) => {
  await como(browser, dona!, async p => {
    for (const tela of [`/${slug}/financeiro`, '/admin/financeiro']) {
      await p.goto(tela)
      const base = p.locator('[data-base-do-resultado]').first()
      await expect(base).toContainText('a receita e a despesa pelo que foi pago')
      await expect(base).toContainText('o insumo quando é usado')
      await expect(base).toContainText('a comissão quando é lançada')
      await expect(base).not.toContainText('competência')
      await expect(p.locator('[data-a-pagar-fora-do-resultado]').first()).toHaveText(/A pagar no período, fora do resultado: R\$\s9\.000,00/)
    }
  })
})

test('D8: a perda diz a regra de verdade — é métrica e não entra no lucro, nem quando a compra é paga', async ({ browser }) => {
  await como(browser, dona!, async p => {
    await p.goto('/admin/reports?tab=financeiro')
    const fora = p.locator('[data-fora-do-lucro]')
    await expect(fora).toContainText('A perda e o ajuste de estoque ficam fora do lucro')
    await expect(fora).toContainText('nem quando a compra é paga')
    await expect(fora).not.toContainText('já foi pago na compra')
    await p.goto('/admin/reports?tab=estoque')
    await expect(p.getByText('Métrica: não entra no lucro, nem quando a compra é paga')).toBeVisible()
    await expect(p.getByText('Não sai do lucro: já foi paga na compra')).toHaveCount(0)
  })
})
