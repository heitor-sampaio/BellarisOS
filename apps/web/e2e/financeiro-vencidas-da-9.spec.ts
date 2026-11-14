import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, clienteComSessao, type MembroDeTeste, type ClienteDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { haMinutosHoje } from './apoio/datas'

/**
 * A parcela VENCIDA da 9ª simulação (2026-11-07):
 * - D13 (decidido pelo princípio 3): a 1ª parcela da Mariana venceu em 05/11
 *   e era só "Pendente" no Financeiro, na ficha, no dashboard e no app — igual
 *   à que vai vencer. Agora "Vencida em 05/11", com o filtro "vencidas", o
 *   total no cartão, o aviso no dashboard, e o check-in dela avisa (sem
 *   recusar).
 * - A37: não havia como remarcar o vencimento de uma parcela do crediário
 *   (a linha só tinha "Pagar"). Quem tem o Financeiro em Gerenciar remarca,
 *   e o histórico fica na linha.
 * Numa rede [e2e] própria, de uma unidade.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let slug = ''
let dona: MembroDeTeste | null = null
let recepcao: MembroDeTeste | null = null
let mariana: ClienteDeTeste | null = null
let vencida = ''
let aVencer = ''
let agendamento = ''
const DIA = 86_400_000
const ddmm = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' })
const meioDia = (deslocamentoEmDias: number) => {
  const dia = new Date(Date.now() + deslocamentoEmDias * DIA).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  return new Date(`${dia}T12:00:00-03:00`).toISOString()
}
const venceuEm = meioDia(-2)

async function como(browser: Browser, m: { estado: string }, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  test.setTimeout(150_000)
  rede = await criarOutraRede(`ven${marca}`)
  const b = db()
  expect((await b.from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  slug = (await b.from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  dona = await criarMembro(`vend${marca}`, { tenant: rede.tenantId, donoDaRede: true, rotulo: 'Dona', permissoes: [] })
  recepcao = await criarMembro(`venr${marca}`, {
    tenant: rede.tenantId, rotulo: 'Recepcao',
    permissoes: [{ modulo: 'cashier', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'agenda', nivel: 'MANAGE' }],
  })
  mariana = await clienteComSessao(`ven${marca}`, { id: rede.branchId, slug }, { tenant: rede.tenantId })
  const parcela = (n: number, due: string) => ({
    branch_id: rede!.branchId, client_id: mariana!.clientId, type: 'INCOME', category: 'Plano de tratamento',
    description: `Plano de tratamento — parcela ${n}/4`, amount: 1294, is_paid: false, due_date: due,
    parcela_numero: n, parcela_total: 4, created_by: 'e2e',
  })
  const { data: txs, error } = await b.from('financial_transactions').insert([parcela(1, venceuEm), parcela(2, meioDia(28))]).select('id, parcela_numero')
  expect(error).toBeNull()
  vencida = txs!.find(t => t.parcela_numero === 1)!.id as string
  aVencer = txs!.find(t => t.parcela_numero === 2)!.id as string
  // Um agendamento de hoje dela, para o check-in.
  const { data: ap, error: eAp } = await b.from('appointments').insert({
    branch_id: rede.branchId, client_id: mariana.clientId, procedure_id: rede.procedureId, professional_id: rede.professionalId,
    scheduled_at: haMinutosHoje(5), duration_min: 30, price: 0, status: 'CONFIRMED', source: 'INTERNAL',
  }).select('id').single<{ id: string }>()
  expect(eAp).toBeNull()
  agendamento = ap!.id
})

test.afterAll(async () => {
  await mariana?.limpar(); await dona?.limpar(); await recepcao?.limpar()
  await rede?.limpar()
})

test('D13: o Financeiro da unidade diz "Vencida em", soma as vencidas no cartão e filtra só elas', async ({ browser }) => {
  await como(browser, dona!, async p => {
    await p.goto(`/${slug}/financeiro?aba=a-receber#lancamentos`)
    await expect(p.locator(`[data-lancamento="${vencida}"]`)).toContainText(`Vencida em ${ddmm(venceuEm)}`)
    await expect(p.locator(`[data-lancamento="${aVencer}"]`)).not.toContainText('Vencida')
    const cartao = p.locator('[data-kpi="a-receber"]')
    await expect(cartao.locator('[data-vencidas]')).toContainText(/Vencidas: R\$\s1\.294,00 \(1 parcela, desde/)
    await cartao.getByRole('link', { name: 'Ver as vencidas' }).click()
    await expect(p).toHaveURL(/aberto=vencidas/)
    await expect(p.locator('[data-so-o-em-aberto]')).toContainText('vencidas')
    await expect(p.locator(`[data-lancamento="${vencida}"]`)).toBeVisible()
    await expect(p.locator(`[data-lancamento="${aVencer}"]`)).toHaveCount(0)
  })
})

test('D13: o Financeiro da rede, a ficha e o dashboard dizem a vencida', async ({ browser }) => {
  await como(browser, dona!, async p => {
    await p.goto('/admin/financeiro?aba=a-receber#movimentacoes')
    await expect(p.locator(`[data-lancamento="${vencida}"]`)).toContainText(`Vencida em ${ddmm(venceuEm)}`)
    await p.goto(`/${slug}/clients/${mariana!.clientId}?aba=financeiro`)
    await expect(p.locator('[data-transacao-da-ficha]', { hasText: 'parcela 1/4' })).toContainText(`Vencida em ${ddmm(venceuEm)}`)
    await p.goto(`/${slug}/dashboard`)
    await expect(p.locator('[data-parcelas-vencidas]')).toContainText(/1 parcela vencida da cliente: R\$\s1\.294,00/)
  })
})

test('D13: o app da cliente diz "Vencida em"', async ({ browser }) => {
  await como(browser, mariana!, async p => {
    await p.goto(`/${slug}/cliente/financeiro`)
    await expect(p.getByText(`Vencida em ${ddmm(venceuEm)}`).first()).toBeVisible()
  })
})

test('D13: o check-in de quem tem parcela vencida avisa, e a chegada vale', async ({ browser }) => {
  await como(browser, recepcao!, async p => {
    const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
    await p.goto(`/admin/agenda?date=${hoje}`)
    await p.locator(`[title*="Cliente portal ven${marca}"]`).first().click()
    await p.getByRole('dialog', { name: 'Agendamento' }).getByRole('button', { name: 'Chegou' }).click()
    await expect(p.getByText(/tem 1 parcela vencida \(R\$\s1\.294,00/)).toBeVisible({ timeout: 15_000 })
  })
  await expect.poll(async () => (await db().from('appointments').select('status').eq('id', agendamento).single()).data?.status).toBe('ARRIVED')
})

test('A37: o Financeiro em Gerenciar remarca o vencimento, com o histórico; a recepção não vê', async ({ browser }) => {
  await como(browser, recepcao!, async p => {
    await p.goto(`/admin/clients/${mariana!.clientId}?aba=financeiro`)
    await expect(p.locator('[data-transacao-da-ficha]').first()).toBeVisible()
    await expect(p.getByRole('button', { name: 'Remarcar vencimento' })).toHaveCount(0)
  })
  const novo = meioDia(10)
  await como(browser, dona!, async p => {
    await p.goto(`/${slug}/financeiro?aba=a-receber#lancamentos`)
    const linha = p.locator(`[data-lancamento="${vencida}"]`)
    await linha.getByRole('button', { name: 'Remarcar vencimento' }).click()
    const dlg = p.getByRole('dialog', { name: 'Remarcar vencimento' })
    await dlg.getByLabel('Novo vencimento').fill(new Date(novo).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }))
    await dlg.getByLabel('Motivo (opcional)').fill('Combinado com a cliente')
    await dlg.getByRole('button', { name: 'Remarcar' }).click()
    await expect(dlg).toBeHidden({ timeout: 15_000 })
    await expect(linha).not.toContainText('Vencida')
    await expect(linha.locator('[data-vencimento-remarcado]')).toContainText(`era ${ddmm(venceuEm)}`)
  })
  const { data } = await db().from('financial_transactions').select('due_date, vencimentos_anteriores').eq('id', vencida).single()
  expect(new Date(data!.due_date as string).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }))
    .toBe(new Date(novo).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }))
  expect((data!.vencimentos_anteriores as unknown[]).length).toBe(1)
})
