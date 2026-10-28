import { test, expect } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * Dashboard e Relatórios dizem a mesma coisa (A37, A38 da simulação de
 * 2026-10-27):
 * - numa rede sem mês anterior o dashboard mostrava "100,0% vs. mês anterior"
 *   (crescimento inventado a partir do zero) e os Relatórios, "sem dados
 *   anteriores";
 * - a aba Agenda dos Relatórios fechava o período em "agora" e deixava de fora
 *   os agendamentos futuros e o cancelamento de amanhã, sem aviso.
 */
const marca = Date.now().toString(36)
let rede: OutraRede | null = null
let dono: MembroDeTeste | null = null
let clienteId = ''

test.beforeAll(async () => {
  rede = await criarOutraRede(`di${marca}`)
  const db = banco()
  expect((await db.from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  clienteId = await rede.criarCliente(`di${marca}`)
  dono = await criarMembro(`di${marca}`, { tenant: rede.tenantId, donoDaRede: true, permissoes: [] })

  // Dois agendamentos ainda neste mês, no futuro: um marcado e um cancelado.
  const agora = Date.now()
  const fimDoMes = new Date(`${new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(agora)).slice(0, 7)}-01T00:00:00-03:00`)
  fimDoMes.setUTCMonth(fimDoMes.getUTCMonth() + 1)
  const quando = new Date(Math.min(agora + 26 * 3600_000, fimDoMes.getTime() - 3600_000))
  for (const status of ['SCHEDULED', 'CANCELLED']) {
    const { error } = await db.from('appointments').insert({
      branch_id: rede.branchId, client_id: clienteId, procedure_id: rede.procedureId, professional_id: rede.professionalId,
      status, source: 'CLIENT_APP', duration_min: 30, price: 0, scheduled_at: quando.toISOString(),
    })
    expect(error, 'agendar').toBeNull()
  }
})
test.afterAll(async () => {
  if (rede) await banco().from('appointments').delete().eq('branch_id', rede.branchId)
  await dono?.limpar(); await rede?.limpar()
})

test('A37: sem mês anterior, o dashboard diz "sem dados anteriores" — não 100% de crescimento', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: dono!.estado })
  try {
    const p = await ctx.newPage()
    await p.goto('/admin/dashboard?period=month')
    await expect(p.getByText('Novos clientes').first()).toBeVisible()
    await expect(p.getByText(/100,0% vs/)).toHaveCount(0)
    await expect(p.getByText('sem dados anteriores').first()).toBeVisible()
  } finally { await ctx.close() }
})

test('A38: a aba Agenda do mês conta os futuros e os cancelados até o fim do período, e avisa', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: dono!.estado })
  try {
    const p = await ctx.newPage()
    await p.goto('/admin/reports?tab=agenda&period=month')
    const cartao = p.getByText('Total Agendamentos', { exact: true }).locator('xpath=ancestor::div[contains(@class,"card")][1]')
    await expect.poll(async () => (await cartao.innerText()).replace(/\D/g, ''), { timeout: 10_000 }).toBe('2')
    await expect(p.getByText(/inclui os agendamentos até o fim do período/i)).toBeVisible()
  } finally { await ctx.close() }
})
