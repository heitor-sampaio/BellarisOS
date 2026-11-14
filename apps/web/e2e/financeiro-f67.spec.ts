import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { chamarAcao, chamarAcaoComFormulario } from './apoio/acao-direta'

/**
 * O financeiro da F67 (o levantamento das regras, 2026-11-12):
 * - C39 (H2 = a): o estorno avulso do pagamento de um plano reabre a cobrança
 *   — o pagamento volta a ser "a receber" da mesma venda, com o mesmo vencimento.
 * - C34: a baixa do lançamento sem meio exige a forma.
 * - C35: o Financeiro em "só os meus" não estorna, não lança, não cancela.
 * - C36: cancelar a unidade pré-paga é do Financeiro em Gerenciar (não de quem só recebe).
 * - C33: a baixa é de Recebimentos em todo caminho — o check-in do plano também.
 * - C70: a despesa recorrente grava a forma escolhida.
 *
 * Numa rede [e2e] própria.
 */

test.describe.configure({ mode: 'serial' })

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let dona: MembroDeTeste | null = null
let soOsMeus: MembroDeTeste | null = null
let caixa: MembroDeTeste | null = null
let financeiro: MembroDeTeste | null = null

async function como<T>(browser: Browser, quem: MembroDeTeste, fn: (p: Page) => Promise<T>) {
  const ctx = await browser.newContext({ storageState: quem.estado })
  try { return await fn(await ctx.newPage()) } finally { await ctx.close() }
}

async function ins(tabela: string, linha: Record<string, unknown>) {
  const { data, error } = await db().from(tabela).insert(linha).select('id').single<{ id: string }>()
  expect(error, `criar ${tabela}`).toBeNull()
  return data!.id
}

/** Um plano aceito com R$ 300 pagos no Pix e a sessão de hoje. */
async function planoPago(rotulo: string, vencimento: string | null = null) {
  const cliente = await rede!.criarCliente(`Cliente ${rotulo}`)
  const plano = await ins('treatment_plans', {
    branch_id: rede!.branchId, professional_id: rede!.professionalId, client_id: cliente, status: 'ACCEPTED',
    name: `${PREFIXO} Plano ${rotulo} ${marca}`,
  })
  const pago = await ins('financial_transactions', {
    branch_id: rede!.branchId, client_id: cliente, treatment_plan_id: plano, type: 'INCOME', category: 'Serviços',
    description: 'Plano de tratamento', amount: 300, is_paid: true, paid_at: new Date().toISOString(), payment_method: 'PIX',
    due_date: vencimento, created_by: 'e2e',
  })
  const appt = await ins('appointments', {
    branch_id: rede!.branchId, client_id: cliente, procedure_id: rede!.procedureId, professional_id: rede!.professionalId,
    scheduled_at: new Date().toISOString(), duration_min: 30, price: 100, status: 'CONFIRMED', treatment_plan_id: plano,
  })
  return { cliente, plano, pago, appt }
}

test.beforeAll(async () => {
  test.setTimeout(150_000)
  rede = await criarOutraRede(`f67f${marca}`)
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  dona = await criarMembro(`f67d${marca}`, { tenant: rede.tenantId, donoDaRede: true, permissoes: [] })
  soOsMeus = await criarMembro(`f67m${marca}`, {
    tenant: rede.tenantId, rotulo: 'Financeiro só os meus',
    permissoes: [{ modulo: 'financial', nivel: 'MANAGE', escopo: 'OWN' }, { modulo: 'clients', nivel: 'VIEW' }],
  })
  caixa = await criarMembro(`f67c${marca}`, {
    tenant: rede.tenantId, rotulo: 'Recepção',
    permissoes: [{ modulo: 'cashier', nivel: 'MANAGE' }, { modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'VIEW' }],
  })
  financeiro = await criarMembro(`f67g${marca}`, {
    tenant: rede.tenantId, rotulo: 'Financeiro',
    permissoes: [{ modulo: 'financial', nivel: 'MANAGE' }, { modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'VIEW' }],
  })
})

test.afterAll(async () => {
  for (const m of [financeiro, caixa, soOsMeus, dona]) await m?.limpar()
  await rede?.limpar()
})

test('C39: estornar o pagamento do plano reabre a cobrança, com o mesmo vencimento', async ({ browser }) => {
  const venc = new Date(Date.now() - 2 * 86_400_000).toISOString()
  const { plano, pago } = await planoPago('Reabre', venc)
  const r = await como(browser, dona!, p => chamarAcao(p, 'actions/financial.ts', 'reverseTransaction', '/admin/financeiro',
    [pago, '', 'Forma errada', null]))
  expect(r.texto).toContain('"success":true')
  const { data } = await db().from('financial_transactions').select('amount, is_paid, due_date, notes, type')
    .eq('treatment_plan_id', plano).eq('type', 'INCOME').gt('amount', 0)
  const vivos = (data ?? []).filter(t => t.notes !== 'Estornada')
  expect(vivos.map(t => `${Number(t.amount)}:${t.is_paid}`), 'o pagamento volta a ser a receber').toEqual(['300:false'])
  expect(new Date(vivos[0]!.due_date as string).toISOString(), 'com o mesmo vencimento').toBe(venc)
})

