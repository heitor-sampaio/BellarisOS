import { test, expect } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * J-48 (simulação de 2026-10-30): o total da lista do financeiro vinha sem
 * sinal — "6 lançamentos · R$ 2.400,00" era um resultado NEGATIVO (só a cor
 * dizia). O total diz o sinal, e a conta é a de lib/metrics (o pago que entrou
 * menos o pago que saiu, sem os dois lados do estorno).
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let financeiro: MembroDeTeste | null = null
let slug = ''

test.beforeAll(async () => {
  rede = await criarOutraRede(`fts${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  financeiro = await criarMembro(`ftsf${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Financeiro', permissoes: [{ modulo: 'financial', nivel: 'MANAGE' }],
  })
  const agora = new Date().toISOString()
  const base = { branch_id: rede.branchId, is_paid: true, paid_at: agora, created_by: 'e2e' }
  const { error } = await db().from('financial_transactions').insert([
    { ...base, type: 'INCOME', category: 'Serviços', description: `Limpeza ${marca}`, amount: 300, payment_method: 'PIX' },
    { ...base, type: 'EXPENSE', category: 'Aluguel', description: `Aluguel ${marca}`, amount: 2700, payment_method: 'PIX' },
  ])
  expect(error).toBeNull()
})
test.afterAll(async () => {
  if (rede) await db().from('financial_transactions').delete().eq('branch_id', rede.branchId)
  await financeiro?.limpar(); await rede?.limpar()
})

test('o total da lista diz o sinal: entrou R$ 300, saiu R$ 2.700 — resultado −R$ 2.400,00', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: financeiro!.estado })
  try {
    const p = await ctx.newPage()
    await p.goto(`/${slug}/financeiro`)
    await expect(p.locator('[data-total-da-lista]')).toHaveText('2 lançamentos · resultado −R$ 2.400,00')
  } finally { await ctx.close() }
})
