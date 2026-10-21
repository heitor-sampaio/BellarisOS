import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * A aba Financeiro da ficha do cliente só com o financeiro (ou quem recebe).
 *
 * A simulação de um dia de clínica (2026-10-20) viu o SDR (Clientes + CRM)
 * abrir a aba Financeiro da Mariana e ver cada pagamento: a página carregava
 * os lançamentos para quem tinha `clients: VIEW`, e a aba não tinha condição.
 * O teste procura o lançamento no payload da página — é ali que o dado
 * viajaria —, e o caixa é o controle.
 */

const marca = Date.now().toString(36)
const db = () => banco()
const LANCAMENTO = `PAGAMENTO-SECRETO-${marca}`
let rede: OutraRede | null = null
let sdr: MembroDeTeste | null = null
let caixa: MembroDeTeste | null = null
let cliente = ''

test.beforeAll(async () => {
  rede = await criarOutraRede(`ff${marca}`)
  cliente = await rede.criarCliente('Cliente financeiro')
  const { error } = await db().from('financial_transactions').insert({
    branch_id: rede.branchId, client_id: cliente, type: 'INCOME', category: 'Serviços',
    description: LANCAMENTO, amount: 321, is_paid: true, paid_at: new Date().toISOString(), payment_method: 'PIX', created_by: 'e2e',
  })
  expect(error).toBeNull()
  sdr = await criarMembro(`ffs${marca}`, {
    tenant: rede.tenantId, rotulo: 'SDR', permissoes: [{ modulo: 'clients', nivel: 'VIEW' }, { modulo: 'crm', nivel: 'MANAGE' }],
  })
  caixa = await criarMembro(`ffc${marca}`, {
    tenant: rede.tenantId, rotulo: 'Caixa', permissoes: [{ modulo: 'clients', nivel: 'VIEW' }, { modulo: 'cashier', nivel: 'MANAGE' }],
  })
})

test.afterAll(async () => {
  await db().from('financial_transactions').delete().eq('description', LANCAMENTO)
  await sdr?.limpar()
  await caixa?.limpar()
  await rede?.limpar()
  expect(PREFIXO).toBeTruthy()
})

async function pagina(browser: Browser, m: MembroDeTeste, fn: (p: Page, html: string) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try {
    const p = await ctx.newPage()
    await p.goto(`/admin/clients/${cliente}?aba=financeiro`)
    await p.waitForLoadState('networkidle')
    await fn(p, await p.content())
  } finally { await ctx.close() }
}

test('o SDR não vê a aba nem os lançamentos; o caixa vê', async ({ browser }) => {
  await pagina(browser, sdr!, async (p, html) => {
    await expect(p.getByText('Cliente financeiro').first()).toBeVisible()
    await expect(p.getByRole('button', { name: 'Financeiro', exact: true })).toHaveCount(0)
    expect(html, 'o lançamento nem chega ao navegador').not.toContain(LANCAMENTO)
  })
  await pagina(browser, caixa!, async (_p, html) => {
    expect(html, 'controle: quem recebe vê').toContain(LANCAMENTO)
  })
})
