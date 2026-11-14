import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'

/**
 * Os atritos do caixa e do financeiro da 11ª simulação (2026-11-10, a Azaleia:
 * a Elaine e a Fabiana no caixa, a Marta no fim do dia), numa rede [e2e] própria:
 *
 * - A40: o Fechamento do dia não separava por quem recebeu — com duas
 *   recepcionistas, cada uma precisa saber o que entrega.
 * - A36: depois do estorno parcial, a linha da venda dizia só "110,00": quem
 *   lia não via que a cliente tinha pago R$ 1.100 (princípio 3: "R$ 1.100,00,
 *   R$ 990,00 estornados"; a regra r2-ven-05 não muda).
 * - A37: o uso do crédito interno aparecia como "Receita · Pago", sem dizer
 *   que não é receita (o caixa foi na venda do crédito).
 * - A38: o "A receber da operadora" não mostrava o débito nem dizia que ele
 *   conta como recebido no dia.
 */

test.setTimeout(180_000)

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede
let slug = ''
let dona: MembroDeTeste
let elaine: MembroDeTeste
let fabiana: MembroDeTeste
let rosana = ''
const n = (v: unknown) => Number(v ?? 0)

async function como(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado, viewport: { width: 1440, height: 900 } })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

const caixa = (modulos: { modulo: 'cashier' | 'clients' | 'financial'; nivel: 'VIEW' | 'MANAGE' }[]) => modulos

