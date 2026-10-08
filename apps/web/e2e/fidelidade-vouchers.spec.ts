import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * Fidelidade, fase 3 — catálogo de recompensas e vouchers
 * (migration 20260929000003).
 *
 * O fluxo que a clínica usa vai pela tela (cadastrar a recompensa, trocar os
 * pontos, pagar com o voucher, entregar o produto); as regras de borda vão
 * direto às funções do banco, que são quem confere.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let gestor: MembroDeTeste | null = null

test.beforeAll(async () => {
  rede = await criarOutraRede(`fv${marca}`)
  gestor = await criarMembro(`fvg${marca}`, {
    tenant: rede.tenantId, rotulo: 'Gestor vouchers',
    permissoes: [
      { modulo: 'settings', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'VIEW' }, { modulo: 'loyalty', nivel: 'MANAGE' },
      { modulo: 'agenda', nivel: 'VIEW' }, { modulo: 'cashier', nivel: 'MANAGE' },
    ],
  })
  const { error } = await db().from('loyalty_configs').upsert({
    tenant_id: rede.tenantId, enabled: true, earn_mode: 'POR_REAL', points_per_real: 1,
    redeem_points_value: 0.1, redeem_min_points: 0, redeem_max_pct: 100,
  }, { onConflict: 'tenant_id' })
  expect(error).toBeNull()
})
test.afterAll(async () => {
  if (gestor) await gestor.limpar()
  if (rede) await rede.limpar()
})

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: gestor!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}
async function dar(c: string, pontos: number) {
  const { error } = await db().rpc('ajustar_pontos', {
    p_tenant: rede!.tenantId, p_cliente: c, p_unidade: rede!.branchId, p_pontos: pontos, p_motivo: 'saldo do teste', p_ator: 'e2e',
  })
  expect(error).toBeNull()
}
const saldo = async (c: string) => Number((await db().rpc('saldo_de_pontos', { p_cliente: c, p_unidade: null })).data)
async function recompensa(linha: Record<string, unknown>) {
  const { data, error } = await db().from('loyalty_rewards').insert({ tenant_id: rede!.tenantId, validity_days: 30, ...linha })
    .select('id').single<{ id: string }>()
  expect(error, 'criar a recompensa').toBeNull()
  return data!.id
}
async function resgatar(c: string, rewardId: string) {
  const { data, error } = await db().rpc('resgatar_recompensa', {
    p_tenant: rede!.tenantId, p_cliente: c, p_recompensa: rewardId, p_unidade: rede!.branchId, p_ator: 'e2e',
  })
  expect(error, 'resgatar').toBeNull()
  return data as string
}
async function atendimento(c: string, preco: number, procedureId = rede!.procedureId) {
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: c, professional_id: rede!.professionalId, procedure_id: procedureId,
    scheduled_at: new Date().toISOString(), duration_min: 30, price: preco, status: 'COMPLETED', completed_at: new Date().toISOString(),
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  return data!.id
}
const pagar = (ap: string, dados: Record<string, unknown>) => db().rpc('confirmar_pagamento_do_atendimento', {
  p_agendamento: ap, p_tenant: rede!.tenantId, p_ator: null, p_ator_nome: null, p_dados: dados,
})
const voucher = async (id: string) => (await db().from('loyalty_vouchers').select('status, used_transaction_id').eq('id', id).single()).data

