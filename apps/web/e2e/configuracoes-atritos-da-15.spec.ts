import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * Os atritos de cargos da 15ª simulação (2026-11-15), numa rede própria.
 *
 * - A14 (princípio 7): com um módulo ligado e sem a escolha que ele pede, o
 *   Salvar não salvava, e o aviso que dizia por quê morava no pé da página.
 *   Ao clicar, a tela rola até o módulo sem escolha e o destaca. Sem o "só os
 *   meus" (SM1, o Heitor, 2026-11-23), o que sobra a escolher é a aba do
 *   Relatórios em "Ver" (A2 da 12ª).
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

// Sem o "só os meus" (SM1, o Heitor, 2026-11-23): o CRM não pede mais "o que enxerga"; o Relatórios pede a aba.
test('A14: o Salvar com o Relatórios sem aba rola até ele e o destaca', async ({ browser }) => {
  const rotulo = `${PREFIXO} Balcão ${marca}`
  await como(browser, dona, async p => {
    await p.goto('/admin/settings?tab=permissions')
    await p.getByRole('button', { name: 'Novo' }).click()
    await p.getByPlaceholder('Ex.: Agenda e caixa').fill(rotulo)
    await p.getByRole('button', { name: 'Criar' }).click()
    await expect(p.getByRole('heading', { name: /O que .* acessa/ })).toContainText(rotulo)

    const relatorios = p.locator('[data-modulo="reports"]')
    await relatorios.getByRole('button', { name: 'Ver', exact: true }).click()
    // Lá embaixo, no botão: o Relatórios some da tela.
    const salvar = p.getByRole('button', { name: 'Salvar acessos' })
    await salvar.scrollIntoViewIfNeeded()
    await salvar.click()

    await expect(relatorios).toHaveAttribute('data-destacado', '1')
    await expect(relatorios).toBeInViewport()
    await expect(p.getByText('Acessos salvos.')).toHaveCount(0)

    // Escolhido, o destaque sai.
    await relatorios.getByRole('button', { name: 'Financeiro', exact: true }).click()
    await expect(relatorios).not.toHaveAttribute('data-destacado', '1')
  })
})
