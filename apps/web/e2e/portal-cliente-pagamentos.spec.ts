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
let comDesconto = ''

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

  // D8: a Toxina de R$ 1.200 paga com R$ 100 de desconto (R$ 1.100 no crédito).
  const { data: ag2, error: eA2 } = await db().from('appointments').insert({
    branch_id: rede.branchId, client_id: cliente.clientId, procedure_id: rede.procedureId, professional_id: rede.professionalId,
    status: 'COMPLETED', source: 'INTERNAL', duration_min: 30, price: 1200,
    scheduled_at: new Date(Date.now() - 26 * 3600_000).toISOString(), started_at: new Date(Date.now() - 26 * 3600_000).toISOString(),
    completed_at: new Date(Date.now() - 25 * 3600_000).toISOString(),
  }).select('id').single<{ id: string }>()
  expect(eA2).toBeNull()
  comDesconto = ag2!.id
  const { data: tx, error: eTx } = await db().from('financial_transactions').insert({
    branch_id: rede.branchId, client_id: cliente.clientId, appointment_id: comDesconto, type: 'INCOME', category: 'Serviços',
    description: `${PREFIXO} Toxina ${marca}`, amount: 1100, sale_discount: 100, is_paid: true, paid_at: new Date().toISOString(),
    payment_method: 'PIX', created_by: 'e2e',
  }).select('id').single<{ id: string }>()
  expect(eTx).toBeNull()
  lancamentos.push(tx!.id)
})

test.afterAll(async () => {
  if (lancamentos.length) await db().from('financial_transactions').delete().in('id', lancamentos)
  for (const a of [atendimento, comDesconto].filter(Boolean)) {
    await db().from('domain_events').delete().eq('entidade_id', a)
    await db().from('appointments').delete().eq('id', a)
  }
  await cliente?.limpar(); await rede?.limpar()
})

// D8 da 7ª simulação: a Agenda do app mostrava a Toxina a R$ 1.200 (o preço de
// tabela) e Pagamentos, R$ 1.100 — o desconto mora no lançamento.
test('a Agenda do app mostra o valor cobrado no atendimento pago com desconto (D8)', async ({ browser }) => {
  await como(browser, async p => {
    await p.goto(`/${slug}/cliente/agendamentos`)
    const cartao = p.locator(`a[href$="/cliente/agendamentos/${comDesconto}"]`)
    await expect(cartao).toContainText(/R\$\s1\.100,00/)
    await expect(cartao).toContainText(/desconto de R\$\s100,00/)
    await expect(cartao).not.toContainText(/R\$\s1\.200,00/)
  })
})

// D7 da 39ª (AG-56): o Financeiro e o Histórico → Pagamentos diziam só o valor pago,
// sem o desconto — ele mora no lançamento (sale_discount, desconto_motivo).
test('o Financeiro e os Pagamentos do app dizem o desconto do que ela pagou (AG-56)', async ({ browser }) => {
  await como(browser, async p => {
    await p.goto(`/${slug}/cliente/financeiro`)
    // O único lançamento com desconto desta cliente é o da Toxina (R$ 1.100 pagos).
    await expect(p.locator('[data-desconto-do-lancamento]')).toHaveText(/Desconto R\$\s100,00/)

    await p.goto(`/${slug}/cliente/historico`)
    await p.getByRole('button', { name: /Pagamentos/ }).click()
    const pagamento = p.locator('[data-pagamento]', { hasText: /R\$\s1\.100,00/ })
    await expect(pagamento.locator('[data-desconto-do-lancamento]')).toHaveText(/Desconto R\$\s100,00/)
  })
})

// D4 da 7ª simulação: o Financeiro do app mostrava as parcelas com a data de
// CRIAÇÃO (todas 05/11), na ordem 3/3, 2/3, 1/3 — não lia o vencimento.
test('o Financeiro do app diz "Vence dd/mm" no pendente e ordena pelo vencimento (D4)', async ({ browser }) => {
  await como(browser, async p => {
    await p.goto(`/${slug}/cliente/financeiro`)
    await expect(p.getByText(/Vence 01\/12\/2030/), 'o vencimento, não a criação').toBeVisible()
    const vencimentos = (await p.getByText(/Vence \d\d\/\d\d\/\d{4}/).allTextContents())
      .map(t => /Vence (\d\d\/\d\d\/\d{4})/.exec(t)?.[1])
    expect(vencimentos, 'a próxima a vencer primeiro').toEqual(['01/12/2030', '01/01/2031'])
  })
})

test('as parcelas dizem o vencimento, e o atendimento concluído não pago aparece a pagar', async ({ browser }) => {
  await como(browser, async p => {
    await p.goto(`/${slug}/cliente/historico`)
    await p.getByRole('button', { name: /Pagamentos/ }).click()
    const parcela1 = p.locator('[data-pagamento]', { hasText: 'Parcela 1 de 2' })
    await expect(parcela1).toContainText('vence em 01/12/2030')
    await expect(p.locator('[data-pagamento]', { hasText: 'Parcela 2 de 2' })).toContainText('vence em 01/01/2031')

    const aPagar = p.locator('[data-pagamento]', { hasText: `Laser ${marca}` }).filter({ hasText: 'A pagar na unidade' })
    await expect(aPagar).toContainText('R$ 650,00')
    await expect(aPagar).toContainText('A pagar na unidade')
  })
})

