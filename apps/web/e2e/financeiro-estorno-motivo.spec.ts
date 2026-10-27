import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'

/**
 * O estorno pede o MOTIVO, guarda e mostra; e o contra-lançamento sai na mesma
 * forma de pagamento da original (A36 da simulação de 2026-10-27).
 *
 * O Rafael estornou R$ 50 em dinheiro: nada perguntou por quê, e a linha do
 * estorno ficou "—" na forma — quem confere a gaveta não sabia que aquele
 * dinheiro saiu do caixa em espécie.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let financeiro: MembroDeTeste | null = null
let slug = ''
let original = ''
const descricao = `[e2e] Peeling ${marca}`

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: financeiro!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`em${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  financeiro = await criarMembro(`emf${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Financeiro', permissoes: [{ modulo: 'financial', nivel: 'MANAGE' }],
  })
  const { data, error } = await db().from('financial_transactions').insert({
    branch_id: rede.branchId, type: 'INCOME', category: 'Serviços', description: descricao,
    amount: 50, payment_method: 'CASH', is_paid: true, paid_at: new Date().toISOString(), created_by: 'e2e',
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  original = data!.id
})
test.afterAll(async () => {
  await db().from('financial_transactions').delete().eq('branch_id', rede!.branchId)
  await financeiro?.limpar(); await rede?.limpar()
})

test.describe.serial('o estorno com motivo', () => {
  test('sem motivo, o servidor recusa', async ({ browser }) => {
    await como(browser, async p => {
      const r = await chamarAcao(p, 'actions/financial.ts', 'reverseTransaction', `/${slug}/financeiro`, [original, slug])
      expect(r.texto).toMatch(/motivo/i)
    })
    const { data } = await db().from('financial_transactions').select('notes').eq('id', original).single<{ notes: string | null }>()
    expect(data!.notes).not.toBe('Estornada')
  })

  test('a tela pede o motivo, o estorno herda a forma, e o motivo aparece', async ({ browser }) => {
    await como(browser, async p => {
      await p.goto(`/${slug}/financeiro`)
      const linha = p.locator('tr').filter({ hasText: descricao }).first()
      await linha.getByTitle('Estornar').click()
      const janela = p.getByRole('dialog', { name: 'Estornar este lançamento?' })
      const confirmar = janela.getByRole('button', { name: 'Confirmar estorno' })
      await expect(confirmar).toBeDisabled()
      await janela.getByLabel('Motivo do estorno').fill('Cliente desistiu do pacote')
      await expect(confirmar).toBeEnabled()
      await confirmar.click()
      await expect(p.getByText('Lançamento estornado.')).toBeVisible()

      await p.reload()
      const doEstorno = p.locator('tr').filter({ hasText: `Estorno: ${descricao}` }).first()
      await expect(doEstorno).toContainText('Dinheiro')
      await expect(doEstorno).toContainText('Cliente desistiu do pacote')
    })
    const { data: contra } = await db().from('financial_transactions')
      .select('payment_method, estorno_motivo').eq('description', `Estorno: ${descricao}`).single<{ payment_method: string | null; estorno_motivo: string | null }>()
    expect(contra).toEqual({ payment_method: 'CASH', estorno_motivo: 'Cliente desistiu do pacote' })
    const { data: orig } = await db().from('financial_transactions')
      .select('notes, estorno_motivo').eq('id', original).single<{ notes: string; estorno_motivo: string | null }>()
    expect(orig).toEqual({ notes: 'Estornada', estorno_motivo: 'Cliente desistiu do pacote' })
  })
})
