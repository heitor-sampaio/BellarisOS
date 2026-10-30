import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * J-49 (simulação de 2026-10-30): o Fechamento do dia não avisava de nada.
 * Quatro avisos, todos com os números do banco:
 * 1. há dinheiro a receber (os atendimentos concluídos sem pagamento);
 * 2. houve movimento DEPOIS do último fechamento (fechar de novo);
 * 3. saiu em dinheiro mais do que entrou (o esperado na gaveta é negativo);
 * 4. uma linha só informativa com as taxas da maquininha do dia (a tabela de
 *    Configurações → Comissões), que não saem do saldo.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let recepcao: MembroDeTeste | null = null
let slug = ''
let cliente = ''
let atendimento = ''

async function como(m: MembroDeTeste, browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}
const lancar = async (linhas: Record<string, unknown>[]) => {
  const agora = new Date().toISOString()
  const { error } = await db().from('financial_transactions').insert(linhas.map(l => ({
    branch_id: rede!.branchId, is_paid: true, paid_at: agora, created_by: 'e2e', category: 'Atendimento', ...l,
  })))
  expect(error).toBeNull()
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`fav${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  recepcao = await criarMembro(`favr${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Recepção', permissoes: [{ modulo: 'cashier', nivel: 'MANAGE' }],
  })
  // A taxa do Pix e do crédito em 3x (Configurações → Comissões).
  expect((await db().rpc('comissao_taxas_definir', { p_tenant: rede.tenantId, p_taxas: [
    { metodo: 'PIX', parcelas: 1, taxa_pct: 1 }, { metodo: 'CREDIT_CARD', parcelas: 3, taxa_pct: 5 },
  ] })).error).toBeNull()
  // O dia: R$ 200 no Pix (taxa R$ 2), R$ 300 no crédito 3x (taxa R$ 15), e
  // R$ 50 de despesa paga em dinheiro sem nenhuma entrada em dinheiro.
  await lancar([
    { type: 'INCOME', description: `Peeling ${marca}`, amount: 200, payment_method: 'PIX' },
    { type: 'INCOME', description: `Laser ${marca}`, amount: 300, payment_method: 'CREDIT_CARD', cartao_vezes: 3 },
    { type: 'EXPENSE', category: 'Fornecedores', description: `Café ${marca}`, amount: 50, payment_method: 'CASH' },
  ])
  // Um atendimento concluído e não pago: R$ 180 a receber.
  cliente = await rede.criarCliente('A receber')
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede.branchId, client_id: cliente, professional_id: rede.professionalId, procedure_id: rede.procedureId,
    scheduled_at: new Date().toISOString(), duration_min: 30, price: 180, status: 'COMPLETED', source: 'INTERNAL',
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  atendimento = data!.id
})

test.afterAll(async () => {
  if (rede) {
    await db().from('fechamentos_do_dia').delete().eq('branch_id', rede.branchId)
    await db().from('financial_transactions').delete().eq('branch_id', rede.branchId)
    await db().from('payment_fees').delete().eq('tenant_id', rede.tenantId)
    if (atendimento) await db().from('appointments').delete().eq('id', atendimento)
  }
  await recepcao?.limpar(); await rede?.limpar()
})

test.describe.serial('os avisos do fechamento do dia', () => {
  test('a receber, dinheiro a mais saindo e as taxas; depois de fechar, o movimento novo', async ({ browser }) => {
    await como(recepcao!, browser, async p => {
      await p.goto(`/${slug}/fechamento`)
      const avisos = p.locator('[data-avisos-do-fechamento]')
      await expect(avisos.locator('[data-aviso="a-receber"]')).toContainText('R$ 180,00 a receber')
      await expect(avisos.locator('[data-aviso="dinheiro-negativo"]')).toContainText('Saiu mais dinheiro em espécie do que entrou')
      await expect(avisos.locator('[data-aviso="dinheiro-negativo"]')).toContainText('R$ 50,00')
      // Informativo: R$ 2 do Pix + R$ 15 do crédito 3x.
      await expect(p.locator('[data-taxas-do-dia]')).toContainText('Taxas da maquininha no dia (estimadas): R$ 17,00')
      await expect(avisos.locator('[data-aviso="movimento-depois"]')).toHaveCount(0)

      await p.getByLabel('Dinheiro contado (R$)').fill('0')
      await p.getByRole('button', { name: 'Fechar o dia' }).click()
      await expect(p.getByText(/Fechado por/)).toBeVisible()
      await expect(avisos.locator('[data-aviso="movimento-depois"]')).toHaveCount(0)
    })

    // Um recebimento depois do fechamento.
    await lancar([{ type: 'INCOME', description: `Depois ${marca}`, amount: 80, payment_method: 'CASH' }])
    await como(recepcao!, browser, async p => {
      await p.goto(`/${slug}/fechamento`)
      await expect(p.locator('[data-aviso="movimento-depois"]')).toContainText('1 lançamento depois do fechamento')
    })
  })
})