test.describe.serial('fidelidade: recompensas e vouchers', () => {
  test('pela tela: cadastrar a recompensa, trocar os pontos e pagar com o voucher', async ({ browser }) => {
    const nome = `${PREFIXO} Limpeza grátis ${marca}`
    const c = await rede!.criarCliente('Tela')
    await dar(c, 150)
    const ap = await atendimento(c, 120)

    await como(browser, async p => {
      // 1. O catálogo, em Configurações → Fidelidade.
      await p.goto('/admin/settings?tab=fidelidade')
      const catalogo = p.getByTestId('catalogo-de-recompensas')
      await catalogo.getByRole('button', { name: 'Nova recompensa' }).click()
      const form = p.getByTestId('formulario-de-recompensa')
      await form.locator('input[name="nome"]').fill(nome)
      await form.locator('select[name="tipo"]').selectOption('PROCEDIMENTO')
      await form.locator('select[name="procedimento"]').selectOption(rede!.procedureId)
      await form.locator('input[name="custo"]').fill('100')
      await form.getByRole('button', { name: 'Salvar recompensa' }).click()
      await expect(catalogo.getByTestId('recompensa').filter({ hasText: nome })).toBeVisible()

      // 2. Na ficha: trocar os pontos.
      await p.goto(`/admin/clients/${c}`)
      const vouchers = p.getByTestId('vouchers-do-cliente')
      await vouchers.getByRole('button', { name: 'Trocar pontos' }).click()
      await p.getByTestId('trocar-pontos').locator('div').filter({ hasText: nome }).getByRole('button', { name: 'Trocar' }).click()
      await expect(vouchers.getByTestId('voucher').filter({ hasText: nome })).toContainText('Ativo')
      await expect(p.getByTestId('saldo-de-pontos')).toHaveText('50 pontos')

      // 3. No pagamento: o voucher zera o atendimento — sem forma de pagamento.
      await p.goto(`/admin/agenda/${ap}`)
      await p.getByRole('button', { name: 'Confirmar pagamento' }).click()
      const idDoVoucher = (await db().from('loyalty_vouchers').select('id').eq('client_id', c).single()).data!.id as string
      await p.locator('select[name="voucher_id"]').selectOption(idDoVoucher)
      await expect(p.getByTestId('total-a-receber')).toContainText('0,00')
      await expect(p.locator('select[name="payment_method"]')).toHaveCount(0)
      await p.locator('form').getByRole('button', { name: 'Confirmar pagamento' }).click()
      await expect.poll(async () => (await voucher(idDoVoucher))?.status).toBe('USADO')
    })

    const { data: tx } = await db().from('financial_transactions').select('id, amount, loyalty_discount, is_paid')
      .eq('appointment_id', ap).single()
    expect({ amount: Number(tx!.amount), desconto: Number(tx!.loyalty_discount), pago: tx!.is_paid })
      .toEqual({ amount: 0, desconto: 120, pago: true })
    const { data: ev } = await db().from('domain_events').select('nome').eq('tenant_id', rede!.tenantId).eq('nome', 'fidelidade.voucher_emitido')
    expect((ev ?? []).length, 'a troca emite o evento').toBeGreaterThanOrEqual(1)
  })

  test('cancelar devolve os pontos; não cancela duas vezes; motivo obrigatório', async () => {
    const c = await rede!.criarCliente('Cancelar')
    await dar(c, 100)
    const r = await recompensa({ name: `${PREFIXO} Desconto ${marca}`, type: 'DESCONTO_VALOR', discount_value: 20, points_cost: 80 })
    const v = await resgatar(c, r)
    expect(await saldo(c)).toBe(20)
    const semMotivo = await db().rpc('cancelar_voucher', { p_tenant: rede!.tenantId, p_voucher: v, p_ator: 'e2e', p_motivo: ' ' })
    expect(semMotivo.error?.message).toMatch(/motivo/)
    expect((await db().rpc('cancelar_voucher', { p_tenant: rede!.tenantId, p_voucher: v, p_ator: 'e2e', p_motivo: 'desistiu' })).error).toBeNull()
    expect(await saldo(c)).toBe(100)
    const deNovo = await db().rpc('cancelar_voucher', { p_tenant: rede!.tenantId, p_voucher: v, p_ator: 'e2e', p_motivo: 'de novo' })
    expect(deNovo.error?.message).toMatch(/ativo/)
    expect(await saldo(c)).toBe(100)
    // Sem saldo, a troca é recusada.
    const { error } = await db().rpc('resgatar_recompensa', {
      p_tenant: rede!.tenantId, p_cliente: c, p_recompensa: r, p_unidade: rede!.branchId, p_ator: 'e2e',
    })
    expect(error).toBeNull()
    const semSaldo = await db().rpc('resgatar_recompensa', {
      p_tenant: rede!.tenantId, p_cliente: c, p_recompensa: r, p_unidade: rede!.branchId, p_ator: 'e2e',
    })
    expect(semSaldo.error?.message).toMatch(/insuficiente/)
  })

  test('voucher de outro procedimento e voucher vencido são recusados no pagamento', async () => {
    const c = await rede!.criarCliente('Recusas')
    await dar(c, 500)
    const { data: outro } = await db().from('procedures')
      .insert({ tenant_id: rede!.tenantId, name: `${PREFIXO} Outro proc ${marca}`, category: 'e2e', duration_min: 30, price: 0 })
      .select('id').single<{ id: string }>()
    const rProc = await recompensa({ name: `${PREFIXO} Proc ${marca}`, type: 'PROCEDIMENTO', procedure_id: outro!.id, points_cost: 100 })
    const vProc = await resgatar(c, rProc)
    const ap = await atendimento(c, 100)
    const errado = await pagar(ap, { metodo: null, pontos: 0, desconto: 0, valor_final: 0, voucher_id: vProc, desconto_voucher: 100 })
    expect(errado.error?.message).toMatch(/outro procedimento/)

    const rVal = await recompensa({ name: `${PREFIXO} Vale ${marca}`, type: 'DESCONTO_VALOR', discount_value: 30, points_cost: 100 })
    const vVal = await resgatar(c, rVal)
    await db().from('loyalty_vouchers').update({ expires_at: new Date(Date.now() - 60_000).toISOString() }).eq('id', vVal)
    const vencido = await pagar(ap, { metodo: 'PIX', pontos: 0, desconto: 0, valor_final: 70, voucher_id: vVal, desconto_voucher: 30 })
    expect(vencido.error?.message).toMatch(/vencido/)
    const cancelaVencido = await db().rpc('cancelar_voucher', { p_tenant: rede!.tenantId, p_voucher: vVal, p_ator: 'e2e', p_motivo: 'tentar reaver' })
    expect(cancelaVencido.error?.message, 'vencido não devolve os pontos').toMatch(/não voltam/)
    expect(await saldo(c)).toBe(300)
    const { data: nada } = await db().from('financial_transactions').select('id').eq('appointment_id', ap)
    expect(nada ?? []).toHaveLength(0)
  })

  test('voucher de % com pontos por cima; estorno devolve tudo e reativa o voucher', async () => {
    const c = await rede!.criarCliente('Combinado')
    await dar(c, 300)
    const r = await recompensa({ name: `${PREFIXO} 10% ${marca}`, type: 'DESCONTO_PERCENTUAL', discount_value: 10, points_cost: 100 })
    const v = await resgatar(c, r)                       // saldo 200
    const ap = await atendimento(c, 200)
    // 10% de 200 = 20; sobra 180; 100 pontos a R$ 0,10 = 10; paga 170.
    const ok = await pagar(ap, { metodo: 'PIX', pontos: 100, desconto: 10, valor_final: 170, voucher_id: v, desconto_voucher: 20 })
    expect(ok.error).toBeNull()
    const { data: tx } = await db().from('financial_transactions').select('id, amount, loyalty_discount').eq('appointment_id', ap).single()
    expect({ amount: Number(tx!.amount), desconto: Number(tx!.loyalty_discount) }).toEqual({ amount: 170, desconto: 30 })
    expect(await saldo(c)).toBe(270)                     // 200 − 100 + 170 ganhos
    expect((await voucher(v))?.status).toBe('USADO')

    const { error } = await db().rpc('estornar_transacao', { p_transacao: tx!.id, p_tenant: rede!.tenantId, p_ator: 'e2e' })
    expect(error).toBeNull()
    expect(await saldo(c), 'os pontos usados voltam e os ganhos saem').toBe(200)
    expect(await voucher(v), 'o voucher volta a ativo').toEqual({ status: 'ATIVO', used_transaction_id: null })
  })

  test('pela tela: entregar o produto do voucher baixa o estoque e o lote', async ({ browser }) => {
    const c = await rede!.criarCliente('Produto')
    await dar(c, 100)
    const produto = await rede!.criarProduto('Protetor', 5)
    const { error: eLote } = await db().from('product_batches').insert({
      product_id: produto, branch_id: rede!.branchId, batch_number: `L${marca}`, quantity: 5,
      expires_at: new Date(Date.now() + 90 * 86_400_000).toISOString(),
    })
    expect(eLote).toBeNull()
    const r = await recompensa({ name: `${PREFIXO} Protetor ${marca}`, type: 'PRODUTO', product_id: produto, points_cost: 60 })
    const v = await resgatar(c, r)

    await como(browser, async p => {
      await p.goto(`/admin/clients/${c}`)
      const item = p.getByTestId('voucher').filter({ hasText: 'Protetor' })
      await item.getByRole('button', { name: 'Entregar produto' }).click()
      await expect(item).toContainText('Usado')
    })

    const { data: est } = await db().from('branch_product_stock').select('current_stock').eq('product_id', produto).eq('branch_id', rede!.branchId).single()
    expect(Number(est!.current_stock)).toBe(4)
    const { data: vv } = await db().from('loyalty_vouchers').select('status, used_stock_movement_id').eq('id', v).single()
    expect(vv!.status).toBe('USADO')
    const { data: mov } = await db().from('stock_movements').select('type, quantity, reference').eq('id', vv!.used_stock_movement_id).single()
    expect({ tipo: mov!.type, qtd: Number(mov!.quantity), ref: mov!.reference }).toEqual({ tipo: 'MANUAL_ADJUSTMENT', qtd: -1, ref: `voucher:${v}` })
    const { data: lotes } = await db().from('stock_movement_batches').select('quantity').eq('movement_id', vv!.used_stock_movement_id)
    expect((lotes ?? []).map(l => Number(l.quantity)), 'o lote baixa pelo gatilho').toEqual([1])
  })

  test('entregar com o saldo lido VELHO é recusado (PT409): o voucher segue ativo e o estoque intacto', async () => {
    const c = await rede!.criarCliente('Produto velho')
    await dar(c, 100)
    const produto = await rede!.criarProduto('Protetor velho', 5)
    const r = await recompensa({ name: `${PREFIXO} Protetor velho ${marca}`, type: 'PRODUTO', product_id: produto, points_cost: 60 })
    const v = await resgatar(c, r)
    const entregar = (lido: number) => db().rpc('entregar_voucher_produto', {
      p_tenant: rede!.tenantId, p_voucher: v, p_unidade: rede!.branchId, p_ator: 'e2e',
      p_dados: { quantidade: -1, saldo_apos: lido - 1, embalagens: lido - 1, rendimento: null, custo: null, minimo: 0,
        antes_embalagens: lido, antes_rendimento: null },
    })
    expect((await entregar(9)).error?.code, 'o app leu 9; são 5').toBe('PT409')
    const { data: vv } = await db().from('loyalty_vouchers').select('status').eq('id', v).single()
    expect(vv!.status).toBe('ATIVO')
    expect((await entregar(5)).error).toBeNull()
    const { data: est } = await db().from('branch_product_stock').select('current_stock').eq('product_id', produto).eq('branch_id', rede!.branchId).single()
    expect(Number(est!.current_stock)).toBe(4)
  })
})
