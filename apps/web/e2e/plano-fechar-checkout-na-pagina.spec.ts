import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * A44 da 5ª simulação: a página do plano proposto em Tratamentos não tinha o
 * que fazer para quem recebe sem o prontuário — o botão só existia na tela do
 * atendimento da avaliação.
 *
 * Desde a fase 3 do PDV (a revisão do Heitor, 2026-11-13 — PT1b), o aceite é
 * um gesto sem dinheiro, e quem recebe também aceita: da página do plano, o
 * "Aceitar plano", e dali o "Receber no PDV" leva à comanda do plano.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede
let recepcao: MembroDeTeste
let slug = ''
let planId = ''

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: recepcao.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`pfc${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  planId = (await rede.criarPlanoProposto('Checkout', { semTermo: true })).planId
  recepcao = await criarMembro(`pfcr${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Recepção',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'VIEW' }, { modulo: 'cashier', nivel: 'MANAGE' }],
  })
})
test.afterAll(async () => {
  await db().from('treatment_plans').delete().eq('branch_id', rede.branchId)
  await recepcao?.limpar(); await rede?.limpar()
})

test('A44: quem recebe abre o plano proposto em Tratamentos, aceita dali e chega ao receber no PDV', async ({ browser }) => {
  await como(browser, async p => {
    await p.goto(`/${slug}/planejamentos/${planId}`)
    await expect(p.getByRole('button', { name: 'Fechar checkout' })).toHaveCount(0)
    await p.getByRole('button', { name: 'Aceitar plano' }).click()
    const falta = p.locator('[data-plano-falta-receber]')
    await expect(falta).toBeVisible({ timeout: 20_000 })
    await falta.getByRole('link', { name: 'Receber no PDV' }).click()
    await expect(p).toHaveURL(new RegExp(`/${slug}/pdv\\?unidade=`))
    await p.getByRole('button', { name: 'Receber o plano' }).click()
    await expect(p.getByRole('dialog', { name: 'Receber o plano' })).toBeVisible()
  })
  expect((await db().from('treatment_plans').select('status').eq('id', planId).single()).data!.status).toBe('ACCEPTED')
  expect((await db().from('financial_transactions').select('id').eq('treatment_plan_id', planId)).data ?? [], 'o aceite não lança dinheiro').toHaveLength(0)
})
