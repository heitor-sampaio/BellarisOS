import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * D7 da simulação de 2026-10-28 (o dashboard): a profissional da rede, com a
 * agenda e o financeiro "só os meus", via no dashboard da REDE a receita de
 * todas, o custo do mês (R$ 4.500), o lucro e a margem por procedimento. O
 * dashboard da unidade já recortava (`professionalOnly`); o da rede rodava
 * `getCore` sem o profissional.
 *
 * Decisão: o mesmo recorte do da unidade — com o escopo "só os meus", os
 * números são os DELA (lib/metrics, `professionalId`), e o dinheiro da rede
 * (custo, evolução com lucro, ranking de filiais, receita e margem por
 * procedimento, vendas por profissional, gasto das clientes) não aparece.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let propria: MembroDeTeste | null = null
let gestora: MembroDeTeste | null = null
const agora = new Date().toISOString()

async function como(browser: Browser, quem: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: quem.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

async function atendidoEPago(rotulo: string, professionalId: string, valor: number) {
  const cliente = await rede!.criarCliente(rotulo)
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: cliente, procedure_id: rede!.procedureId, professional_id: professionalId,
    status: 'COMPLETED', source: 'INTERNAL', duration_min: 30, price: valor, scheduled_at: agora, completed_at: agora,
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  const { error: eT } = await db().from('financial_transactions').insert({
    branch_id: rede!.branchId, client_id: cliente, appointment_id: data!.id, type: 'INCOME', category: 'Serviços',
    description: `[e2e] pago ${valor} ${marca}`, amount: valor, payment_method: 'PIX', is_paid: true, paid_at: agora, created_by: 'e2e',
  })
  expect(eT).toBeNull()
}

const RANKINGS_DE_DINHEIRO = [
  'Ranking de filiais', 'Ranking — Procedimentos por receita bruta', 'Ranking — Procedimentos por margem',
  'Ranking — Vendas', 'Ranking — Valor gasto',
]

test.beforeAll(async () => {
  rede = await criarOutraRede(`dr${marca}`)
  expect((await db().from('users').update({ branch_id: rede.branchId, provides_services: true }).eq('id', rede.professionalId)).error).toBeNull()
  expect((await db().from('procedures').update({ price: 100 }).eq('id', rede.procedureId)).error).toBeNull()
  const modulos = (escopo: 'OWN' | 'ALL') => [
    { modulo: 'agenda' as const, nivel: 'MANAGE' as const, escopo },
    { modulo: 'financial' as const, nivel: 'VIEW' as const, escopo },
    { modulo: 'procedures' as const, nivel: 'VIEW' as const },
    { modulo: 'clients' as const, nivel: 'VIEW' as const },
    { modulo: 'team' as const, nivel: 'VIEW' as const },
  ]
  // Como a Renata: da rede, "só os meus" na agenda e no financeiro.
  propria = await criarMembro(`drp${marca}`, { tenant: rede.tenantId, rotulo: 'Profissional', permissoes: modulos('OWN') })
  expect((await db().from('users').update({ provides_services: true }).eq('id', propria.userId)).error).toBeNull()
  gestora = await criarMembro(`drg${marca}`, { tenant: rede.tenantId, rotulo: 'Gestora', permissoes: modulos('ALL') })

  await atendidoEPago('Dela', propria.userId, 120)
  await atendidoEPago('Da outra', rede.professionalId, 300)
  const { error } = await db().from('financial_transactions').insert({
    branch_id: rede.branchId, type: 'EXPENSE', category: 'Aluguel', description: `[e2e] aluguel ${marca}`,
    amount: 777, payment_method: 'PIX', is_paid: true, paid_at: agora, created_by: 'e2e',
  })
  expect(error).toBeNull()
})
test.afterAll(async () => {
  if (rede) {
    await db().from('financial_transactions').delete().eq('branch_id', rede.branchId)
    await db().from('appointments').delete().eq('branch_id', rede.branchId)
  }
  await propria?.limpar(); await gestora?.limpar(); await rede?.limpar()
})

test('"só os meus": o dashboard da rede mostra a receita DELA, sem custo, lucro, margem nem o dinheiro das outras', async ({ browser }) => {
  await como(browser, propria!, async p => {
    await p.goto('/admin/dashboard?period=month')
    await expect(p.getByRole('heading', { name: 'Visão geral da rede' })).toBeVisible()
    const corpo = p.locator('main')
    await expect.soft(corpo, 'a receita dela').toContainText('R$ 120,00')
    await expect.soft(corpo, 'não a da rede').not.toContainText('R$ 420,00')
    await expect.soft(corpo, 'nem o custo').not.toContainText('777,00')
    await expect.soft(p.getByText('Custo do mês')).toHaveCount(0)
    for (const r of RANKINGS_DE_DINHEIRO) await expect.soft(p.getByText(r, { exact: true }), r).toHaveCount(0)
  })
})

test('"só os meus": o dashboard da UNIDADE não mostra o faturamento da unidade nos últimos 6 meses', async ({ browser }) => {
  const slug = (await db().from('branches').select('slug').eq('id', rede!.branchId).single<{ slug: string }>()).data!.slug
  await como(browser, propria!, async p => {
    await p.goto(`/${slug}/dashboard`)
    await expect(p.getByText('Meus agendamentos hoje')).toBeVisible()
    await expect.soft(p.getByText('Últimos 6 meses'), 'o gráfico do faturamento da unidade').toHaveCount(0)
    await expect.soft(p.locator('main'), 'a receita dela').toContainText(/Faturamento do mês\s*R\$\s*120(?!\d)/)
    await expect.soft(p.locator('main'), 'nem a da unidade no semestre').not.toContainText('R$ 420')
  })
  await como(browser, gestora!, async p => {
    await p.goto(`/${slug}/dashboard`)
    await expect(p.getByText('Últimos 6 meses'), 'controle').toBeVisible()
    await expect(p.locator('main')).toContainText(/Faturamento do mês\s*R\$\s*420/)
  })
})

test('quem tem ALL segue vendo o dinheiro da rede (controle)', async ({ browser }) => {
  await como(browser, gestora!, async p => {
    await p.goto('/admin/dashboard?period=month')
    const corpo = p.locator('main')
    await expect(corpo).toContainText('R$ 420,00')
    await expect(corpo).toContainText('777,00')
    await expect(p.getByText('Custo do mês')).toBeVisible()
    for (const r of RANKINGS_DE_DINHEIRO) await expect(p.getByText(r, { exact: true }).first(), r).toBeVisible()
  })
})
