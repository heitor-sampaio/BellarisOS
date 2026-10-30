import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * As dicas dos números (ajustes J, 2026-10-30).
 *
 * J-55: a "Taxa de aproveitamento" do dashboard e a "Taxa de Conclusão" dos
 * Relatórios davam números diferentes sem explicação. As duas são concluídos ÷
 * marcados — mas o dashboard conta até AGORA e a aba Agenda até o FIM do
 * período, com os agendamentos que ainda vão acontecer (indicadores.md). Cada
 * uma tem, ao lado, a dica com a definição.
 *
 * J-56: na virada da meia-noite, nenhum rótulo dizia qual data cada número usa.
 * O atendimento conta pela hora MARCADA; a receita, pelo dia do PAGAMENTO.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let dona: MembroDeTeste | null = null

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: dona!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`dt${marca}`)
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  dona = await criarMembro(`dtd${marca}`, { tenant: rede.tenantId, donoDaRede: true, permissoes: [] })
})
test.afterAll(async () => { await dona?.limpar(); await rede?.limpar() })

async function abrirDica(p: Page, rotulo: string) {
  await p.getByRole('button', { name: rotulo }).first().click()
  return p.getByRole('tooltip')
}

test('J-55: aproveitamento (dashboard) e conclusão (Relatórios) dizem a conta de cada um', async ({ browser }) => {
  await como(browser, async p => {
    await p.goto('/admin/dashboard')
    const aproveitamento = await abrirDica(p, 'O que é a taxa de aproveitamento')
    await expect(aproveitamento).toContainText('até agora')
    await expect(aproveitamento).toContainText('Taxa de Conclusão')

    await p.goto('/admin/reports?tab=agenda&period=month')
    const conclusao = await abrirDica(p, 'O que é a taxa de conclusão')
    await expect(conclusao).toContainText('até o fim do período')
    await expect(conclusao).toContainText('aproveitamento')
  })
})
