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
 * - C35: o Financeiro em "só os meus" não estorna, não lança, não cancela. Sem o
 *   "só os meus" (SM1/SM2, o Heitor, 2026-11-23), quem atende sem o Financeiro
 *   tem só a vista pessoal (as Minhas comissões), que só MOSTRA.
 * - C36: cancelar a unidade pré-paga é do Financeiro em Gerenciar (não de quem só recebe).
 * - C33: o check-in do plano (o balcão) é do PDV. A baixa NO FINANCEIRO, desde
 *   o CX2 (aprovado pelo Heitor em 13/11, "Blz pode ser assim": o Financeiro
 *   "dá baixa só no que entra sem passar pelo balcão"), é também do Financeiro
 *   em Gerenciar — até ali o teste travava "só o PDV".
 * - C70: a despesa recorrente grava a forma escolhida.
 *
 * Numa rede [e2e] própria.
 */

test.describe.configure({ mode: 'serial' })

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let dona: MembroDeTeste | null = null
let pessoal: MembroDeTeste | null = null
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
  // A vista pessoal (SM2): atende e não tem o Financeiro.
  pessoal = await criarMembro(`f67m${marca}`, {
    tenant: rede.tenantId, rotulo: 'Atende sem o Financeiro',
    permissoes: [{ modulo: 'clients', nivel: 'VIEW' }], atendeEm: [rede.branchId],
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
  for (const m of [financeiro, caixa, pessoal, dona]) await m?.limpar()
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

test('C35: quem atende sem o Financeiro (a vista pessoal) não estorna pela action', async ({ browser }) => {
  const { pago } = await planoPago('SoOsMeus')
  const r = await como(browser, pessoal!, p => chamarAcao(p, 'actions/financial.ts', 'reverseTransaction', '/admin/financeiro/comissoes',
    [pago, '', 'Teste', null]))
  expect(r.texto).toContain('Você não tem acesso a esta ação.')
  expect((await db().from('financial_transactions').select('notes').eq('id', pago).single()).data?.notes).toBeNull()
})

test('C36: quem só recebe não cancela a unidade pré-paga', async ({ browser }) => {
  // Posta na FICHA, que é quem usa a action (os procedimentos pagos): na lista
  // de clientes ela só existia se outra spec já tivesse compilado a ficha.
  const cliente = await rede!.criarCliente('Cliente C36')
  const r = await como(browser, caixa!, p => chamarAcao(p, 'actions/pre-pago.ts', 'cancelarUnidadePrePaga', `/admin/clients/${cliente}`,
    [crypto.randomUUID(), { motivo: 'teste', destino: 'ESTORNO' }]))
  expect(r.texto).toContain('Você não tem acesso a esta ação.')
})

// VF-04 da varredura de 18/11 (era o C33, que travava no PDV): o check-in do
// plano recebe por `podeReceber` — o PDV OU o Financeiro em Gerenciar, como
// todo recebimento (vendas-financeiro.md, "Quem recebe é `podeReceber`"). A
// faixa do plano em aberto já aparecia a quem tem o Financeiro, e a action recusava.
test('VF-04: o check-in do plano é de quem recebe — o Financeiro em Gerenciar recebe; sem o PDV nem o Financeiro, não', async ({ browser }) => {
  const { cliente, plano, appt } = await planoPago('Checkin')
  const aberto = await ins('financial_transactions', {
    branch_id: rede!.branchId, client_id: cliente, treatment_plan_id: plano, type: 'INCOME', category: 'Serviços',
    description: 'Plano de tratamento', amount: 200, is_paid: false, created_by: 'e2e',
  })
  const rota = `/admin/agenda/${appt}`
  const semReceber = await criarMembro(`f67s${marca}`, {
    tenant: rede!.tenantId, rotulo: 'Agenda',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'VIEW' }],
  })
  try {
    const recusa = await como(browser, semReceber, p => chamarAcao(p, 'actions/treatment-plans.ts', 'receberDoPlano', rota,
      [plano, { forma: 'AVISTA', metodo: 'PIX' }, appt, '']))
    expect(recusa.texto).toContain('Você não tem acesso a esta ação.')
    expect((await db().from('financial_transactions').select('is_paid').eq('id', aberto).single<{ is_paid: boolean }>()).data!.is_paid).toBe(false)
  } finally { await semReceber.limpar() }
  const r = await como(browser, financeiro!, p => chamarAcao(p, 'actions/treatment-plans.ts', 'receberDoPlano', rota,
    [plano, { forma: 'AVISTA', metodo: 'PIX' }, appt, '']))
  expect(r.texto).not.toContain('Você não tem acesso a esta ação.')
  const { data: pago } = await db().from('financial_transactions').select('is_paid, payment_method').eq('id', aberto).single<{ is_paid: boolean; payment_method: string }>()
  expect(pago).toEqual({ is_paid: true, payment_method: 'PIX' })
})

test('CX2: o Financeiro em Gerenciar dá baixa no Financeiro (o que entrou sem passar pelo balcão); a vista pessoal não', async ({ browser }) => {
  const { cliente, plano } = await planoPago('Transferencia')
  const desc = `${PREFIXO} Transferência ${marca}`
  const aberto = await ins('financial_transactions', {
    branch_id: rede!.branchId, client_id: cliente, treatment_plan_id: plano, type: 'INCOME', category: 'Serviços',
    description: desc, amount: 120, is_paid: false, due_date: new Date().toISOString(), created_by: 'e2e',
  })
  // A lista do Financeiro mostra o "Receber" a quem tem o Financeiro em Gerenciar, sem o PDV.
  await como(browser, financeiro!, async p => {
    await p.goto('/admin/financeiro?aba=a-receber#movimentacoes')
    await p.getByRole('button', { name: 'Sobre as contas a receber' }).hover()
    await expect(p.locator('[data-so-o-em-aberto]')).toContainText('Para receber, use “Receber” na linha.')
    await expect(p.locator(`[data-lancamento="${aberto}"]`).getByRole('button', { name: 'Receber', exact: true })).toBeVisible()
  })
  // A vista pessoal (sem o Financeiro) não dá baixa (C35, SM2), nem pela action.
  const negado = await como(browser, pessoal!, p => chamarAcao(p, 'actions/financial.ts', 'markTransactionPaid', '/admin/financeiro/comissoes',
    [aberto, '', null, null, 'PIX']))
  expect(negado.texto).not.toContain('"success":true')
  expect((await db().from('financial_transactions').select('is_paid').eq('id', aberto).single()).data?.is_paid).toBe(false)
  // E a baixa do Financeiro em Gerenciar grava, com a forma (PDV8).
  const r = await como(browser, financeiro!, p => chamarAcao(p, 'actions/financial.ts', 'markTransactionPaid', '/admin/financeiro',
    [aberto, '', null, null, 'PIX']))
  expect(r.texto).toContain('"success":true')
  expect((await db().from('financial_transactions').select('is_paid, payment_method, recebido_por').eq('id', aberto).single()).data)
    .toEqual({ is_paid: true, payment_method: 'PIX', recebido_por: financeiro!.userId })
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
    // O débito do período mora na dica do cartão da operadora (2026-11-16).
    await p.locator('[data-kpi="a-receber-operadora"] [data-dica-botao]').hover()
    await expect(p.locator('[data-debito-no-periodo]').first()).toContainText('R$ 150,00')
    await p.goto(`/admin/financeiro?period=month&unidade=${b!.id}`)
    await p.locator('[data-kpi="a-receber-operadora"] [data-dica-botao]').hover()
    await expect(p.locator('[data-debito-no-periodo]').first()).toBeVisible()
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
