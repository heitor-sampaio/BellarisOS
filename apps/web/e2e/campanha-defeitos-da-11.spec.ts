import { test, expect, type Page, type Browser } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'

/**
 * D8 da 11ª simulação (2026-11-10): a campanha automática nascia com o gatilho
 * "Aniversário" já marcado, e a revisão e os detalhes não diziam quando ela
 * sairia. Princípios 3 e 6: nada vem escolhido pela dona, e a revisão e os
 * detalhes dizem quando dispara.
 *
 * MK1 (2026-11-14): a "Automática" saiu (os gatilhos de cada cliente são
 * modelos nas Automações); a regra vale para a Agendada — sem a data, não
 * avança; a de todo ano diz quando sai, na revisão e nos detalhes.
 * Rede `[e2e]` própria, com a Admin da rede (desde 18/11, só ela monta a campanha).
 */

const marca = Date.now().toString(36)
let rede: OutraRede | null = null
let membro: MembroDeTeste | null = null

test.beforeAll(async () => {
  rede = await criarOutraRede(`cp11${marca}`)
  // A campanha é configuração da rede toda: só a Admin da rede (o Heitor,
  // 18/11: "Configuração da rede toda só pela conta admin").
  membro = await criarMembro(`cp11${marca}`, { tenant: rede.tenantId, rotulo: 'Marketing', donoDaRede: true, permissoes: [] })
})

test.afterAll(async () => {
  if (rede) await banco().from('notification_campaigns').delete().eq('tenant_id', rede.tenantId)
  await membro?.limpar(); await rede?.limpar()
})

async function comoMembro(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: membro!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test('D8: a agendada não avança sem a data, e a revisão e os detalhes dizem quando dispara', async ({ browser }) => {
  await comoMembro(browser, async page => {
    await page.goto('/admin/notificacoes/nova')
    await page.getByRole('button', { name: /Agendada/ }).click()
    await expect(page.getByLabel('Data e hora do disparo')).toHaveValue('')
    await expect(page.getByRole('button', { name: 'Próximo' }), 'sem a data, não avança').toBeDisabled()

    await page.getByRole('group', { name: 'Quando a campanha sai' }).getByRole('button', { name: /Todo ano/ }).click()
    await page.getByLabel('Mês').selectOption('3')
    await page.getByLabel('Dia', { exact: true }).fill('8')
    await page.getByRole('button', { name: 'Próximo' }).click()
    await page.getByPlaceholder('ex: Aniversariantes de julho').fill(`[e2e] Dia da Mulher ${marca}`)
    await page.getByPlaceholder(/Feliz aniversário/).fill('Feliz Dia da Mulher, {{first_name}}')
    await page.getByPlaceholder(/Como presente/).fill('Um presente para você.')
    await page.getByRole('button', { name: 'Próximo' }).click()
    await page.getByRole('button', { name: 'Próximo' }).click()

    await expect(page.locator('[data-quando-dispara]')).toContainText('todo ano em 08/03, a partir das 09:00')
    await page.getByRole('button', { name: /Salvar rascunho/ }).click()
    await expect(page).toHaveURL(/\/admin\/notificacoes$/)
  })
  const { data: camp } = await banco().from('notification_campaigns').select('id, trigger_type').eq('tenant_id', rede!.tenantId).single<{ id: string; trigger_type: string }>()
  expect(camp!.trigger_type).toBe('ANNUAL_DATE')
  await comoMembro(browser, async page => {
    await page.goto(`/admin/notificacoes/${camp!.id}`)
    await expect(page.locator('[data-quando-dispara]')).toContainText('todo ano em 08/03, a partir das 09:00')
  })
})
