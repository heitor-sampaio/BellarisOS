import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * O bloco Financeiro do plano de adaptação (a revisão do Heitor, 2026-11-13:
 * "nada de recurso novo: o que já existe, organizado pelas cinco perguntas de
 * quem cuida do dinheiro").
 * - FI1: as abas Resumo · A receber · A pagar · Movimentações · Comissões, nos
 *   dois portais; abre no Resumo; os links antigos (`?aberto=…`) levam à aba.
 * - FI2: o Resumo tem os números do período e o que vem pela frente, sem a
 *   lista dos lançamentos.
 * - FI3: o A receber lista o que falta receber das clientes, as atrasadas
 *   primeiro, com "Pagar" (a baixa) e "Remarcar vencimento".
 * - FI4: o A pagar lista as despesas em aberto.
 * - FI5: as Movimentações têm o extrato do período e os dois CSVs.
 * - FI6: Comissões é a quinta aba.
 * - FI7: no topo do Financeiro fica só o "Novo lançamento"; o "Conceder
 *   crédito" é da ficha da cliente, a quem tem o Financeiro em Gerenciar.
 * Quem vê o quê continua pelas permissões: quem só vê não lança nem dá baixa;
 * o Financeiro "só os meus" vai às comissões dele, em qualquer aba.
 * Numa rede [e2e] própria, de uma unidade.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let slug = ''
let clienteId = ''
let gestor: MembroDeTeste | null = null
let soVe: MembroDeTeste | null = null
let soOsMeus: MembroDeTeste | null = null
const ids: Record<'recebido' | 'atrasada' | 'futura' | 'conta' | 'paga', string> = { recebido: '', atrasada: '', futura: '', conta: '', paga: '' }
const DIA = 86_400_000
const meioDia = (deslocamentoEmDias: number) => {
  const dia = new Date(Date.now() + deslocamentoEmDias * DIA).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  return new Date(`${dia}T12:00:00-03:00`).toISOString()
}

async function como(browser: Browser, m: { estado: string }, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

const ABAS = ['Resumo', 'A receber', 'A pagar', 'Movimentações', 'Comissões']
const abas = (p: Page) => p.getByRole('tablist', { name: 'Abas do Financeiro' })
const aba = (p: Page, nome: string) => abas(p).getByRole('tab', { name: nome, exact: true })

test.beforeAll(async () => {
  test.setTimeout(150_000)
  rede = await criarOutraRede(`fab${marca}`)
  const b = db()
  expect((await b.from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  slug = (await b.from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  clienteId = await rede.criarCliente(`fab${marca}`)
  gestor = await criarMembro(`fabg${marca}`, {
    tenant: rede.tenantId, rotulo: 'Financeiro em Gerenciar',
    permissoes: [{ modulo: 'financial', nivel: 'MANAGE' }, { modulo: 'cashier', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'VIEW' }],
  })
  soVe = await criarMembro(`fabv${marca}`, {
    tenant: rede.tenantId, rotulo: 'Financeiro em Ver',
    permissoes: [{ modulo: 'financial', nivel: 'VIEW' }, { modulo: 'clients', nivel: 'VIEW' }],
  })
  soOsMeus = await criarMembro(`fabo${marca}`, {
    tenant: rede.tenantId, rotulo: 'Financeiro so os meus',
    permissoes: [{ modulo: 'financial', nivel: 'VIEW', escopo: 'OWN' }],
  })
  const agora = new Date().toISOString()
  const linha = (o: Record<string, unknown>) => ({ branch_id: rede!.branchId, created_by: 'e2e', ...o })
  const { data, error } = await b.from('financial_transactions').insert([
    linha({ client_id: clienteId, type: 'INCOME', category: 'Serviços', description: `[e2e] Recebido ${marca}`, amount: 200, is_paid: true, paid_at: agora, payment_method: 'PIX' }),
    linha({ client_id: clienteId, type: 'INCOME', category: 'Serviços', description: `[e2e] Atrasada ${marca}`, amount: 100, is_paid: false, due_date: meioDia(-3) }),
    linha({ client_id: clienteId, type: 'INCOME', category: 'Serviços', description: `[e2e] Futura ${marca}`, amount: 50, is_paid: false, due_date: meioDia(20) }),
    linha({ type: 'EXPENSE', category: 'Aluguel', description: `[e2e] Conta ${marca}`, amount: 80, is_paid: false, due_date: meioDia(5) }),
    linha({ type: 'EXPENSE', category: 'Aluguel', description: `[e2e] Paga ${marca}`, amount: 30, is_paid: true, paid_at: agora, payment_method: 'PIX' }),
  ]).select('id, description')
  expect(error).toBeNull()
  for (const t of data ?? []) {
    const d = t.description as string
    if (d.includes('Recebido')) ids.recebido = t.id as string
    if (d.includes('Atrasada')) ids.atrasada = t.id as string
    if (d.includes('Futura')) ids.futura = t.id as string
    if (d.includes('Conta')) ids.conta = t.id as string
    if (d.includes('Paga ')) ids.paga = t.id as string
  }
})

test.afterAll(async () => {
  await db().from('financial_transactions').delete().eq('branch_id', rede!.branchId)
  await gestor?.limpar(); await soVe?.limpar(); await soOsMeus?.limpar()
  await rede?.limpar()
})

const linha = (p: Page, id: string) => p.locator(`[data-lancamento="${id}"]`)

for (const portal of ['unidade', 'rede'] as const) {
  test(`FI1–FI6 no portal da ${portal}: cinco abas, abre no Resumo, e cada aba com o que é dela`, async ({ browser }) => {
    test.setTimeout(120_000)
    const base = portal === 'rede' ? '/admin/financeiro' : `/${slug}/financeiro`
    await como(browser, gestor!, async p => {
      await p.goto(base)
      await expect(abas(p).getByRole('tab')).toHaveText(ABAS)
      await expect(aba(p, 'Resumo')).toHaveAttribute('aria-selected', 'true')
      // FI2: os números do período e o que vem pela frente — sem a lista.
      await expect(p.locator('[data-kpi="despesas"]')).toBeVisible()
      await expect(p.locator('[data-kpi="a-receber"]')).toBeVisible()
      await expect(p.locator('[data-kpi="a-pagar"]')).toBeVisible()
      await expect(p.locator('[data-lancamento]')).toHaveCount(0)
      // FI7: no topo, só o "Novo lançamento".
      await expect(p.getByRole('button', { name: 'Novo lançamento' })).toBeVisible()
      await expect(p.getByRole('button', { name: /Crédito para cliente|Conceder crédito/ })).toHaveCount(0)

      // FI3: o que falta receber das clientes, as atrasadas primeiro, com a baixa e o remarcar.
      await aba(p, 'A receber').click()
      await expect(p).toHaveURL(/aba=a-receber/)
      await expect(aba(p, 'A receber')).toHaveAttribute('aria-selected', 'true')
      await expect(linha(p, ids.atrasada)).toBeVisible()
      await expect(linha(p, ids.futura)).toBeVisible()
      await expect(p.locator('[data-lancamento]').first()).toHaveAttribute('data-lancamento', ids.atrasada)
      await expect(linha(p, ids.recebido)).toHaveCount(0)
      await expect(linha(p, ids.conta)).toHaveCount(0)
      await expect(linha(p, ids.atrasada).getByRole('button', { name: 'Pagar' })).toBeVisible()
      await expect(linha(p, ids.atrasada).getByRole('button', { name: 'Remarcar vencimento' })).toBeVisible()

      // FI4: as despesas em aberto.
      await aba(p, 'A pagar').click()
      await expect(p).toHaveURL(/aba=a-pagar/)
      await expect(linha(p, ids.conta)).toBeVisible()
      await expect(linha(p, ids.atrasada)).toHaveCount(0)
      await expect(linha(p, ids.paga)).toHaveCount(0)

      // FI5: o extrato do período e os dois CSVs.
      await aba(p, 'Movimentações').click()
      await expect(p).toHaveURL(/aba=movimentacoes/)
      await expect(linha(p, ids.recebido)).toBeVisible()
      await expect(linha(p, ids.paga)).toBeVisible()
      await expect(p.getByRole('button', { name: 'Exportar CSV' })).toBeVisible()
      await expect(p.getByRole('button', { name: /CSV do fechamento do dia/ })).toBeVisible()

      // FI6: Comissões, como hoje, como aba.
      await aba(p, 'Comissões').click()
      await expect(p).toHaveURL(new RegExp(`${base}/comissoes`))
      await expect(aba(p, 'Comissões')).toHaveAttribute('aria-selected', 'true')
      await aba(p, 'Resumo').click()
      await expect(p).toHaveURL(new RegExp(`${base}(\\?|$)`))
      await expect(aba(p, 'Resumo')).toHaveAttribute('aria-selected', 'true')
    })
  })
}

test('FI1: os links antigos levam à aba nova', async ({ browser }) => {
  await como(browser, gestor!, async p => {
    await p.goto(`/${slug}/financeiro?aba=a-receber#lancamentos`)
    await expect(p).toHaveURL(/aba=a-receber/)
    await expect(aba(p, 'A receber')).toHaveAttribute('aria-selected', 'true')
    await p.goto(`/${slug}/financeiro?aberto=a-pagar`)
    await expect(p).toHaveURL(/aba=a-pagar/)
    await expect(linha(p, ids.conta)).toBeVisible()
    await p.goto('/admin/financeiro?aberto=vencidas')
    await expect(p).toHaveURL(/aba=a-receber/)
    await expect(p).toHaveURL(/aberto=vencidas/)
    await expect(linha(p, ids.atrasada)).toBeVisible()
    await expect(linha(p, ids.futura)).toHaveCount(0)
    await p.goto(`/${slug}/financial?aberto=todos`)
    await expect(p).toHaveURL(new RegExp(`/${slug}/financeiro\\?aba=a-receber`))
  })
})

test('quem só vê: as abas e as listas, sem lançar, dar baixa nem remarcar', async ({ browser }) => {
  await como(browser, soVe!, async p => {
    await p.goto(`/${slug}/financeiro?aba=a-receber`)
    await expect(abas(p).getByRole('tab')).toHaveText(ABAS)
    await expect(linha(p, ids.atrasada)).toBeVisible()
    await expect(linha(p, ids.atrasada).getByRole('button', { name: 'Pagar' })).toHaveCount(0)
    await expect(linha(p, ids.atrasada).getByRole('button', { name: 'Remarcar vencimento' })).toHaveCount(0)
    await expect(p.getByRole('button', { name: 'Novo lançamento' })).toHaveCount(0)
    await p.goto('/admin/financeiro?aba=a-pagar')
    await expect(linha(p, ids.conta)).toBeVisible()
    await expect(p.getByRole('button', { name: 'Novo lançamento' })).toHaveCount(0)
  })
})

test('o Financeiro "só os meus": qualquer aba leva às comissões dele, sem a lista da unidade', async ({ browser }) => {
  await como(browser, soOsMeus!, async p => {
    for (const url of [`/${slug}/financeiro?aba=a-receber`, '/admin/financeiro?aba=movimentacoes']) {
      await p.goto(url)
      await expect(p).toHaveURL(/\/financeiro\/comissoes/)
      await expect(p.locator('[data-lancamento]')).toHaveCount(0)
      await expect(p.getByRole('tab', { name: 'A receber' })).toHaveCount(0)
    }
  })
})

test('FI7: o "Conceder crédito" é da ficha da cliente, a quem tem o Financeiro em Gerenciar', async ({ browser }) => {
  await como(browser, gestor!, async p => {
    await p.goto(`/${slug}/clients/${clienteId}?aba=financeiro`)
    await expect(p.getByRole('button', { name: 'Conceder crédito' })).toBeVisible()
  })
  await como(browser, soVe!, async p => {
    await p.goto(`/${slug}/clients/${clienteId}?aba=financeiro`)
    await expect(p.getByRole('heading', { name: 'Crédito interno' })).toBeVisible()
    await expect(p.getByRole('button', { name: 'Conceder crédito' })).toHaveCount(0)
  })
})
