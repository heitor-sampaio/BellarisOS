import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'

/**
 * D1 da 6ª simulação: cancelar a unidade de um pré-pago vai pelo fluxo do
 * PACOTE (F2b/F13, `vendas-financeiro.md`). O Jorge pagou 3 peelings (R$ 750)
 * no Visa 2x, e a Sofia cancelou a unidade 2: a tela dizia "Devolução de
 * R$ 250,00 registrada no financeiro", o banco tinha uma despesa PENDENTE sem
 * forma, o "A pagar" subia R$ 250, os recebíveis da operadora seguiam 375 +
 * 375 e os pontos não mudavam. Agora:
 *
 * - a clínica escolhe ESTORNO ou CRÉDITO NA CLÍNICA (princípio 1);
 * - no estorno que pega um pagamento em parte, o estorno parcial ou o
 *   pagamento inteiro estornado e o que fica lançado de novo; no CARTÃO, só o
 *   inteiro (a operadora estorna o pagamento todo) — e o recebível da
 *   operadora não recebido cai junto;
 * - os pontos acompanham o estorno (o crédito na clínica os deixa: o
 *   dinheiro não voltou);
 * - o a receber que sobra cai antes de devolver qualquer coisa.
 *
 * Numa rede [e2e] própria.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let gestor: MembroDeTeste | null = null
let soVe: MembroDeTeste | null = null
const n = (v: unknown) => Number(v ?? 0)

test.beforeAll(async () => {
  rede = await criarOutraRede(`ppc${marca}`)
  expect((await db().from('procedures').update({ price: 250 }).eq('id', rede.procedureId)).error).toBeNull()
  expect((await db().from('loyalty_configs').upsert(
    { tenant_id: rede.tenantId, enabled: true, points_per_real: 1, earn_mode: 'POR_REAL' }, { onConflict: 'tenant_id' })).error).toBeNull()
  expect((await db().from('payment_fees').insert({ tenant_id: rede.tenantId, metodo: 'CREDIT_CARD', parcelas: 2, taxa_pct: 2.38 })).error).toBeNull()
  gestor = await criarMembro(`ppcg${marca}`, {
    tenant: rede.tenantId, rotulo: 'Recepção e caixa',
    permissoes: [
      { modulo: 'cashier', nivel: 'MANAGE' }, { modulo: 'financial', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'MANAGE' },
      { modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'loyalty', nivel: 'VIEW' },
    ],
  })
  soVe = await criarMembro(`ppcv${marca}`, {
    tenant: rede.tenantId, rotulo: 'Só vê clientes', permissoes: [{ modulo: 'clients', nivel: 'VIEW' }],
  })
})

test.afterAll(async () => {
  const falhas: string[] = []
  if (rede) {
    const b = db()
    const { data: vendas } = await b.from('procedure_sales').select('id').eq('tenant_id', rede.tenantId)
    const ids = (vendas ?? []).map(v => v.id as string)
    if (ids.length) {
      for (const [t, col] of [['financial_transactions', 'procedure_sale_id'], ['commission_lines', 'procedure_sale_id']] as const) {
        const r = await b.from(t).update({ [col]: null }).in(col, ids)
        if (r.error) falhas.push(r.error.message)
      }
      const r = await b.from('procedure_sales').delete().in('id', ids)
      if (r.error) falhas.push(r.error.message)
    }
    const t = await b.from('payment_fees').delete().eq('tenant_id', rede.tenantId)
    if (t.error) falhas.push(t.error.message)
  }
  await soVe?.limpar()
  await gestor?.limpar()
  await rede?.limpar()
  expect(falhas).toEqual([])
})

async function comSessao<T>(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<T>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { return await fn(await ctx.newPage()) } finally { await ctx.close() }
}

/** Vende `qtd` unidades de R$ 250 direto pela função. */
async function vender(cliente: string, qtd: number, lancamentos: Record<string, unknown>[]) {
  const { data, error } = await db().rpc('procedimento_vender', {
    p_tenant: rede!.tenantId, p_cliente: cliente, p_procedimento: rede!.procedureId, p_unidade: rede!.branchId,
    p_ator: null, p_quantidade: qtd, p_desconto: 0, p_validade_dias: null, p_lancamentos: lancamentos,
    p_unidades: Array.from({ length: qtd }, () => ({ preco: 250 })),
  })
  expect(error, 'vender pela função').toBeNull()
  const venda = data as string
  const { data: us } = await db().from('procedure_sale_units').select('id').eq('sale_id', venda).order('numero')
  return { venda, unidades: (us ?? []).map(u => u.id as string) }
}

