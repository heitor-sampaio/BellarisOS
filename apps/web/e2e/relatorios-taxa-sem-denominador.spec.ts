import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * ind-10 (revisão de 2026-11-02, "mudar"): taxa sem denominador mostra "—",
 * não 0%. "0% diz que foi ruim; '—' diz que não houve." Numa rede sem
 * nenhum agendamento, cliente atendida ou estoque, Relatórios mostrava
 * "Taxa de Conclusão 0%", "Taxa de Retenção 0%" e "Giro 0%".
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let gestor: MembroDeTeste | null = null

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: gestor!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}
const kpi = (p: Page, rotulo: string) =>
  p.getByText(rotulo, { exact: true }).first().locator('xpath=ancestor::div[contains(@class,"card")][1]')

test.beforeAll(async () => {
  rede = await criarOutraRede(`tx${marca}`)
  gestor = await criarMembro(`txg${marca}`, {
    tenant: rede.tenantId, rotulo: 'Gestora',
    permissoes: [{ modulo: 'agenda', nivel: 'VIEW' }, { modulo: 'financial', nivel: 'VIEW' }, { modulo: 'clients', nivel: 'VIEW' },
      { modulo: 'stock', nivel: 'VIEW' }, { modulo: 'reports', nivel: 'VIEW' }],
  })
  expect((await db().from('role_report_tabs').insert(['agenda', 'clientes', 'estoque']
    .map(tab => ({ tenant_id: rede!.tenantId, role_id: gestor!.roleId, tab })))).error).toBeNull()
})
test.afterAll(async () => { await gestor?.limpar(); await rede?.limpar() })

test('sem agendamento, cliente atendida nem estoque, as taxas dizem "—"', async ({ browser }) => {
  await como(browser, async p => {
    await p.goto('/admin/reports?period=month&tab=agenda')
    await expect(kpi(p, 'Taxa de Conclusão')).toContainText('—')
    await expect(kpi(p, 'Taxa de Conclusão')).not.toContainText('0,0%')
    await p.goto('/admin/reports?period=month&tab=clientes')
    await expect(kpi(p, 'Taxa de Retenção')).toContainText('—')
    await p.goto('/admin/reports?period=month&tab=estoque')
    await expect(kpi(p, 'Giro (%)')).toContainText('—')
  })
})
