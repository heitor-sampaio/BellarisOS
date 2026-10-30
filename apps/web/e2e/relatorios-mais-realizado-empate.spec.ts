import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { apagarAgendamentos } from './apoio/limpeza'

/**
 * J-58 (ajustes J, 2026-10-30): o "Mais realizado" de Relatórios →
 * Procedimentos escolhia pela ordem alfabética no empate, sem avisar. Agora a
 * receita desempata; empatando nela também, o cartão mostra os empatados e diz
 * "Empate" (`maisRealizado`, lib/metrics/resultado.ts).
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let dona: MembroDeTeste | null = null
let outroProcedimento = ''

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: dona!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  test.setTimeout(180_000)
  rede = await criarOutraRede(`mr${marca}`)
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  dona = await criarMembro(`mrd${marca}`, { tenant: rede.tenantId, donoDaRede: true, permissoes: [] })
  expect((await db().from('procedures').update({ name: `${PREFIXO} Peeling ${marca}` }).eq('id', rede.procedureId)).error).toBeNull()
  const { data: pr, error } = await db().from('procedures')
    .insert({ tenant_id: rede.tenantId, name: `${PREFIXO} Limpeza ${marca}`, category: 'e2e', duration_min: 30, price: 0 })
    .select('id').single<{ id: string }>()
  expect(error).toBeNull()
  outroProcedimento = pr!.id
  const cliente = await rede.criarCliente('Empate')
  const base = { branch_id: rede.branchId, client_id: cliente, professional_id: rede.professionalId, source: 'INTERNAL', duration_min: 10, price: 150, status: 'COMPLETED' }
  const quando = (m: number) => ({ scheduled_at: new Date(Date.now() - m * 60_000).toISOString(), completed_at: new Date(Date.now() - (m - 5) * 60_000).toISOString() })
  expect((await db().from('appointments').insert([
    { ...base, procedure_id: rede.procedureId, ...quando(40) },
    { ...base, procedure_id: outroProcedimento, ...quando(20) },
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

test('empate em execuções e receita: o cartão mostra os dois e diz que empatou', async ({ browser }) => {
  await como(browser, async p => {
    await p.goto('/admin/reports?tab=procedimentos&period=today')
    await expect(p.locator('[data-mais-realizado]')).toHaveText(`${PREFIXO} Limpeza ${marca} e ${PREFIXO} Peeling ${marca}`)
    await expect(p.locator('[data-mais-realizado-detalhe]')).toContainText('Empate: 1 execução cada')
  })
})
