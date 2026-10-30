import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { apagarAgendamentos } from './apoio/limpeza'
import { monthKeyTZ } from '../lib/datetime'

/**
 * J-57 (ajustes J, 2026-10-30): o gráfico "Status dos Agendamentos" da Visão
 * geral contava só até AGORA — com 7 agendamentos no mês, mostrava 80%
 * concluídos e 20% cancelados, sem os 2 que ainda vão acontecer.
 *
 * Agora ele conta os agendamentos do PERÍODO inteiro (até o fim dele, a
 * janela da aba Agenda), com a fatia "Em aberto", e cada fatia diz quantos.
 * Os números vêm do núcleo (`metrics_core` até o fim do período) e as fatias,
 * de `statusDosAgendamentos` (lib/metrics) — a tela não subtrai.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let dona: MembroDeTeste | null = null

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: dona!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

const minutos = (m: number) => new Date(Date.now() + m * 60_000).toISOString()

test.beforeAll(async () => {
  test.setTimeout(180_000)
  rede = await criarOutraRede(`sa${marca}`)
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  dona = await criarMembro(`sad${marca}`, { tenant: rede.tenantId, donoDaRede: true, permissoes: [] })
  const cliente = await rede.criarCliente('Status')
  const base = { branch_id: rede.branchId, client_id: cliente, procedure_id: rede.procedureId, professional_id: rede.professionalId,
    source: 'INTERNAL', duration_min: 10, price: 0 }
  // 4 concluídos e 1 cancelado que já passaram; 2 marcados para daqui a pouco.
  const passados = [-50, -40, -30, -20].map(m => ({ ...base, status: 'COMPLETED', scheduled_at: minutos(m), completed_at: minutos(m + 5) }))
  expect((await db().from('appointments').insert([
    ...passados,
    { ...base, status: 'CANCELLED', scheduled_at: minutos(-10), cancelled_at: minutos(-60), cancellation_reason: '[e2e]' },
    { ...base, status: 'SCHEDULED', scheduled_at: minutos(20) },
    { ...base, status: 'CONFIRMED', scheduled_at: minutos(30) },
  ])).error).toBeNull()
})

test.afterAll(async () => {
  if (rede) {
    const { data: ags } = await db().from('appointments').select('id').eq('branch_id', rede.branchId)
    expect(await apagarAgendamentos((ags ?? []).map(a => a.id as string))).toEqual([])
  }
  await dona?.limpar()
  await rede?.limpar()
})

test('a Visão geral conta os agendamentos do mês inteiro, com os ainda em aberto', async ({ browser }) => {
  test.skip(monthKeyTZ(minutos(-60)) !== monthKeyTZ(minutos(35)), 'os agendamentos cruzariam a virada do mês')
  await como(browser, async p => {
    await p.goto('/admin/reports?tab=overview&period=month')
    const cartao = p.locator('.card', { hasText: /Status dos agendamentos/i }).last()
    await expect(cartao).toContainText('Em aberto')
    await expect(cartao).toContainText('2 (29%)')
    await expect(cartao).toContainText('4 (57%)')
    await expect(cartao).toContainText('1 (14%)')
  })
})
