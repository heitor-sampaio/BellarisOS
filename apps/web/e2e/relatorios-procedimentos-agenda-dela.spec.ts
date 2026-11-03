import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * ind-05 (revisão das 113 decisões, 2026-11-02: "mudar"): a tabela por
 * procedimento junta as execuções (da agenda) e a receita (do financeiro).
 * A Renata, com a agenda "só os meus" e o financeiro de todos, via
 * "Toxina · 0 execuções · R$ 2.400" — parecia que ela gerou a receita. A linha
 * sem execução DELA sai, e a receita diz que é a da clínica.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let renata: MembroDeTeste | null = null
let limpeza = '', toxina = ''
const agora = new Date().toISOString()

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: renata!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

async function atendidoEPago(procedimento: string, profissional: string, valor: number) {
  const c = await rede!.criarCliente(`c${valor}`)
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: c, procedure_id: procedimento, professional_id: profissional,
    status: 'COMPLETED', source: 'INTERNAL', duration_min: 30, price: valor, scheduled_at: agora, completed_at: agora,
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  expect((await db().from('financial_transactions').insert({
    branch_id: rede!.branchId, client_id: c, appointment_id: data!.id, type: 'INCOME', category: 'Serviços',
    description: `[e2e] pago ${valor} ${marca}`, amount: valor, payment_method: 'PIX', is_paid: true, paid_at: agora, created_by: 'e2e',
  })).error).toBeNull()
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`pd${marca}`)
  renata = await criarMembro(`pdr${marca}`, {
    tenant: rede.tenantId, rotulo: 'Profissional',
    permissoes: [
      { modulo: 'agenda', nivel: 'VIEW', escopo: 'OWN' },
      { modulo: 'financial', nivel: 'VIEW', escopo: 'ALL' },
      { modulo: 'reports', nivel: 'VIEW' },
    ],
  })
  expect((await db().from('users').update({ provides_services: true }).eq('id', renata.userId)).error).toBeNull()
  expect((await db().from('role_report_tabs').insert({ tenant_id: rede.tenantId, role_id: renata.roleId, tab: 'procedimentos' })).error).toBeNull()
  const procs = await db().from('procedures').insert([
    { tenant_id: rede.tenantId, name: `[e2e] Limpeza ${marca}`, category: 'Facial', duration_min: 30, price: 200 },
    { tenant_id: rede.tenantId, name: `[e2e] Toxina ${marca}`, category: 'Injetáveis', duration_min: 30, price: 2400 },
  ]).select('id, price')
  expect(procs.error).toBeNull()
  limpeza = procs.data!.find(p => Number(p.price) === 200)!.id
  toxina = procs.data!.find(p => Number(p.price) === 2400)!.id
  await atendidoEPago(limpeza, renata.userId, 200)          // a dela
  await atendidoEPago(toxina, rede.professionalId, 2400)    // a da outra
})
test.afterAll(async () => {
  await db().from('financial_transactions').delete().eq('branch_id', rede!.branchId)
  await renata?.limpar(); await rede?.limpar()
})

test('com a agenda dela e o financeiro da clínica, a tabela não mostra "0 execuções" com a receita de outra', async ({ browser }) => {
  await como(browser, async p => {
    await p.goto('/admin/reports?period=month&tab=procedimentos')
    const tabela = p.locator('table').filter({ hasText: 'Execuções' })
    await expect(tabela.getByRole('row', { name: `Limpeza ${marca}` })).toBeVisible()
    await expect(tabela.getByRole('row', { name: `Toxina ${marca}` })).toHaveCount(0)
    await expect(tabela.getByRole('columnheader', { name: 'Receita dos atendimentos (da clínica)' })).toBeVisible()
  })
})
