import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * Os atritos de cargos da 15ª simulação (2026-11-15), numa rede própria.
 *
 * - A14 (princípio 7): com o CRM ou o Prontuário em Gerenciar e sem "o que
 *   enxerga", o Salvar não salvava, e o aviso que dizia por quê morava no pé
 *   da página — a pessoa lia "Nenhum acesso ainda" e não achava o que faltava.
 *   Ao clicar, a tela rola até o primeiro módulo sem escolha e o destaca. A
 *   regra fica (o alcance nasce sem escolha, A2 da 12ª).
 */

test.setTimeout(180_000)

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede
let dona: MembroDeTeste

async function como(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado, viewport: { width: 1440, height: 900 } })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`cfg15${marca}`)
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  dona = await criarMembro(`cfg15d${marca}`, { tenant: rede.tenantId, donoDaRede: true, rotulo: 'Dona', permissoes: [] })
})

test.afterAll(async () => {
  await dona?.limpar()
  await rede?.limpar()
})

test('A14: o Salvar sem "o que enxerga" rola até o módulo que falta e o destaca', async ({ browser }) => {
  const rotulo = `${PREFIXO} Balcão ${marca}`
  await como(browser, dona, async p => {
    await p.goto('/admin/settings?tab=permissions')
    await p.getByRole('button', { name: 'Novo' }).click()
    await p.getByPlaceholder('Ex.: Agenda e caixa').fill(rotulo)
    await p.getByRole('button', { name: 'Criar' }).click()
    await expect(p.getByRole('heading', { name: /O que .* acessa/ })).toContainText(rotulo)

    const crm = p.locator('[data-modulo="crm"]')
    await crm.getByRole('button', { name: 'Gerenciar', exact: true }).click()
    await expect(crm.locator('[data-alcance-sem-escolha]')).toBeVisible()
    // Lá embaixo, no botão: o CRM some da tela.
    const salvar = p.getByRole('button', { name: 'Salvar acessos' })
    await salvar.scrollIntoViewIfNeeded()
    await salvar.click()

    await expect(crm).toHaveAttribute('data-destacado', '1')
    await expect(crm).toBeInViewport()
    await expect(p.getByText('Acessos salvos.')).toHaveCount(0)

    // Escolhido, o destaque sai.
    await crm.getByRole('button', { name: 'Todas as oportunidades', exact: true }).click()
    await expect(crm).not.toHaveAttribute('data-destacado', '1')
  })
})
