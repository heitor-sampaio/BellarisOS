import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { abrirVendaNoPdv } from './apoio/vender'
import { chamarAcao } from './apoio/acao-direta'

/**
 * Decisão 1 do Heitor sobre a 9ª simulação (2026-11-07, "concordo"): vender
 * crédito na clínica em dinheiro — o "vale". A Rosana pagou R$ 300 no Pix para
 * usar depois em qualquer coisa, e a recepção só achou o "Conceder crédito"
 * (fora do caixa): os R$ 300 não entraram no caixa, no fechamento nem no
 * faturamento.
 *
 * - "Crédito na clínica" no Vender (desde o PDV7, 2026-11-13, a aba "Crédito
 *   na rede" da venda no PDV), para quem recebe, com a forma de pagamento;
 * - entra no caixa, no fechamento e no faturamento no dia do dinheiro
 *   (princípio 5), e o uso depois não é receita de novo;
 * - os pontos saem na VENDA, pelo dinheiro pago, e não no uso;
 * - sem comissão de venda;
 * - estornável: o saldo que ela ainda não usou volta (o usado fica pago).
 *
 * Numa rede [e2e] própria, de uma unidade, com a fidelidade POR PROCEDIMENTO
 * (o crédito pontua pelo dinheiro mesmo assim: é o que a decisão diz).
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let slug = ''
let dona: MembroDeTeste | null = null
let recepcao: MembroDeTeste | null = null
let soVe: MembroDeTeste | null = null
let rosana = ''
let cartao = ''
const n = (v: unknown) => Number(v ?? 0)

async function como(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

const saldoDe = async (cliente: string) => {
  const { data, error } = await db().from('internal_credits').select('amount').eq('client_id', cliente)
  expect(error).toBeNull()
  return Math.round((data ?? []).reduce((s, r) => s + n(r.amount), 0) * 100) / 100
}
const pontosDe = async (cliente: string) => {
  const { data, error } = await db().rpc('saldo_de_pontos', { p_cliente: cliente })
  expect(error).toBeNull()
  return n(data)
}
const lancamentoDoCredito = async (cliente: string) => {
  const { data, error } = await db().from('financial_transactions')
    .select('id, amount, is_paid, payment_method, cartao_vezes, category, notes, credito_vendido_id')
    .eq('client_id', cliente).not('credito_vendido_id', 'is', null).order('created_at')
  expect(error).toBeNull()
  return data ?? []
}

test.beforeAll(async () => {
  test.setTimeout(150_000)
  rede = await criarOutraRede(`cv${marca}`)
  const b = db()
  expect((await b.from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  slug = (await b.from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  expect((await b.from('procedures').update({ price: 119, loyalty_points: 5 }).eq('id', rede.procedureId)).error).toBeNull()
  expect((await b.from('loyalty_configs').upsert(
    { tenant_id: rede.tenantId, enabled: true, points_per_real: 1, earn_mode: 'POR_PROCEDIMENTO' }, { onConflict: 'tenant_id' })).error).toBeNull()
  dona = await criarMembro(`cvd${marca}`, { tenant: rede.tenantId, donoDaRede: true, rotulo: 'Dona', permissoes: [] })
  recepcao = await criarMembro(`cvr${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Recepcao',
    permissoes: [{ modulo: 'cashier', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'agenda', nivel: 'MANAGE' }],
  })
  soVe = await criarMembro(`cvv${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'So ve', permissoes: [{ modulo: 'clients', nivel: 'VIEW' }],
  })
  rosana = await rede.criarCliente('Rosana')
  cartao = await rede.criarCliente('Cartao')
})

test.afterAll(async () => {
  await dona?.limpar(); await recepcao?.limpar(); await soVe?.limpar()
  await rede?.limpar()
})

test('decisão 1: a recepção vende R$ 300 de crédito na clínica no Pix — caixa, fechamento, pontos e saldo, sem comissão', async ({ browser }) => {
  await como(browser, recepcao!, async p => {
    const dlg = await abrirVendaNoPdv(p, `/${slug}`, rosana)
    await dlg.getByRole('button', { name: 'Crédito na rede', exact: true }).click()
    // A tela diz a regra (princípio 3): entra no caixa hoje, o uso não conta de novo.
    await expect(dlg.locator('[data-regra-do-credito]')).toContainText('Entra no caixa hoje')
    await expect(dlg.locator('[data-regra-do-credito]')).toContainText('não conta como receita de novo')
    await dlg.getByLabel('Valor do crédito').fill('300')
    // Pagar crédito com crédito não existe.
    await expect(dlg.getByRole('radio', { name: 'Crédito interno', exact: true })).toHaveCount(0)
    await dlg.getByRole('radio', { name: 'Pix', exact: true }).click()
    await dlg.getByRole('button', { name: /^Vender por R\$\s300,00/ }).click()
    await expect(p.getByText(/Venda registrada: Crédito na clínica/)).toBeVisible({ timeout: 15_000 })
  })

  const [tx] = await lancamentoDoCredito(rosana)
  expect(tx, 'o lançamento da venda do crédito').toBeTruthy()
  expect(n(tx!.amount)).toBe(300)
  expect(tx!.is_paid).toBe(true)
  expect(tx!.payment_method).toBe('PIX')
  expect(tx!.category).toBe('Crédito na clínica')
  expect(await saldoDe(rosana)).toBe(300)
  // O caixa e o faturamento: a regra única de receita (metrics_receitas_pagas) o conta.
  const agora = new Date()
  const { data: receitas, error: eR } = await db().rpc('metrics_receitas_pagas', {
    p_tenant: rede!.tenantId, p_branch_ids: null,
    p_from: new Date(agora.getTime() - 86_400_000).toISOString(), p_to: new Date(agora.getTime() + 60_000).toISOString(),
  })
  expect(eR).toBeNull()
  expect((receitas ?? []).filter((r: { id: string }) => r.id === tx!.id)).toHaveLength(1)
  // Os pontos: na venda, pelo dinheiro pago — 300 (mesmo com a fidelidade por procedimento).
  await expect.poll(() => pontosDe(rosana)).toBe(300)
  // Sem comissão de venda.
  const { count } = await db().from('commission_lines').select('id', { count: 'exact', head: true }).eq('tenant_id', rede!.tenantId)
  expect(count ?? 0).toBe(0)

  // O Fechamento do dia mostra os R$ 300 no Pix.
  await como(browser, dona!, async p => {
    await p.goto(`/${slug}/pdv?fechar=1`)
    await expect(p.locator('[data-forma="PIX"]').first()).toContainText(/R\$\s300,00/)
  })
})

test('decisão 1: usar o crédito não é receita de novo nem dá pontos de novo', async () => {
  const b = db()
  const { data: ap, error: eAp } = await b.from('appointments').insert({
    branch_id: rede!.branchId, client_id: rosana, procedure_id: rede!.procedureId, professional_id: rede!.professionalId,
    scheduled_at: new Date(Date.now() - 3_600_000).toISOString(), completed_at: new Date(Date.now() - 3_600_000).toISOString(),
    duration_min: 30, price: 119, status: 'COMPLETED', source: 'INTERNAL',
  }).select('id').single<{ id: string }>()
  expect(eAp).toBeNull()
  const { data: uso, error: eU } = await b.from('financial_transactions').insert({
    branch_id: rede!.branchId, client_id: rosana, appointment_id: ap!.id, type: 'INCOME', category: 'Procedimento',
    description: 'Creme pago com crédito', amount: 119, is_paid: true, paid_at: new Date().toISOString(), payment_method: 'INTERNAL_CREDIT', created_by: 'e2e',
  }).select('id').single<{ id: string }>()
  expect(eU).toBeNull()
  expect(await saldoDe(rosana)).toBe(181)
  const { data: receitas } = await b.rpc('metrics_receitas_pagas', {
    p_tenant: rede!.tenantId, p_branch_ids: null,
    p_from: new Date(Date.now() - 86_400_000).toISOString(), p_to: new Date(Date.now() + 60_000).toISOString(),
  })
  expect((receitas ?? []).filter((r: { id: string }) => r.id === uso!.id)).toHaveLength(0)
  expect(await pontosDe(rosana)).toBe(300)
})

test('decisão 1: o estorno do lançamento solto é recusado — a venda do crédito se estorna como venda', async () => {
  const [tx] = await lancamentoDoCredito(rosana)
  const { error } = await db().rpc('estornar_transacao', { p_transacao: tx!.id, p_tenant: rede!.tenantId, p_ator: 'e2e', p_motivo: 'e2e' })
  expect(error?.message ?? '').toContain('venda de crédito na clínica')
})

test('decisão 1: quem não recebe não vende crédito (a action recusa)', async ({ browser }) => {
  await como(browser, soVe!, async p => {
    // Só se vende pelo PDV (PDV7, 2026-11-13), e o PDV é de quem recebe.
    await p.goto(`/${slug}/pdv?nova=1&cliente=${rosana}`)
    await expect(p.getByText('Você não tem acesso a esta área')).toBeVisible()
    await expect(p.getByRole('region', { name: 'Vender' })).toHaveCount(0)
    const r = await chamarAcao(p, 'actions/credito-na-clinica.ts', 'venderCredito', `/${slug}/pdv`,
      [rosana, rede!.branchId, '50', { forma: 'AVISTA', metodo: 'PIX' }, null])
    expect(r.texto).not.toContain('"ok":true')
  })
  expect(await saldoDe(rosana)).toBe(181)
})

test('decisão 1: estornar a venda do crédito devolve só o saldo não usado (estorno parcial no Pix)', async ({ browser }) => {
  await como(browser, dona!, async p => {
    await p.goto(`/${slug}/financeiro`)
    const linha = p.locator('[data-lancamento]', { hasText: 'Crédito na clínica' }).filter({ hasText: '300,00' }).first()
    // A32: o "Estornar" tem texto, não só o ícone.
    await linha.getByRole('button', { name: 'Estornar' }).click()
    const dlg = p.getByRole('dialog', { name: 'Estornar a venda de crédito na clínica?' })
    const conta = dlg.locator('[data-conta-do-estorno-do-credito]')
    await expect(conta).toContainText(/Vendido\s*R\$\s300,00/)
    await expect(conta).toContainText(/Já usado\s*R\$\s119,00/)
    await expect(conta).toContainText(/Volta à cliente\s*R\$\s181,00/)
    await dlg.getByRole('radio', { name: /Estorno parcial/ }).check()
    await dlg.getByLabel('Motivo do estorno').fill('Desistiu do vale')
    await dlg.getByRole('button', { name: 'Confirmar estorno' }).click()
    await expect(dlg).toBeHidden({ timeout: 15_000 })
  })
  const txs = await lancamentoDoCredito(rosana)
  expect(n(txs[0]!.amount)).toBe(119)
  expect(txs[0]!.notes ?? '').not.toBe('Estornada')
  const { data: contra } = await db().from('financial_transactions').select('amount, payment_method, category')
    .eq('client_id', rosana).eq('category', 'Estorno')
  expect((contra ?? []).map(c => [n(c.amount), c.payment_method])).toEqual([[181, 'PIX']])
  expect(await saldoDe(rosana)).toBe(0)
  // Os pontos do que voltou saem: 300 − 181 = 119.
  await expect.poll(() => pontosDe(rosana)).toBe(119)
  const { data: venda } = await db().from('creditos_vendidos').select('estornado_em, valor_devolvido').eq('client_id', rosana).single()
  expect(venda!.estornado_em).not.toBeNull()
  expect(n(venda!.valor_devolvido)).toBe(181)
})

test('decisão 1: no cartão, o estorno é do pagamento inteiro, e o usado é lançado de novo', async () => {
  const b = db()
  const { data: venda, error } = await b.rpc('credito_vender', {
    p_tenant: rede!.tenantId, p_cliente: cartao, p_unidade: rede!.branchId, p_valor: 200,
    p_metodo: 'CREDIT_CARD', p_vezes: 2, p_bandeira: null, p_ator: null, p_ator_nome: 'e2e',
  })
  expect(error).toBeNull()
  expect((await b.from('internal_credits').insert({ client_id: cartao, branch_id: rede!.branchId, amount: -50, description: 'uso e2e' })).error).toBeNull()
  const { data: previa, error: eP } = await b.rpc('credito_estornar_venda', {
    p_tenant: rede!.tenantId, p_venda: venda, p_ator: null, p_ator_nome: 'e2e', p_motivo: 'e2e',
    p_esperado: null, p_simular: true, p_estorno: null, p_novo: null,
  })
  expect(eP).toBeNull()
  expect(n((previa as { volta: number }).volta)).toBe(150)
  expect((previa as { parcial: { cartao: boolean } }).parcial.cartao).toBe(true)
  const parcial = await b.rpc('credito_estornar_venda', {
    p_tenant: rede!.tenantId, p_venda: venda, p_ator: null, p_ator_nome: 'e2e', p_motivo: 'e2e',
    p_esperado: 150, p_simular: false, p_estorno: 'PARCIAL', p_novo: null,
  })
  expect(parcial.error?.message ?? '').toContain('cartão')
  const inteiro = await b.rpc('credito_estornar_venda', {
    p_tenant: rede!.tenantId, p_venda: venda, p_ator: null, p_ator_nome: 'e2e', p_motivo: 'e2e',
    p_esperado: 150, p_simular: false, p_estorno: 'INTEIRO', p_novo: { metodo: 'PIX', vezes: 1 },
  })
  expect(inteiro.error).toBeNull()
  const txs = await lancamentoDoCredito(cartao)
  const vivos = txs.filter(t => t.notes !== 'Estornada')
  expect(vivos.map(t => [n(t.amount), t.payment_method])).toEqual([[50, 'PIX']])
  expect(await saldoDe(cartao)).toBe(0)
})
