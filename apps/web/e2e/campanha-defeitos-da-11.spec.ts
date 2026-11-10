import { test, expect, type Page, type Browser } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'

/**
 * D8 da 11ª simulação (2026-11-10): a campanha automática nascia com o gatilho
 * "Aniversário" já marcado. A "Reativação 60 dias" da Marta ficou com o
 * gatilho de aniversário e o público "sem visita há mais de 60 dias" — só
 * sairia no aniversário de quem sumiu —, e a revisão e os detalhes não diziam
 * quando dispara. Princípios 3 e 6: o gatilho começa SEM escolha (a dona
 * escolhe), e a revisão e os detalhes dizem quando dispara.
 * Rede `[e2e]` própria, membro com Marketing em Gerenciar.
 */

const marca = Date.now().toString(36)
let rede: OutraRede | null = null
let membro: MembroDeTeste | null = null

test.beforeAll(async () => {
  rede = await criarOutraRede(`cp11${marca}`)
  membro = await criarMembro(`cp11${marca}`, { tenant: rede.tenantId, rotulo: 'Marketing', permissoes: [{ modulo: 'marketing', nivel: 'MANAGE' }] })
})

test.afterAll(async () => {
  if (rede) await banco().from('notification_campaigns').delete().eq('tenant_id', rede.tenantId)
  await membro?.limpar(); await rede?.limpar()
})

async function comoMembro(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: membro!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test('D8: o gatilho começa sem escolha, e a revisão e os detalhes dizem quando dispara', async ({ browser }) => {
  await comoMembro(browser, async page => {
    await page.goto('/admin/notificacoes/nova')
    await page.getByRole('button', { name: /Automática/ }).click()
    const gatilhos = page.getByRole('group', { name: 'Gatilho da automação' }).getByRole('button')
    await expect(gatilhos).toHaveCount(5)
    for (const g of await gatilhos.all()) await expect(g, 'nenhum gatilho vem marcado').toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByRole('button', { name: 'Próximo' }), 'sem gatilho, não avança').toBeDisabled()
    await expect(page.locator('[data-escolha-o-gatilho]')).toBeVisible()

    await gatilhos.filter({ hasText: 'Pós-visita' }).click()
    await expect(gatilhos.filter({ hasText: 'Pós-visita' })).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: 'Próximo' }).click()
    await page.getByPlaceholder('ex: Aniversariantes de julho').fill(`[e2e] Reativação ${marca}`)
    await page.getByPlaceholder(/Feliz aniversário/).fill('Sentimos sua falta, {{first_name}}')
    await page.getByPlaceholder(/Como presente/).fill('Volte para a sua próxima sessão.')
    await page.getByRole('button', { name: 'Próximo' }).click()
    await page.getByRole('button', { name: 'Próximo' }).click()

    await expect(page.locator('[data-quando-dispara]')).toContainText('30 dias depois do último atendimento da cliente, a partir das 09:00')
    await page.getByRole('button', { name: /Salvar rascunho/ }).click()
    await expect(page).toHaveURL(/\/admin\/notificacoes$/)
  })
  const { data: camp } = await banco().from('notification_campaigns').select('id, trigger_type').eq('tenant_id', rede!.tenantId).single<{ id: string; trigger_type: string }>()
  expect(camp!.trigger_type).toBe('DAYS_AFTER_VISIT')
  await comoMembro(browser, async page => {
    await page.goto(`/admin/notificacoes/${camp!.id}`)
    await expect(page.locator('[data-quando-dispara]')).toContainText('30 dias depois do último atendimento da cliente, a partir das 09:00')
  })
})
