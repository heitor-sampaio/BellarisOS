import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * As Tags nas listas do Financeiro (CLAUDE.md §1, Tags — o Heitor, 13/11:
 * "onde tiver for passível de filtro, um dos filtros que ela pode usar são as
 * tags … além dos filtros que a gente já apresenta ali fixos em cada página";
 * vendas-financeiro.md §9.6, "As Tags nas listas").
 * - A receber, A pagar e Movimentações, nos dois portais, têm "Tags": o
 *   lançamento entra se a CLIENTE dele tem TODAS as marcadas (E); o sem
 *   cliente (a despesa) sai quando há tag marcada.
 * - O filtro mora na URL (`?tags=`) e as abas o levam junto.
 * - As opções vêm do vocabulário da rede lido no servidor: quem tem só o
 *   Financeiro (sem Clientes, CRM…) também as vê.
 * Numa rede [e2e] própria, de uma unidade.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let slug = ''
let financeiro: MembroDeTeste | null = null
const ids: Record<'daVipIndicacao' | 'daVip' | 'semTag' | 'despesa' | 'pagoDaVip' | 'despesaPaga', string> =
  { daVipIndicacao: '', daVip: '', semTag: '', despesa: '', pagoDaVip: '', despesaPaga: '' }

async function como(browser: Browser, m: { estado: string }, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

const linha = (p: Page, id: string) => p.locator(`[data-lancamento="${id}"]`)
const aba = (p: Page, nome: string) => p.getByRole('tablist', { name: 'Abas do Financeiro' }).getByRole('tab', { name: nome, exact: true })
async function marcarTag(p: Page, tag: string) {
  await p.locator('[data-filtro-de-tags]').getByRole('button', { name: /^Tags/ }).click()
  await p.locator('[data-painel-picker]').getByRole('button', { name: tag, exact: true }).click()
  await p.keyboard.press('Escape')
}

test.beforeAll(async () => {
  test.setTimeout(150_000)
  rede = await criarOutraRede(`ftag${marca}`)
  const b = db()
  expect((await b.from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  slug = (await b.from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  // A rede nasce sem tags (20261121500001): a Admin cria as dela.
  expect((await b.from('tags').insert([{ tenant_id: rede.tenantId, nome: 'VIP' }, { tenant_id: rede.tenantId, nome: 'Indicação' }])).error).toBeNull()
  const clienteVipIndicacao = await rede.criarCliente(`ftagA${marca}`)
  const clienteVip = await rede.criarCliente(`ftagB${marca}`)
  const clienteSemTag = await rede.criarCliente(`ftagC${marca}`)
  expect((await b.from('clients').update({ tags: ['VIP', 'Indicação'] }).eq('id', clienteVipIndicacao)).error).toBeNull()
  expect((await b.from('clients').update({ tags: ['VIP'] }).eq('id', clienteVip)).error).toBeNull()
  // Só o Financeiro: o vocabulário vem do servidor, não do `listarTagsAtivas` (que pede Clientes/CRM).
  financeiro = await criarMembro(`ftagf${marca}`, {
    tenant: rede.tenantId, rotulo: 'Financeiro em Gerenciar',
    permissoes: [{ modulo: 'financial', nivel: 'MANAGE' }],
  })
  const agora = new Date().toISOString()
  const vence = new Date(Date.now() + 5 * 86_400_000).toISOString()
  const l = (o: Record<string, unknown>) => ({ branch_id: rede!.branchId, created_by: 'e2e', category: 'Serviços', ...o })
  const { data, error } = await b.from('financial_transactions').insert([
    l({ client_id: clienteVipIndicacao, type: 'INCOME', description: `[e2e] A receber VIP+Indicação ${marca}`, amount: 100, is_paid: false, due_date: vence }),
    l({ client_id: clienteVip, type: 'INCOME', description: `[e2e] A receber VIP ${marca}`, amount: 90, is_paid: false, due_date: vence }),
    l({ client_id: clienteSemTag, type: 'INCOME', description: `[e2e] A receber sem tag ${marca}`, amount: 80, is_paid: false, due_date: vence }),
    l({ type: 'EXPENSE', category: 'Aluguel', description: `[e2e] Despesa ${marca}`, amount: 70, is_paid: false, due_date: vence }),
    l({ client_id: clienteVip, type: 'INCOME', description: `[e2e] Pago VIP ${marca}`, amount: 60, is_paid: true, paid_at: agora, payment_method: 'PIX' }),
    l({ type: 'EXPENSE', category: 'Aluguel', description: `[e2e] Despesa paga ${marca}`, amount: 50, is_paid: true, paid_at: agora, payment_method: 'PIX' }),
  ]).select('id, description')
  expect(error).toBeNull()
  for (const t of data ?? []) {
    const d = t.description as string
    if (d.includes('VIP+Indicação')) ids.daVipIndicacao = t.id as string
    else if (d.includes('A receber VIP')) ids.daVip = t.id as string
    else if (d.includes('sem tag')) ids.semTag = t.id as string
    else if (d.includes('Despesa paga')) ids.despesaPaga = t.id as string
    else if (d.includes('Despesa')) ids.despesa = t.id as string
    else if (d.includes('Pago VIP')) ids.pagoDaVip = t.id as string
  }
})

test.afterAll(async () => {
  await db().from('financial_transactions').delete().eq('branch_id', rede!.branchId)
  await financeiro?.limpar()
  await rede?.limpar()
})

for (const portal of ['unidade', 'rede'] as const) {
  test(`no portal da ${portal}: Tags filtra as listas por TODAS as tags da cliente, na URL, e as abas levam junto`, async ({ browser }) => {
    test.setTimeout(120_000)
    const base = portal === 'rede' ? '/admin/financeiro' : `/${slug}/financeiro`
    await como(browser, financeiro!, async p => {
      // O Resumo não tem o filtro (os números não mudam com a tag).
      await p.goto(base)
      await expect(p.locator('[data-filtro-de-tags]')).toHaveCount(0)

      await p.goto(`${base}?aba=a-receber`)
      await expect(linha(p, ids.semTag)).toBeVisible()
      // Quem só tem o Financeiro vê o vocabulário da rede.
      await marcarTag(p, 'VIP')
      await expect(p).toHaveURL(/tags=VIP/)
      await expect(linha(p, ids.daVip)).toBeVisible()
      await expect(linha(p, ids.daVipIndicacao)).toBeVisible()
      await expect(linha(p, ids.semTag)).toHaveCount(0)
      // E: com as duas, só a cliente que tem as duas.
      await marcarTag(p, 'Indicação')
      await expect(p.locator('[data-filtro-de-tags]').getByRole('button', { name: 'Tags · 2' })).toBeVisible()
      await expect(linha(p, ids.daVipIndicacao)).toBeVisible()
      await expect(linha(p, ids.daVip)).toHaveCount(0)
      // Desmarca a Indicação: volta a VIP sozinha.
      await marcarTag(p, 'Indicação')
      await expect(linha(p, ids.daVip)).toBeVisible()

      // A aba leva o ?tags= junto; a despesa (sem cliente) sai.
      await aba(p, 'Movimentações').click()
      await expect(p).toHaveURL(/aba=movimentacoes/)
      await expect(p).toHaveURL(/tags=VIP/)
      await expect(linha(p, ids.pagoDaVip)).toBeVisible()
      await expect(linha(p, ids.despesaPaga)).toHaveCount(0)

      await aba(p, 'A pagar').click()
      await expect(p).toHaveURL(/tags=VIP/)
      await expect(linha(p, ids.despesa)).toHaveCount(0)
      // Sem a tag, a despesa volta.
      await marcarTag(p, 'VIP')
      await expect(p).not.toHaveURL(/tags=/)
      await expect(linha(p, ids.despesa)).toBeVisible()
    })
  })
}