test.beforeAll(async ({ browser }) => {
  rede = await criarOutraRede(`fin11${marca}`)
  const b = db()
  expect((await b.from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  slug = (await b.from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  dona = await criarMembro(`fin11d${marca}`, { tenant: rede.tenantId, donoDaRede: true, rotulo: 'Dona', permissoes: [] })
  const permissoes = caixa([{ modulo: 'cashier', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'financial', nivel: 'VIEW' }])
  elaine = await criarMembro(`fin11e${marca}`, { tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Elaine', permissoes })
  fabiana = await criarMembro(`fin11f${marca}`, { tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Fabiana', permissoes })
  rosana = await rede.criarCliente('Rosana')
  // As duas vendas do dia: R$ 100 no Pix pela Elaine, R$ 50 em dinheiro pela Fabiana.
  const rota = `/${slug}/pdv`
  await como(browser, elaine, async p => {
    const r = await chamarAcao(p, 'actions/credito-na-clinica.ts', 'venderCredito', rota, [rosana, rede.branchId, '100', { forma: 'AVISTA', metodo: 'PIX' }, null])
    expect(r.texto).toContain('vendaId')
  })
  await como(browser, fabiana, async p => {
    const r = await chamarAcao(p, 'actions/credito-na-clinica.ts', 'venderCredito', rota, [rosana, rede.branchId, '50', { forma: 'AVISTA', metodo: 'CASH' }, null])
    expect(r.texto).toContain('vendaId')
  })
})

test.afterAll(async () => {
  await dona?.limpar(); await elaine?.limpar(); await fabiana?.limpar()
  await rede?.limpar()
})

const lancamentoDoCredito = async (valor: number) => {
  const { data, error } = await db().from('financial_transactions').select('id, amount')
    .eq('client_id', rosana).not('credito_vendido_id', 'is', null).eq('created_by', valor === 100 ? elaine.userId : fabiana.userId)
    .order('created_at').limit(1).maybeSingle<{ id: string; amount: number }>()
  expect(error).toBeNull()
  return data!
}

test('A40: o Fechamento do dia separa o que cada pessoa recebeu, por forma', async ({ browser }) => {
  // A parcela do crediário lançada pela Elaine e RECEBIDA pela Fabiana: é dela.
  const { data: parcela, error } = await db().from('financial_transactions').insert({
    branch_id: rede.branchId, client_id: rosana, type: 'INCOME', category: 'Serviços', description: 'Parcela 2/2 [e2e]',
    amount: 30, is_paid: false, created_by: elaine.userId,
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  await como(browser, fabiana, async p => {
    const r = await chamarAcao(p, 'actions/financial.ts', 'markTransactionPaid', `/${slug}/financeiro`, [parcela!.id, slug, null, null, 'PIX'])
    expect(r.texto).toContain('success')
  })

  await como(browser, dona, async p => {
    await p.goto(`/${slug}/pdv?fechar=1`)
    // CX5: o quadro mora nos "Detalhes do dia", fechados até a pessoa abrir.
    await p.locator('[data-detalhes-do-dia] summary').click()
    const quadro = p.locator('[data-por-quem-recebeu]')
    await expect(quadro).toBeVisible()
    const daElaine = quadro.locator(`[data-quem-recebeu="${elaine.userId}"]`)
    await expect(daElaine).toContainText('Elaine')
    await expect(daElaine).toContainText(/Pix\s*R\$\s100,00/)
    await expect(daElaine).not.toContainText('30,00')
    const daFabiana = quadro.locator(`[data-quem-recebeu="${fabiana.userId}"]`)
    await expect(daFabiana).toContainText(/Dinheiro\s*R\$\s50,00/)
    await expect(daFabiana).toContainText(/Pix\s*R\$\s30,00/)
    await expect(daFabiana.locator('[data-total-de-quem-recebeu]')).toContainText(/R\$\s80,00/)
  })
  await expect.poll(async () => (await db().from('financial_transactions').select('recebido_por').eq('id', parcela!.id).single<{ recebido_por: string | null }>()).data?.recebido_por).toBe(fabiana.userId)
})

test('A36 e A37: o pagamento estornado em parte diz o que foi pago e o que voltou; o uso do crédito diz que não é receita', async ({ browser }) => {
  // A Rosana usa R$ 120 do crédito (R$ 150): sobram R$ 30, e a venda de R$ 100 da Elaine volta em parte.
  const { data: uso, error } = await db().from('financial_transactions').insert({
    branch_id: rede.branchId, client_id: rosana, type: 'INCOME', category: 'Serviços', description: 'Drenagem paga com crédito [e2e]',
    amount: 120, is_paid: true, paid_at: new Date().toISOString(), payment_method: 'INTERNAL_CREDIT', created_by: dona.userId,
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  const venda = await lancamentoDoCredito(100)
  await como(browser, dona, async p => {
    const r = await chamarAcao(p, 'actions/credito-na-clinica.ts', 'estornarVendaDeCredito', `/${slug}/financeiro`,
      [venda.id, { motivo: 'Desistiu [e2e]', estorno: 'PARCIAL', esperado: 30, novo: null }])
    expect(r.texto).toContain('"volta":30')
  })
  const { data: depois } = await db().from('financial_transactions').select('amount, valor_antes_do_estorno').eq('id', venda.id).single()
  expect(n(depois!.amount)).toBe(70)
  expect(n(depois!.valor_antes_do_estorno)).toBe(100)

  await como(browser, dona, async p => {
    await p.goto(`/${slug}/financeiro?aba=movimentacoes`)
    const linha = p.locator('[data-lancamento]', { hasText: 'Crédito na clínica' }).filter({ hasText: '70,00' }).first()
    await expect(linha.locator('[data-estorno-parcial-do-lancamento]')).toContainText(/Pago\s*R\$\s100,00\s*·\s*R\$\s30,00 estornados/)
    const doUso = p.locator('[data-lancamento]', { hasText: 'Drenagem paga com crédito' }).first()
    await expect(doUso.locator('[data-uso-de-credito]')).toContainText('não é receita')
    await expect(doUso.locator('[data-uso-de-credito]')).toContainText('caixa')
  })
  expect(uso!.id).toBeTruthy()
})

test('A38: o "A receber da operadora" diz o débito do período, que conta como recebido no dia', async ({ browser }) => {
  expect((await db().from('financial_transactions').insert({
    branch_id: rede.branchId, client_id: rosana, type: 'INCOME', category: 'Serviços', description: 'Pacote no débito [e2e]',
    amount: 540, is_paid: true, paid_at: new Date().toISOString(), payment_method: 'DEBIT_CARD', created_by: dona.userId,
  })).error).toBeNull()
  await como(browser, dona, async p => {
    await p.goto(`/${slug}/financeiro`)
    const nota = p.locator('[data-kpi="a-receber-operadora"] [data-debito-no-periodo]')
    await expect(nota).toContainText(/débito/i)
    await expect(nota).toContainText(/R\$\s540,00/)
    await expect(nota).toContainText('recebido no dia')
  })
})
