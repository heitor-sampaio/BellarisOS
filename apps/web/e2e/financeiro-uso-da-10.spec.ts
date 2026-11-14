import { test, expect, type Browser, type Page, type Download } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * Os atritos do caixa e do financeiro da 10ª simulação (2026-11-10), da F51:
 * - A22: o "Remarcar vencimento" era só um ícone, e na ficha a parcela não tinha ação.
 * - A23: o pagamento de R$ 0 do voucher dizia "Receita · Pago · + R$ 0,00" com "Estornar".
 * - A24: os cartões não fechavam entre si — "Despesas" era o caixa, sem dizer.
 * - A25: com o resultado negativo, o "-" ficava numa linha e o valor na de baixo.
 * - A30: o caixa e o "Total vendido" sem ponte na tela.
 * - A31: o CSV de lançamentos sem taxa, líquido, vencimento, fornecedor e nota;
 *   o DRE e o Fechamento não se exportavam; a compra e a perda não chegavam à contadora.
 * Numa rede [e2e] própria, de uma unidade.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let slug = ''
let dona: MembroDeTeste | null = null
let ana = ''
const ids: Record<string, string> = {}
const meioDia = (dias: number) => new Date(Date.now() + dias * 86_400_000).toISOString()

async function como(browser: Browser, m: { estado: string }, fn: (p: Page) => Promise<void>, viewport?: { width: number; height: number }) {
  const ctx = await browser.newContext({ storageState: m.estado, acceptDownloads: true, ...(viewport ? { viewport } : {}) })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}
async function baixado(p: Page, clicar: () => Promise<void>): Promise<string> {
  const [d] = await Promise.all([p.waitForEvent('download') as Promise<Download>, clicar()])
  return readFileSync((await d.path())!, 'utf8')
}