test('C34: a baixa da parcela sem meio exige a forma', async ({ browser }) => {
  const { cliente, plano } = await planoPago('Baixa')
  const parcela = await ins('financial_transactions', {
    branch_id: rede!.branchId, client_id: cliente, treatment_plan_id: plano, type: 'INCOME', category: 'Serviços',
    description: 'Plano de tratamento — parcela 1/1', amount: 50, is_paid: false, due_date: new Date().toISOString(), created_by: 'e2e',
  })
  const sem = await como(browser, caixa!, p => chamarAcao(p, 'actions/financial.ts', 'markTransactionPaid', '/admin/financeiro',
    [parcela, '', null, null, null]))
  expect(sem.texto).toContain('Escolha a forma de pagamento')
  expect((await db().from('financial_transactions').select('is_paid').eq('id', parcela).single()).data?.is_paid).toBe(false)
})

test('C35: o Financeiro em "só os meus" não estorna pela action', async ({ browser }) => {
  const { pago } = await planoPago('SoOsMeus')
  const r = await como(browser, soOsMeus!, p => chamarAcao(p, 'actions/financial.ts', 'reverseTransaction', '/admin/financeiro/comissoes',
    [pago, '', 'Teste', null]))
  expect(r.texto).toContain('só os meus')
  expect((await db().from('financial_transactions').select('notes').eq('id', pago).single()).data?.notes).toBeNull()
})

test('C36: quem só recebe não cancela a unidade pré-paga', async ({ browser }) => {
  const r = await como(browser, caixa!, p => chamarAcao(p, 'actions/pre-pago.ts', 'cancelarUnidadePrePaga', '/admin/clients',
    [crypto.randomUUID(), { motivo: 'teste', destino: 'ESTORNO' }]))
  expect(r.texto).toContain('Seu cargo não libera esta ação.')
})

test('C33: o check-in do plano é de Recebimentos — o Financeiro em Gerenciar sem o caixa não recebe', async ({ browser }) => {
  const { cliente, plano, appt } = await planoPago('Checkin')
  await ins('financial_transactions', {
    branch_id: rede!.branchId, client_id: cliente, treatment_plan_id: plano, type: 'INCOME', category: 'Serviços',
    description: 'Plano de tratamento', amount: 200, is_paid: false, created_by: 'e2e',
  })
  const rota = `/admin/agenda/${appt}`
  const r = await como(browser, financeiro!, p => chamarAcao(p, 'actions/treatment-plans.ts', 'receberDoPlano', rota,
    [plano, { forma: 'AVISTA', metodo: 'PIX' }, appt, '']))
  expect(r.texto).toContain('Seu cargo não libera esta ação.')
  // E a lista do Financeiro da rede não mostra a baixa a quem não tem Recebimentos.
  await como(browser, financeiro!, async p => {
    await p.goto('/admin/financeiro?aba=a-receber#movimentacoes')
    await expect(p.locator('[data-so-o-em-aberto]')).toContainText('Dar baixa é de quem tem Recebimentos (o caixa) no cargo.')
    await expect(p.getByRole('button', { name: /Pagar|Receber/ }).filter({ hasText: /^(Pagar|Receber)$/ })).toHaveCount(0)
  })
})

test('D8 da 13ª: com a unidade filtrada, o "Débito no período" é o da unidade', async ({ browser }) => {
  const { data: b, error } = await db().from('branches').insert({ tenant_id: rede!.tenantId, name: `${PREFIXO} Unidade B ${marca}`, slug: `e2e-f67b-${marca}` })
    .select('id').single<{ id: string }>()
  expect(error).toBeNull()
  const cliente = await rede!.criarCliente('Cliente Debito')
  await ins('financial_transactions', {
    branch_id: rede!.branchId, client_id: cliente, type: 'INCOME', category: 'Serviços', description: 'Atendimento no débito',
    amount: 150, is_paid: true, paid_at: new Date().toISOString(), payment_method: 'DEBIT_CARD', created_by: 'e2e',
  })
  await como(browser, dona!, async p => {
    await p.goto('/admin/financeiro?period=month')
    await expect(p.locator('[data-debito-no-periodo]').first()).toContainText('R$ 150,00')
    await p.goto(`/admin/financeiro?period=month&unidade=${b!.id}`)
    await expect(p.locator('[data-debito-no-periodo]').first()).not.toContainText('R$ 150,00')
  })
})

test('C70 (D11): a despesa recorrente grava a forma escolhida em cada vencimento', async ({ browser }) => {
  const desc = `${PREFIXO} Aluguel ${marca}`
  const r = await como(browser, dona!, p => chamarAcaoComFormulario(p, 'actions/financial.ts', 'createTransactionAdvanced', '/admin/financeiro', [null], {
    _branchId: rede!.branchId, _slug: '', type: 'EXPENSE', category: 'Aluguel', description: desc, amount: '100',
    payment_method: 'BOLETO', schedule_mode: 'recurring', recurring_freq: 'monthly', recurring_count: '2', first_due_date: '2026-12-10',
  }))
  expect(r.texto).toContain('"success":true')
  const { data } = await db().from('financial_transactions').select('payment_method').eq('branch_id', rede!.branchId).like('description', `${desc}%`)
  expect((data ?? []).map(t => t.payment_method)).toEqual(['BOLETO', 'BOLETO'])
})
