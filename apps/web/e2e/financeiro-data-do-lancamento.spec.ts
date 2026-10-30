import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { capturarAcao, reenviarAcao } from './apoio/acao'

/**
 * A data do lançamento pago (2026-10-21, decisão do Heitor: "o lançamento de
 * despesa ganha a data"). Era sempre "agora": a conta de luz paga na semana
 * passada, lançada hoje, entrava no caixa de hoje.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let financeiro: MembroDeTeste | null = null
let slug = ''
const diaBR = (dias: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(Date.now() + dias * 86_400_000))

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: financeiro!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`fd${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  financeiro = await criarMembro(`fdf${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Financeiro', permissoes: [{ modulo: 'financial', nivel: 'MANAGE' }],
  })
})
test.afterAll(async () => {
  if (rede) await db().from('financial_transactions').delete().eq('branch_id', rede.branchId)
  await financeiro?.limpar(); await rede?.limpar()
})

test.describe.serial('a data do lançamento pago', () => {
  test('a despesa paga na semana passada entra na data dela', async ({ browser }) => {
    const descricao = `Conta de luz ${marca}`
    const dia = diaBR(-6)
    await como(browser, async p => {
      await p.goto(`/${slug}/financeiro`)
      await p.getByRole('button', { name: 'Novo lançamento' }).click()
      const dialogo = p.locator('dialog[open]').filter({ hasText: 'Novo lançamento' })
      await dialogo.getByRole('button', { name: 'Despesa' }).click()
      await dialogo.getByLabel('Descrição *').fill(descricao)
      await dialogo.getByLabel('Categoria *').selectOption('Aluguel')
      await dialogo.getByLabel('Valor (R$) *').fill('230')
      // Nasce com hoje; a pessoa troca.
      await expect(dialogo.getByLabel('Data do pagamento')).toHaveValue(diaBR(0))
      await dialogo.getByLabel('Data do pagamento').fill(dia)
      const chamada = capturarAcao(p, corpo => corpo.includes(descricao))
      await dialogo.getByRole('button', { name: 'Lançar' }).click()
      await expect(dialogo).toBeHidden()

      // O servidor recusa a data no futuro (a tela já não deixa escolher).
      await reenviarAcao(p, await chamada, [[descricao, `Futuro ${marca}`], [dia, diaBR(3)]])
    })
    expect((await db().from('financial_transactions').select('id').eq('description', `Futuro ${marca}`)).data).toHaveLength(0)
    const { data } = await db().from('financial_transactions').select('paid_at, is_paid').eq('description', descricao).single<{ paid_at: string; is_paid: boolean }>()
    expect(data?.is_paid).toBe(true)
    expect(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(data!.paid_at))).toBe(dia)
  })
})