// D17 da 8ª simulação: o Histórico → Pagamentos ordenava pela CRIAÇÃO e listava
// a parcela 2/2 antes da 1/2 — o Financeiro do app já ordenava pelo vencimento (D4).
test('o Histórico → Pagamentos ordena pelo vencimento, como o Financeiro do app (D17)', async ({ browser }) => {
  await como(browser, async p => {
    await p.goto(`/${slug}/cliente/historico`)
    await p.getByRole('button', { name: /Pagamentos/ }).click()
    await expect(p.locator('[data-pagamento]', { hasText: 'Parcela 1 de 2' })).toBeVisible()
    const ordem = (await p.locator('[data-pagamento]').allTextContents())
      .map(t => /Parcela (\d) de 2/.exec(t)?.[1]).filter(Boolean)
    expect(ordem, 'a próxima a vencer primeiro').toEqual(['1', '2'])
  })
})

// D8 da 36ª (CR-07): a parcela paga em duas formas aparecia em duas linhas no
// Financeiro e no Histórico do app (a equipe já as juntava); o recibo segue por
// forma. A4 da 36ª (princípio 3): o a receber sem data dizia a data de criação
// ("Vence" no dia em que nasceu) — diz "Sem vencimento".
test('a parcela em duas formas é uma linha, e o a receber sem data diz "Sem vencimento" (D8 e A4 da 36ª)', async ({ browser }) => {
  const criada = new Date(Date.now() - 2 * 86_400_000).toISOString()
  const pagaEm = new Date(Date.now() - 86_400_000).toISOString()
  const parcela = {
    branch_id: rede!.branchId, client_id: cliente!.clientId, type: 'INCOME', category: 'Serviços',
    description: `${PREFIXO} Duas formas ${marca} — parcela 1/3`, is_paid: true, paid_at: pagaEm, created_at: criada,
    parcela_numero: 1, parcela_total: 3, created_by: 'e2e',
  }
  const { data, error } = await db().from('financial_transactions').insert([
    { ...parcela, amount: 400, payment_method: 'PIX' },
    { ...parcela, amount: 200, payment_method: 'CASH' },
    { branch_id: rede!.branchId, client_id: cliente!.clientId, type: 'INCOME', category: 'Serviços',
      description: `${PREFIXO} Sem data ${marca}`, amount: 300, is_paid: false, payment_method: null, due_date: null,
      created_at: criada, created_by: 'e2e' },
  ]).select('id, payment_method')
  expect(error, 'lançar as duas formas e o a receber sem data').toBeNull()
  lancamentos.push(...(data ?? []).map(l => l.id as string))
  const pix = data!.find(l => l.payment_method === 'PIX')!.id as string
  const dinheiro = data!.find(l => l.payment_method === 'CASH')!.id as string
  const diaDaCriacao = new Date(criada).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })

  await como(browser, async p => {
    await p.goto(`/${slug}/cliente/financeiro`)
    const duas = p.locator('.card', { hasText: `Duas formas ${marca}` })
    await expect(duas, 'uma linha só').toHaveCount(1)
    await expect(duas).toContainText(/Pix R\$\s400,00 \+ Dinheiro R\$\s200,00/)
    await expect(duas).toContainText(/R\$\s600,00/)
    await expect(duas.getByRole('link', { name: 'Recibo (Pix)' })).toHaveAttribute('href', `/api/recibos/${pix}`)
    await expect(duas.getByRole('link', { name: 'Recibo (Dinheiro)' })).toHaveAttribute('href', `/api/recibos/${dinheiro}`)
    const semData = p.locator('.card', { hasText: `Sem data ${marca}` })
    await expect(semData).toContainText('Sem vencimento')
    await expect(semData).not.toContainText(diaDaCriacao)
    await expect(semData).toContainText('Pendente')

    await p.goto(`/${slug}/cliente/historico`)
    await p.getByRole('button', { name: /Pagamentos/ }).click()
    const naLista = p.locator('[data-pagamento]', { hasText: `Duas formas ${marca}` })
    await expect(naLista, 'uma linha só').toHaveCount(1)
    await expect(naLista).toContainText(/Pix R\$\s400,00 \+ Dinheiro R\$\s200,00/)
    await expect(naLista.locator('[data-recibo]')).toHaveCount(2)
    const semDataNoHistorico = p.locator('[data-pagamento]', { hasText: `Sem data ${marca}` })
    await expect(semDataNoHistorico).toContainText('Sem vencimento')
    await expect(semDataNoHistorico).not.toContainText(diaDaCriacao)
  })
})
