import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { clienteComSessao, type ClienteDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * A64 da 5ª simulação (Histórico → Pagamentos do app):
 * - as parcelas apareciam "Pendente" sem vencimento — nenhum código do portal
 *   lia o vencimento;
 * - os R$ 650 do laser avulso concluído e não pago não apareciam.
 */

const marca = `pg${Date.now().toString(36)}`
const db = () => banco()
let rede: OutraRede | null = null
let slug = ''
let cliente: ClienteDeTeste | null = null
const lancamentos: string[] = []
let atendimento = ''

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: cliente!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(marca)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  cliente = await clienteComSessao(`c${marca}`, { id: rede.branchId, slug }, { tenant: rede.tenantId })

  // Duas parcelas do crediário, a vencer em 01/12/2030 e 01/01/2031.
  for (const [n, venc] of [[1, '2030-12-01'], [2, '2031-01-01']] as const) {
    const { data, error } = await db().from('financial_transactions').insert({
      branch_id: rede.branchId, client_id: cliente.clientId, type: 'INCOME', category: 'Serviços',
      description: `${PREFIXO} Crediário ${marca}`, amount: 1000, is_paid: false, payment_method: 'PIX',
      due_date: venc, parcela_numero: n, parcela_total: 2, created_by: 'e2e',
    }).select('id').single<{ id: string }>()
    expect(error, `lançar a parcela ${n}`).toBeNull()
    lancamentos.push(data!.id)
  }

  // O avulso concluído sem pagamento (o laser de R$ 650).
  expect((await db().from('procedures').update({ price: 650, name: `${PREFIXO} Laser ${marca}` }).eq('id', rede.procedureId)).error).toBeNull()
  const { data: ag, error: eA } = await db().from('appointments').insert({
    branch_id: rede.branchId, client_id: cliente.clientId, procedure_id: rede.procedureId, professional_id: rede.professionalId,
    status: 'COMPLETED', source: 'INTERNAL', duration_min: 30, price: 650,
    scheduled_at: new Date(Date.now() - 3 * 3600_000).toISOString(), started_at: new Date(Date.now() - 3 * 3600_000).toISOString(),
    completed_at: new Date(Date.now() - 2 * 3600_000).toISOString(),
  }).select('id').single<{ id: string }>()
  expect(eA, 'o atendimento concluído').toBeNull()
  atendimento = ag!.id
})

test.afterAll(async () => {
  if (lancamentos.length) await db().from('financial_transactions').delete().in('id', lancamentos)
  if (atendimento) {
    await db().from('domain_events').delete().eq('entidade_id', atendimento)
    await db().from('appointments').delete().eq('id', atendimento)
  }
  await cliente?.limpar(); await rede?.limpar()
})

test('as parcelas dizem o vencimento, e o atendimento concluído não pago aparece a pagar', async ({ browser }) => {
  await como(browser, async p => {
    await p.goto(`/${slug}/cliente/historico`)
    await p.getByRole('button', { name: /Pagamentos/ }).click()
    const parcela1 = p.locator('[data-pagamento]', { hasText: 'Parcela 1 de 2' })
    await expect(parcela1).toContainText('vence em 01/12/2030')
    await expect(p.locator('[data-pagamento]', { hasText: 'Parcela 2 de 2' })).toContainText('vence em 01/01/2031')

    const aPagar = p.locator('[data-pagamento]', { hasText: `Laser ${marca}` })
    await expect(aPagar).toContainText('R$ 650,00')
    await expect(aPagar).toContainText('A pagar na clínica')
  })
})
