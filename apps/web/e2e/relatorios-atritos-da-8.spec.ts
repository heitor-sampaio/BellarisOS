import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * Os atritos dos números da 8ª simulação (2026-11-06), da F38:
 * - A47: Procedimentos e Profissionais com receita R$ 0 não diziam "R$ 160
 *   concluídos sem pagamento" (a regra F18 — a receita dos atendimentos é a
 *   PAGA — fica).
 * - A43: a comissão de quem atendeu com o crédito de fora aparecia, e a
 *   receita não, sem nota (o crédito na clínica não é receita, F7).
 * - A49: o "Cancelados/faltas" do dashboard não dizia o recorte ao lado do
 *   número, e os Relatórios davam outro.
 * Numa rede [e2e] própria.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let dona: MembroDeTeste | null = null
let cliente = ''
let nomeDaProf = ''
const PROC = `${PREFIXO} Limpeza rel ${marca}`

async function como(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

async function concluido(preco: number) {
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: cliente, procedure_id: rede!.procedureId, professional_id: rede!.professionalId,
    scheduled_at: new Date(Date.now() - 3_600_000).toISOString(), completed_at: new Date(Date.now() - 1_800_000).toISOString(),
    duration_min: 30, price: preco, status: 'COMPLETED', source: 'INTERNAL',
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  return data!.id
}

test.beforeAll(async () => {
  test.setTimeout(150_000)
  rede = await criarOutraRede(`rl8${marca}`)
  const b = db()
  expect((await b.from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  expect((await b.from('procedures').update({ name: PROC, price: 160 }).eq('id', rede.procedureId)).error).toBeNull()
  expect((await b.from('users').update({ provides_services: true, atende_em: [rede.branchId] }).eq('id', rede.professionalId)).error).toBeNull()
  nomeDaProf = (await b.from('users').select('name').eq('id', rede.professionalId).single<{ name: string }>()).data!.name
  dona = await criarMembro(`rl8d${marca}`, { tenant: rede.tenantId, donoDaRede: true, permissoes: [] })
  cliente = await rede.criarCliente('Daniela')
  // Um concluído sem pagamento (R$ 160) e um pago com o crédito de fora (R$ 450).
  await concluido(160)
  const pago = await concluido(450)
  expect((await b.from('internal_credits').insert({ client_id: cliente, branch_id: rede.branchId, amount: 450, description: 'Crédito de fora' })).error).toBeNull()
  expect((await b.from('financial_transactions').insert({
    branch_id: rede.branchId, client_id: cliente, appointment_id: pago, type: 'INCOME', category: 'Procedimento',
    description: 'Atendimento', amount: 450, is_paid: true, paid_at: new Date().toISOString(), payment_method: 'INTERNAL_CREDIT', created_by: 'e2e',
  })).error).toBeNull()
})

test.afterAll(async () => {
  await dona?.limpar()
  await rede?.limpar()
})

test('A47 + A43: a receita de cada procedimento diz o concluído sem pagamento e o pago com crédito', async ({ browser }) => {
  await como(browser, dona!, async p => {
    await p.goto('/admin/reports?period=month&tab=procedimentos')
    const linha = p.locator('tr', { hasText: PROC })
    await expect(linha.locator('[data-sem-receita]')).toContainText(/R\$\s160,00 concluídos sem pagamento/)
    await expect(linha.locator('[data-sem-receita]')).toContainText(/R\$\s450,00 pagos com crédito na clínica/)
  })
})

test('A47 + A43: e a de cada profissional', async ({ browser }) => {
  await como(browser, dona!, async p => {
    await p.goto('/admin/reports?period=month&tab=profissionais')
    const linha = p.locator('tr', { hasText: nomeDaProf })
    await expect(linha.locator('[data-sem-receita]')).toContainText(/R\$\s160,00 concluídos sem pagamento/)
    await expect(linha.locator('[data-sem-receita]')).toContainText(/R\$\s450,00 pagos com crédito na clínica/)
  })
})

test('A11 da 13ª (F67): o Top 5 da Visão geral diz o pago com crédito na clínica, como as tabelas', async ({ browser }) => {
  await como(browser, dona!, async p => {
    await p.goto('/admin/reports?period=month&tab=overview')
    const notas = p.locator('[data-top5-com-credito]')
    await expect(notas.filter({ hasText: PROC })).toContainText(/R\$\s450,00 pagos com crédito na clínica \(não é receita\)/)
    await expect(notas.filter({ hasText: nomeDaProf })).toContainText(/R\$\s450,00 pagos com crédito na clínica/)
  })
})

test('A49: o "Cancelados/faltas" do dashboard diz o recorte', async ({ browser }) => {
  await como(browser, dona!, async p => {
    await p.goto('/admin/dashboard')
    await expect(p.locator('[data-recorte-dos-cancelados]')).toContainText('até agora')
  })
})