test.beforeAll(async () => {
  test.setTimeout(150_000)
  rede = await criarOutraRede(`fu10${marca}`)
  const b = db()
  expect((await b.from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  slug = (await b.from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  dona = await criarMembro(`fu10d${marca}`, { tenant: rede.tenantId, donoDaRede: true, rotulo: 'Dona', permissoes: [] })
  ana = await rede.criarCliente('Ana Clara')
  // A taxa do Pix: 2% (a linha do CSV diz a taxa e o líquido).
  expect((await b.from('payment_fees').insert({ tenant_id: rede.tenantId, metodo: 'PIX', parcelas: 1, taxa_pct: 2 })).error).toBeNull()
  const agora = new Date().toISOString()
  const base = { branch_id: rede.branchId, created_by: 'e2e', loyalty_discount: 0, client_id: null as string | null, due_date: null as string | null, paid_at: null as string | null, payment_method: null as string | null, parcela_numero: null as number | null, parcela_total: null as number | null }
  const { data, error } = await b.from('financial_transactions').insert([
    { ...base, client_id: ana, type: 'INCOME', category: 'Atendimento', description: 'Limpeza de pele', amount: 1000, is_paid: true, paid_at: agora, payment_method: 'PIX' },
    { ...base, type: 'EXPENSE', category: 'Folha', description: 'Folha de novembro', amount: 14000, is_paid: true, paid_at: agora, payment_method: 'PIX' },
    { ...base, client_id: ana, type: 'INCOME', category: 'Plano de tratamento', description: 'Plano de tratamento — parcela 2/3', amount: 200, is_paid: false, due_date: meioDia(10), parcela_numero: 2, parcela_total: 3 },
    { ...base, client_id: ana, type: 'INCOME', category: 'Atendimento', description: 'Drenagem', amount: 0, loyalty_discount: 180, is_paid: true, paid_at: agora },
  ]).select('id, description')
  expect(error).toBeNull()
  for (const t of data as { id: string; description: string }[]) ids[t.description] = t.id
})

test.afterAll(async () => {
  await dona?.limpar(); await rede?.limpar()
})

test('A22: "Remarcar vencimento" com a palavra na lista, e a parcela da ficha também o tem', async ({ browser }) => {
  await como(browser, dona!, async p => {
    await p.goto(`/${slug}/financeiro?aba=movimentacoes`)
    const linha = p.getByRole('row').filter({ hasText: 'parcela 2/3' }).first()
    await expect(linha.getByRole('button', { name: 'Remarcar vencimento' })).toHaveText(/Remarcar vencimento/)
    await p.goto(`/${slug}/clients/${ana}?aba=financeiro`)
    const naFicha = p.locator(`[data-lancamento="${ids['Plano de tratamento — parcela 2/3']}"]`)
    await expect(naFicha.getByRole('button', { name: 'Remarcar vencimento' })).toBeVisible()
  })
})

test('A23: o pagamento de R$ 0 diz que foi pago com pontos, e o estorno diz o que faz', async ({ browser }) => {
  await como(browser, dona!, async p => {
    await p.goto(`/${slug}/financeiro?aba=movimentacoes`)
    const linha = p.getByRole('row').filter({ hasText: 'Drenagem' }).first()
    await expect(linha.locator('[data-pago-sem-dinheiro]')).toContainText('Pago com pontos')
    await expect(linha.locator('[data-pago-sem-dinheiro]')).toContainText('R$ 180,00')
    await expect(linha.getByRole('button', { name: 'Estornar' })).toHaveCount(0)
    await linha.getByRole('button', { name: 'Desfazer o pagamento' }).click()
    await expect(p.locator('dialog[open]')).toContainText('Nenhum dinheiro volta')
  })
})

test('A24: os cartões dizem a base — "Despesas pagas (caixa)" e o que fica fora do lucro', async ({ browser }) => {
  await como(browser, dona!, async p => {
    await p.goto(`/${slug}/financeiro`)
    const despesas = p.locator('[data-kpi="despesas"]')
    await expect(despesas).toContainText('Despesas pagas (caixa)')
    await expect(despesas).toContainText('compra de estoque')
    await p.goto('/admin/financeiro')
    await expect(p.locator('[data-kpi="despesas"]')).toContainText('Despesas pagas (caixa)')
    await p.goto('/admin/reports?tab=overview')
    await expect(p.getByText('Despesas pagas (caixa)').first()).toBeVisible()
  })
})

test('A25: o resultado negativo não parte o sinal do valor', async ({ browser }) => {
  // O "-" de "-R$ 13.020,00" é um ponto de quebra para o navegador: o valor que
  // não pode quebrar diz isso (white-space: nowrap) — no Lucro do Financeiro da
  // unidade, no Resultado da rede e no DRE dos Relatórios.
  const umaLinha = async (l: import('@playwright/test').Locator) => {
    await expect(l).toContainText('R$')
    expect(await l.evaluate(e => getComputedStyle(e).whiteSpace)).toBe('nowrap')
  }
  await como(browser, dona!, async p => {
    await p.goto(`/${slug}/financeiro`)
    await expect(p.locator('[data-kpi="lucro"] [data-valor-do-kpi]')).toContainText('-R$')
    await umaLinha(p.locator('[data-kpi="lucro"] [data-valor-do-kpi]'))
    await p.goto('/admin/financeiro')
    await umaLinha(p.locator('[data-kpi="resultado"] [data-valor-do-kpi]'))
    await p.goto('/admin/reports?tab=financeiro')
    await umaLinha(p.locator('[data-valor-do-dre]').last())
  }, { width: 412, height: 915 })
})

test('A31: o CSV de lançamentos tem a taxa, o líquido, o vencimento, o pagamento, o fornecedor e a nota', async ({ browser }) => {
  await como(browser, dona!, async p => {
    // A despesa com o fornecedor e a nota, pela tela.
    await p.goto(`/${slug}/financeiro`)
    await p.getByRole('button', { name: 'Novo lançamento' }).click()
    const modal = p.locator('dialog[open]')
    await modal.getByRole('button', { name: 'Despesa', exact: true }).click()
    await modal.getByLabel('Fornecedor').fill('Distribuidora Sul')
    await modal.getByLabel('Nota fiscal').fill('004630')
    await expect(modal.getByLabel('Fornecedor')).toHaveValue('Distribuidora Sul')
  })
  expect((await db().from('financial_transactions').update({ fornecedor: 'Imobiliária Centro', nota_fiscal: 'NF-77' }).eq('id', ids['Folha de novembro'])).error).toBeNull()
  await como(browser, dona!, async p => {
    await p.goto(`/${slug}/financeiro?aba=movimentacoes`)
    const csv = await baixado(p, () => p.getByRole('button', { name: 'Exportar CSV' }).first().click())
    const [cabecalho, ...linhas] = csv.replace(/^﻿/, '').split('\r\n')
    expect(cabecalho).toContain('Taxa da maquininha;Líquido')
    expect(cabecalho).toContain('Vencimento;Pago em')
    // A44 da 12ª: o fornecedor e a nota dizem que são opcionais.
    expect(cabecalho).toContain('Fornecedor (se informado);Nota fiscal (se informada)')
    const limpeza = linhas.find(l => l.includes('Limpeza de pele'))!
    // Valor; Conta no caixa; Desconto (vazio); Taxa; Líquido (A45 e A44 da 12ª).
    expect(limpeza).toContain('1000,00;Sim;;20,00;980,00')
    expect(linhas.find(l => l.includes('Folha de novembro'))).toContain('Imobiliária Centro;NF-77')
  })
})

test('A31: o DRE e o Fechamento do dia se exportam, com a compra e a perda do estoque', async ({ browser }) => {
  await como(browser, dona!, async p => {
    await p.goto('/admin/reports?tab=financeiro')
    const dre = await baixado(p, () => p.getByRole('button', { name: 'Exportar o DRE (CSV)' }).click())
    expect(dre).toContain('Receita paga;1000,00')
    expect(dre).toContain('Compras no estoque (entradas, ao custo)')
    expect(dre).toContain('Perdas no período')
    // O CSV do Fechamento do dia mora no Financeiro desde o CX6 (2026-11-14); o dia vem como hoje.
    await p.goto(`/${slug}/financeiro?aba=movimentacoes`)
    await p.getByRole('button', { name: 'CSV do fechamento do dia' }).click()
    const janela = p.getByRole('dialog', { name: 'CSV do fechamento do dia' })
    const fechamento = await baixado(p, () => janela.getByRole('button', { name: 'Baixar' }).click())
    expect(fechamento).toContain('Forma;Entradas;Saídas;Saldo;Lançamentos')
    expect(fechamento).toMatch(/Pix;1000,00;14000,00;-13000,00/)
  })
})

test('A30: as Vendas dizem a ponte com o caixa', async ({ browser }) => {
  await como(browser, dona!, async p => {
    await p.goto('/admin/reports?tab=vendas')
    const ponte = p.locator('[data-ponte-vendas-caixa]')
    await expect(ponte).toContainText('caixa')
    await expect(ponte).toContainText('R$ 1.000,00')
    await expect(ponte).toContainText('crédito na clínica')
  })
})
