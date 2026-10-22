import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * O Financeiro da rede com "A receber" (e "A pagar") e a coluna de cliente
 * (2026-10-21, decisão do Heitor — a simulação viu: "O Financeiro da rede não
 * tem 'A receber' nem a coluna de cliente"). A lista da unidade também ganha
 * o cliente: nenhuma das duas dizia de quem era o lançamento.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let daRede: MembroDeTeste | null = null
let daUnidade: MembroDeTeste | null = null
let slug = ''
let nomeDaCliente = ''

async function como(m: MembroDeTeste, browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`fr${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  daRede = await criarMembro(`frr${marca}`, { tenant: rede.tenantId, rotulo: 'Financeiro rede', permissoes: [{ modulo: 'financial', nivel: 'VIEW' }] })
  daUnidade = await criarMembro(`fru${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Financeiro unidade', permissoes: [{ modulo: 'financial', nivel: 'VIEW' }],
  })
  const cliente = await rede.criarCliente('Pagadora')
  nomeDaCliente = (await db().from('clients').select('name').eq('id', cliente).single<{ name: string }>()).data!.name
  const agora = new Date().toISOString()
  const { error } = await db().from('financial_transactions').insert([
    { branch_id: rede.branchId, client_id: cliente, type: 'INCOME', category: 'Atendimento', description: `Parcela ${marca}`,
      amount: 150, is_paid: false, due_date: agora, created_by: 'e2e' },
    { branch_id: rede.branchId, type: 'EXPENSE', category: 'Aluguel', description: `Aluguel ${marca}`,
      amount: 90, is_paid: false, due_date: agora, created_by: 'e2e' },
  ])
  expect(error).toBeNull()
})
test.afterAll(async () => {
  if (rede) await db().from('financial_transactions').delete().eq('branch_id', rede.branchId)
  await daRede?.limpar(); await daUnidade?.limpar(); await rede?.limpar()
})

test('na rede: "A receber", "A pagar" e de quem é o lançamento', async ({ browser }) => {
  await como(daRede!, browser, async p => {
    await p.goto('/admin/financeiro')
    await expect(p.locator('[data-kpi="a-receber"]')).toContainText('150,00')
    await expect(p.locator('[data-kpi="a-pagar"]')).toContainText('90,00')
    const linha = p.locator('tr').filter({ hasText: `Parcela ${marca}` })
    await expect(linha.locator('[data-label="Cliente"]')).toHaveText(nomeDaCliente)
  })
})

test('na unidade: a lista também diz de quem é', async ({ browser }) => {
  await como(daUnidade!, browser, async p => {
    await p.goto(`/${slug}/financeiro`)
    const linha = p.locator('tr').filter({ hasText: `Parcela ${marca}` })
    await expect(linha.locator('[data-label="Cliente"]')).toHaveText(nomeDaCliente)
  })
})
