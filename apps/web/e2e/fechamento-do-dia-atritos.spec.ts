import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * A50 da 5ª simulação: o Fechamento exigia digitar 0 sem dinheiro em espécie
 * no dia, e não avisava que o dia ainda estava aberto — a Luana fechou às
 * 11:48 o dia de uma unidade que atende até as 22h.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede
let recepcao: MembroDeTeste
let slug = ''

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: recepcao.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`fda${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  // A unidade atende o dia inteiro, todo dia: agora ela está sempre aberta.
  const inteiro = [{ de: '00:00', ate: '24:00' }]
  expect((await db().from('branches').update({ horario: { dias: { 0: inteiro, 1: inteiro, 2: inteiro, 3: inteiro, 4: inteiro, 5: inteiro, 6: inteiro } } })
    .eq('id', rede.branchId)).error).toBeNull()
  recepcao = await criarMembro(`fdar${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Recepção', permissoes: [{ modulo: 'cashier', nivel: 'MANAGE' }],
  })
  // Só Pix no dia: nada em espécie.
  const agora = new Date().toISOString()
  expect((await db().from('financial_transactions').insert({
    branch_id: rede.branchId, is_paid: true, paid_at: agora, created_by: 'e2e',
    type: 'INCOME', category: 'Atendimento', description: `Peeling ${marca}`, amount: 250, payment_method: 'PIX',
  })).error).toBeNull()
})
test.afterAll(async () => {
  if (rede) {
    await db().from('fechamentos_do_dia').delete().eq('branch_id', rede.branchId)
    await db().from('financial_transactions').delete().eq('branch_id', rede.branchId)
  }
  await recepcao?.limpar(); await rede?.limpar()
})

test('sem dinheiro em espécie, fecha sem digitar 0; e avisa que o dia ainda está aberto', async ({ browser }) => {
  await como(browser, async p => {
    await p.goto(`/${slug}/fechamento`)
    await expect(p.locator('[data-dia-aberto]')).toContainText('A unidade atende até 24:00')
    await expect(p.locator('[data-dia-aberto]')).toContainText('o dia ainda está aberto')
    await expect(p.getByLabel(/Dinheiro contado/)).toHaveValue('')
    await p.getByRole('button', { name: 'Fechar o dia' }).click()
    await expect.poll(async () => (await db().from('fechamentos_do_dia').select('contado_dinheiro').eq('branch_id', rede.branchId)).data)
      .toEqual([{ contado_dinheiro: 0 }])
  })
})
