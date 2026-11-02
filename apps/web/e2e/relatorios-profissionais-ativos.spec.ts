import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * D14 da 5ª simulação: Relatórios → Profissionais dizia "Profissionais ativos
 * 2" com 3 que atendem (a Renata, sem atendimento no período, ficava de fora:
 * a tela contava quem teve PRODUÇÃO), e a tabela listava a Bruna, que não
 * atende (entrou pela comissão da venda do pacote). Agora "Profissionais
 * ativos" é quem ATENDE (ativo, `provides_services`, ao alcance das unidades
 * do recorte), contado em lib/metrics; a tabela lista quem atende, e a
 * comissão de quem não atende aparece numa linha à parte, sem sumir.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let bruna: MembroDeTeste | null = null
let renata: MembroDeTeste | null = null
const nome: Record<string, string> = {}
const agora = new Date().toISOString()

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: bruna!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}
const nomeDe = async (id: string) => (await db().from('users').select('name').eq('id', id).single<{ name: string }>()).data!.name

test.beforeAll(async () => {
  rede = await criarOutraRede(`pa${marca}`)
  expect((await db().from('users').update({ provides_services: true, branch_id: rede.branchId }).eq('id', rede.professionalId)).error).toBeNull()
  // A Bruna é a recepção (não atende) e é quem abre os relatórios.
  bruna = await criarMembro(`pab${marca}`, {
    tenant: rede.tenantId, rotulo: 'Recepção',
    permissoes: [{ modulo: 'financial', nivel: 'VIEW' }, { modulo: 'reports', nivel: 'VIEW' }],
  })
  expect((await db().from('role_report_tabs').insert({ tenant_id: rede.tenantId, role_id: bruna.roleId, tab: 'profissionais' })).error).toBeNull()
  // A Renata atende, mas não teve atendimento no período.
  renata = await criarMembro(`par${marca}`, { tenant: rede.tenantId, rotulo: 'Profissional', permissoes: [] })
  expect((await db().from('users').update({ provides_services: true, branch_id: rede.branchId }).eq('id', renata.userId)).error).toBeNull()
  nome.prof = await nomeDe(rede.professionalId)
  nome.bruna = await nomeDe(bruna.userId)
  nome.renata = await nomeDe(renata.userId)

  const carla = await rede.criarCliente('Carla')
  expect((await db().from('appointments').insert({
    branch_id: rede.branchId, client_id: carla, procedure_id: rede.procedureId, professional_id: rede.professionalId,
    status: 'COMPLETED', source: 'INTERNAL', duration_min: 30, price: 100, scheduled_at: agora, completed_at: agora,
  })).error).toBeNull()
  // A comissão da Bruna pela venda do pacote.
  expect((await db().from('commissions').insert({
    branch_id: rede.branchId, professional_id: bruna.userId, amount: 20, type: 'FIXED_AMOUNT', rule_value: 20,
    status: 'OPEN', period_ref: agora.slice(0, 7), released_at: agora,
  })).error).toBeNull()
})
test.afterAll(async () => {
  await db().from('commissions').delete().eq('branch_id', rede!.branchId)
  await bruna?.limpar(); await renata?.limpar(); await rede?.limpar()
})

test('"Profissionais ativos" é quem atende, e a tabela não lista quem não atende', async ({ browser }) => {
  await como(browser, async p => {
    await p.goto('/admin/reports?period=month&tab=profissionais')
    const ativos = p.getByText('Profissionais Ativos', { exact: true }).first().locator('xpath=ancestor::div[contains(@class,"card")][1]')
    await expect(ativos).toContainText('2')
    const tabela = p.locator('table').filter({ hasText: 'Comissão Aberta' })
    await expect(tabela.getByRole('row', { name: nome.prof! })).toBeVisible()
    await expect(tabela.getByRole('row', { name: nome.renata! })).toBeVisible()
    await expect(tabela.getByRole('row', { name: nome.bruna! })).toHaveCount(0)
    // A comissão dela não some: fica numa linha à parte.
    await expect(p.locator('[data-comissao-sem-atender]')).toContainText(nome.bruna!)
    await expect(p.locator('[data-comissao-sem-atender]')).toContainText('20,00')
  })
})