/**
 * Os lançamentos da venda e os estornos dela (o contra-lançamento não leva a
 * venda, como o do atendimento: é achado pela cliente). Na ordem: receita
 * paga viva, receita estornada, a receber, estornos — o que nasce na mesma
 * transação tem o mesmo created_at.
 */
async function lancamentos(venda: string) {
  const { data: v } = await db().from('procedure_sales').select('client_id').eq('id', venda).single()
  const { data } = await db().from('financial_transactions')
    .select('id, type, category, amount, payment_method, cartao_vezes, is_paid, notes, procedure_sale_id')
    .eq('client_id', v!.client_id as string)
  const ordem = (t: Record<string, unknown>) => t.type === 'EXPENSE' ? 3 : !t.is_paid ? 2 : t.notes === 'Estornada' ? 0 : 1
  return (data ?? [])
    .filter(t => t.procedure_sale_id === venda || t.category === 'Estorno')
    .map(t => ({ ...t, amount: n(t.amount) }))
    .sort((a, b) => ordem(a) - ordem(b) || b.amount - a.amount)
}
const pontos = async (cliente: string) => n((await db().rpc('saldo_de_pontos', { p_cliente: cliente, p_unidade: null })).data)
async function recebiveis(tx: string) {
  const { data } = await db().from('recebiveis_do_cartao').select('valor, cancelada_em').eq('transaction_id', tx).order('parcela_numero')
  return (data ?? []).map(r => [n(r.valor), r.cancelada_em ? 'CANCELADA' : 'VIVA'])
}

