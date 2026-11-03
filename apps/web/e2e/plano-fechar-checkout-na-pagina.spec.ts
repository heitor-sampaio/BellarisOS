import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * A44 da 5ª simulação: a página do plano em Tratamentos ("Aguardando
 * checkout") não tinha "Fechar checkout" — o botão só existia na tela do
 * atendimento da avaliação. A recepção (quem recebe, sem o prontuário) abria
 * o plano proposto e não tinha o que fazer.
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

test('A44: a recepção abre o plano proposto em Tratamentos e fecha o checkout dali', async ({ browser }) => {
  await como(browser, async p => {
    await p.goto(`/${slug}/planejamentos/${planId}`)
    await p.getByRole('button', { name: 'Fechar checkout' }).click()
    await expect(p.getByRole('dialog', { name: 'Checkout' })).toBeVisible()
  })
})
