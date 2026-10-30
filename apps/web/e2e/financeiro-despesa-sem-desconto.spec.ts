import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * A despesa no Novo lançamento (J-50, simulação de 2026-10-28/29):
 * - a categoria "Contas (energia, água, internet)" — a conta de luz caía em
 *   "Outro";
 * - a despesa não pede "Desconto" (desconto é de venda; na despesa a pessoa
 *   digita o que pagou). O desconto digitado na receita não vaza para a
 *   despesa quando a pessoa troca o tipo.
 *
 * A categoria nova é despesa operacional comum: conta no caixa E no lucro (só
 * a "Compra de estoque" fica fora do lucro — `tests/financeiro-categorias`).
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let financeiro: MembroDeTeste | null = null
let slug = ''

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: financeiro!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`fsd${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  financeiro = await criarMembro(`fsdf${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Financeiro', permissoes: [{ modulo: 'financial', nivel: 'MANAGE' }],
  })
})
test.afterAll(async () => {
  const falhas: string[] = []
  if (rede) {
    const r = await db().from('financial_transactions').delete().eq('branch_id', rede.branchId)
    if (r.error) falhas.push(r.error.message)
  }
  await financeiro?.limpar(); await rede?.limpar()
  expect(falhas).toEqual([])
})

test('a despesa tem a categoria "Contas" e não pede desconto', async ({ browser }) => {
  const descricao = `Conta de energia ${marca}`
  await como(browser, async p => {
    await p.goto(`/${slug}/financeiro`)
    await p.getByRole('button', { name: 'Novo lançamento' }).click()
    const dialogo = p.locator('dialog[open]').filter({ hasText: 'Novo lançamento' })

    // Na receita o desconto continua (é venda). A pessoa digita um e troca.
    await expect(dialogo.getByText('Desconto', { exact: true })).toBeVisible()
    await dialogo.getByPlaceholder('Ex: 10').fill('10')

    await dialogo.getByRole('button', { name: 'Despesa' }).click()
    await expect(dialogo.getByText('Desconto', { exact: true }), 'a despesa não pede desconto').toHaveCount(0)
    await dialogo.getByLabel('Descrição *').fill(descricao)
    await dialogo.getByLabel('Categoria *').selectOption('Contas (energia, água, internet)')
    await dialogo.getByLabel('Valor (R$) *').fill('200')
    await dialogo.getByRole('button', { name: 'Lançar' }).click()
    await expect(dialogo).toBeHidden()
  })
  const { data, error } = await db().from('financial_transactions')
    .select('amount, category, type, is_paid').eq('description', descricao).single<{ amount: number; category: string; type: string; is_paid: boolean }>()
  expect(error).toBeNull()
  expect({ ...data, amount: Number(data!.amount) }, 'o valor digitado, sem o desconto da receita')
    .toEqual({ amount: 200, category: 'Contas (energia, água, internet)', type: 'EXPENSE', is_paid: true })
})