test.describe('D1: cancelar a unidade do pré-pago, como o pacote', () => {
  test('no Pix, pela ficha: a janela diz o que volta e pergunta; "Crédito na clínica" deixa o Pix e os pontos', async ({ browser }) => {
    const c = await rede!.criarCliente('Pré-pago crédito')
    const { venda } = await vender(c, 2, [{ amount: 500, payment_method: 'PIX', is_paid: true }])
    await expect.poll(() => pontos(c)).toBe(500)
    await comSessao(browser, gestor!, async p => {
      await p.goto(`/admin/clients/${c}`)
      const card = p.locator('[data-procedimentos-pagos]')
      await card.getByRole('button', { name: 'Cancelar', exact: true }).first().click()
      const dlg = p.getByRole('dialog', { name: 'Cancelar unidade' })
      await expect(dlg.locator('[data-conta-do-cancelamento]')).toContainText('R$ 250,00')
      await expect(dlg.locator('[data-a-devolver]')).toContainText('R$ 250,00')
      const confirmar = dlg.getByRole('button', { name: 'Cancelar unidade' })
      await dlg.getByLabel('Motivo do cancelamento').fill('Mudou de cidade')
      await expect(confirmar, 'sem dizer como devolver, não confirma').toBeDisabled()
      await dlg.getByRole('radio', { name: /Crédito na clínica/ }).check()
      await confirmar.click()
      await expect(dlg).toBeHidden()
      await expect(card.getByRole('status')).toContainText('R$ 250,00 ficaram de crédito na clínica')
    })
    // Nada de "Devolução" a pagar; o Pix fica inteiro; o crédito nasce; os pontos ficam.
    expect((await lancamentos(venda)).map(t => [t.type, t.amount, t.payment_method, t.is_paid, t.notes])).toEqual([
      ['INCOME', 500, 'PIX', true, null],
    ])
    const { data: cred } = await db().from('internal_credits').select('amount, description').eq('client_id', c)
    expect(cred?.map(x => n(x.amount))).toEqual([250])
    expect(await pontos(c)).toBe(500)
    const { data: u } = await db().from('procedure_sale_units').select('status, cancel_reason, cancelamento').eq('sale_id', venda).order('numero')
    expect(u!.map(x => x.status)).toEqual(['CANCELADA', 'DISPONIVEL'])
    expect((u![0]!.cancelamento as Record<string, unknown>).destino).toBe('CREDITO')
  })

  test('no Pix, com estorno: o estorno parcial — o Pix fica com o que vale, o "Estorno parcial" leva o resto, e os pontos saem na proporção', async ({ browser }) => {
    const c = await rede!.criarCliente('Pré-pago estorno Pix')
    const { venda, unidades } = await vender(c, 2, [{ amount: 500, payment_method: 'PIX', is_paid: true }])
    await expect.poll(() => pontos(c)).toBe(500)
    await comSessao(browser, gestor!, async p => {
      const r = await chamarAcao(p, 'actions/pre-pago.ts', 'cancelarUnidadePrePaga', `/admin/clients/${c}`,
        [unidades[1], { motivo: 'Desistiu', destino: 'ESTORNO', esperado: 250, estorno: 'PARCIAL', novo: null }])
      expect(r.texto).toContain('"devolver":250')
    })
    expect((await lancamentos(venda)).map(t => [t.type, t.category, t.amount, t.payment_method, t.is_paid])).toEqual([
      ['INCOME', expect.any(String), 250, 'PIX', true],
      ['EXPENSE', 'Estorno', 250, 'PIX', true],
    ])
    expect(await pontos(c)).toBe(250)
  })

  test('no cartão Visa 2x, pela ficha: só o estorno do pagamento inteiro; o recebível da operadora cai e o que fica entra de novo na forma escolhida', async ({ browser }) => {
    const c = await rede!.criarCliente('Pré-pago cartão')
    const { venda } = await vender(c, 3, [{ amount: 750, payment_method: 'CREDIT_CARD', cartao_vezes: 2, is_paid: true }])
    const [original] = await lancamentos(venda)
    expect(original!.amount).toBe(750)
    expect(await recebiveis(original!.id)).toEqual([[375, 'VIVA'], [375, 'VIVA']])
    await comSessao(browser, gestor!, async p => {
      await p.goto(`/admin/clients/${c}`)
      const card = p.locator('[data-procedimentos-pagos]')
      await card.getByRole('button', { name: 'Cancelar', exact: true }).nth(1).click()
      const dlg = p.getByRole('dialog', { name: 'Cancelar unidade' })
      await expect(dlg.locator('[data-a-devolver]')).toContainText('R$ 250,00')
      await dlg.getByRole('radio', { name: /^Estorno/ }).first().check()
      const como = dlg.locator('[data-como-estornar]')
      await expect(como.getByRole('radio', { name: /Estorno parcial/ })).toBeDisabled()
      await expect(como.locator('[data-motivo-sem-parcial]')).toContainText('No cartão, a operadora estorna o pagamento inteiro')
      await expect(como.getByRole('radio', { name: /Estornar o pagamento inteiro/ })).toBeChecked()
      await como.getByLabel('Forma do pagamento do usado').selectOption('PIX')
      await dlg.getByLabel('Motivo do cancelamento').fill('Não vai fazer a terceira')
      await dlg.getByRole('button', { name: 'Cancelar unidade' }).click()
      await expect(dlg).toBeHidden()
      await expect(card.getByRole('status')).toContainText('R$ 250,00 estornados')
    })
    const txs = await lancamentos(venda)
    expect(txs.map(t => [t.type, t.amount, t.payment_method, t.is_paid, t.notes])).toEqual([
      ['INCOME', 750, 'CREDIT_CARD', true, 'Estornada'],
      ['INCOME', 500, 'PIX', true, null],
      ['EXPENSE', 750, 'CREDIT_CARD', true, null],
    ])
    // A operadora não vai depositar o que a clínica estornou.
    expect(await recebiveis(original!.id)).toEqual([[0, 'CANCELADA'], [0, 'CANCELADA']])
    // Nenhuma "Devolução" a pagar sem forma.
    expect(txs.filter(t => t.category === 'Devolução')).toEqual([])
    // Os pontos: os 750 do cartão saem, os 500 do Pix entram.
    await expect.poll(() => pontos(c)).toBe(500)
  })

  test('o a receber que sobra cai antes: nada a devolver, nada a perguntar', async ({ browser }) => {
    const c = await rede!.criarCliente('Pré-pago crediário')
    const { venda, unidades } = await vender(c, 2, [
      { amount: 250, payment_method: 'PIX', is_paid: true },
      { amount: 250, payment_method: null, is_paid: false, due_date: new Date(Date.now() + 30 * 86_400_000).toISOString() },
    ])
    await comSessao(browser, gestor!, async p => {
      await p.goto(`/admin/clients/${c}`)
      const card = p.locator('[data-procedimentos-pagos]')
      await card.getByRole('button', { name: 'Cancelar', exact: true }).nth(1).click()
      const dlg = p.getByRole('dialog', { name: 'Cancelar unidade' })
      await expect(dlg.locator('[data-a-devolver]')).toContainText('R$ 0,00')
      await expect(dlg.getByRole('radio', { name: /Crédito na clínica/ })).toHaveCount(0)
      await dlg.getByLabel('Motivo do cancelamento').fill('Só uma')
      await dlg.getByRole('button', { name: 'Cancelar unidade' }).click()
      await expect(card.getByRole('status')).toContainText('O a receber diminuiu R$ 250,00')
    })
    expect((await lancamentos(venda)).map(t => [t.amount, t.is_paid, t.notes])).toEqual([[250, true, null], [250, false, 'Estornada']])
    expect((await db().from('procedure_sale_units').select('status').eq('id', unidades[1]!).single()).data?.status).toBe('CANCELADA')
  })

  test('recusas: sem dizer como devolver, sem o valor que a janela mostrou, e por quem não recebe', async ({ browser }) => {
    const c = await rede!.criarCliente('Pré-pago recusas')
    const { unidades } = await vender(c, 2, [{ amount: 500, payment_method: 'PIX', is_paid: true }])
    const rota = `/admin/clients/${c}`
    await comSessao(browser, gestor!, async p => {
      const semDestino = await chamarAcao(p, 'actions/pre-pago.ts', 'cancelarUnidadePrePaga', rota,
        [unidades[0], { motivo: 'x', destino: null, esperado: 250 }])
      expect(semDestino.texto).toContain('estorno ou crédito na clínica')
      const mudou = await chamarAcao(p, 'actions/pre-pago.ts', 'cancelarUnidadePrePaga', rota,
        [unidades[0], { motivo: 'x', destino: 'CREDITO', esperado: 100 }])
      expect(mudou.texto).toContain('mudaram desde que a janela abriu')
    })
    await comSessao(browser, soVe!, async p => {
      const r = await chamarAcao(p, 'actions/pre-pago.ts', 'cancelarUnidadePrePaga', rota,
        [unidades[0], { motivo: 'x', destino: 'CREDITO', esperado: 250 }])
      expect(r.texto).not.toContain('"devolver"')
    })
    expect((await db().from('procedure_sale_units').select('status').eq('id', unidades[0]!).single()).data?.status).toBe('DISPONIVEL')
  })
})
