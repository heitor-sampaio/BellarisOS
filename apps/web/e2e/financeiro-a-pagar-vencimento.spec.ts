import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * "A pagar" e "A receber" dizem que valem pelo VENCIMENTO, e o próximo
 * quando o período dá zero (A34 da simulação de 2026-10-27).
 *
 * O Rafael viu "A pagar R$ 0" em "Este mês" com uma conta de R$ 300 vencendo
 * em 05/11, sem nada dizendo que o período é o do vencimento — parecia que a
 * conta tinha sumido.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let financeiro: MembroDeTeste | null = null
let slug = ''

// O dia 5 do mês que vem, ao meio-dia de Brasília (fora de "Este mês").
const hoje = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }))
const ano = hoje.getMonth() === 11 ? hoje.getFullYear() + 1 : hoje.getFullYear()
const mes = (hoje.getMonth() + 1) % 12 + 1
const DIA = `${ano}-${String(mes).padStart(2, '0')}-05`
const ROTULO = `05/${String(mes).padStart(2, '0')}`

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: financeiro!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`av${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  financeiro = await criarMembro(`avf${marca}`, {
    tenant: rede.tenantId, rotulo: 'Financeiro', permissoes: [{ modulo: 'financial', nivel: 'MANAGE' }],
  })
  const vence = new Date(`${DIA}T12:00:00-03:00`).toISOString()
  const { error } = await db().from('financial_transactions').insert([
    { branch_id: rede.branchId, type: 'EXPENSE', category: 'Aluguel', description: `[e2e] Aluguel ${marca}`,
      amount: 300, is_paid: false, due_date: vence, created_by: 'e2e' },
    { branch_id: rede.branchId, type: 'INCOME', category: 'Serviços', description: `[e2e] Parcela ${marca}`,
      amount: 150, is_paid: false, due_date: vence, created_by: 'e2e' },
  ])
  expect(error).toBeNull()
})
test.afterAll(async () => {
  await db().from('financial_transactions').delete().eq('branch_id', rede!.branchId)
  await financeiro?.limpar(); await rede?.limpar()
})

test('o financeiro da unidade: zero no mês, pelo vencimento, e o próximo', async ({ browser }) => {
  await como(browser, async p => {
    await p.goto(`/${slug}/financeiro?period=month`)
    const aPagar = p.locator('[data-kpi="a-pagar"]')
    await expect(aPagar).toContainText('R$ 0,00')
    await expect(aPagar).toContainText(/pelo vencimento/i)
    await expect(aPagar).toContainText(`R$ 300,00 em ${ROTULO}`)
    const aReceber = p.locator('[data-kpi="a-receber"]')
    await expect(aReceber).toContainText(/pelo vencimento/i)
    await expect(aReceber).toContainText(`R$ 150,00 em ${ROTULO}`)
  })
})

test('o financeiro da rede: o mesmo', async ({ browser }) => {
  await como(browser, async p => {
    await p.goto('/admin/financeiro?period=month')
    const aPagar = p.locator('[data-kpi="a-pagar"]')
    await expect(aPagar).toContainText('R$ 0,00')
    await expect(aPagar).toContainText(/pelo vencimento/i)
    await expect(aPagar).toContainText(`R$ 300,00 em ${ROTULO}`)
    await expect(p.locator('[data-kpi="a-receber"]')).toContainText(`R$ 150,00 em ${ROTULO}`)
  })
})
