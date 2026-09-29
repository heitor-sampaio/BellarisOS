import { test, expect, request } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'

/**
 * Fidelidade, fase 4 — validade dos pontos e abrangência por unidade
 * (migration 20260929000004).
 *
 * A expiração é conferida com um cenário de datas escritas à mão: o valor
 * esperado de cada passo está no comentário ao lado, calculado sem o sistema.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let gestor: MembroDeTeste | null = null
let unidadeB = ''

test.beforeAll(async () => {
  rede = await criarOutraRede(`fva${marca}`)
  const { data: b, error } = await db().from('branches')
    .insert({ tenant_id: rede.tenantId, name: `${PREFIXO} Unidade B ${marca}`, slug: `e2e-unb-${marca}` })
    .select('id').single<{ id: string }>()
  expect(error).toBeNull()
  unidadeB = b!.id
  gestor = await criarMembro(`fvag${marca}`, {
    tenant: rede.tenantId, rotulo: 'Gestor validade',
    permissoes: [{ modulo: 'settings', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'VIEW' }, { modulo: 'loyalty', nivel: 'MANAGE' }],
  })
})
test.afterAll(async () => {
  if (gestor) await gestor.limpar()
  if (!rede) return
  await rede.limpar()   // a rede fica: a unidade B ainda está lá
  const b = db()
  const falhas: string[] = []
  const olhar = (o: string, r: { error: { message: string } | null }) => { if (r.error) falhas.push(`${o}: ${r.error.message}`) }
  olhar('unidade B', await b.from('branches').delete().eq('id', unidadeB))
  olhar('rede', await b.from('tenants').delete().eq('id', rede.tenantId))
  expect(falhas).toEqual([])
})

const conta = async (c: string) => (await db().rpc('fidelidade_conta', { p_cliente: c })).data as string
const saldo = async (c: string, unidade: string | null = null) =>
  Number((await db().rpc('saldo_de_pontos', { p_cliente: c, p_unidade: unidade })).data)
async function lancar(c: string, pontos: number, expira: string | null, unidade = rede!.branchId) {
  const { error } = await db().from('loyalty_transactions').insert({
    loyalty_account_id: await conta(c), branch_id: unidade, kind: 'AJUSTE', points: pontos,
    description: `${PREFIXO} cenário`, expires_at: expira, created_by: 'e2e',
  })
  expect(error, 'lançar no cenário').toBeNull()
}
const expirar = async (ate: string) => {
  const { error } = await db().rpc('expirar_pontos', { p_ate: ate, p_tenant: rede!.tenantId })
  expect(error).toBeNull()
}

test.describe.serial('fidelidade: validade e abrangência', () => {
  test('pela tela: a rede define validade e "só na unidade"; com pontos lançados, a abrangência trava', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: gestor!.estado })
    try {
      const p = await ctx.newPage()
      await p.goto('/admin/settings?tab=fidelidade')
      await p.getByRole('button', { name: 'Programa desligado' }).click()
      await p.getByRole('button', { name: 'Vencem', exact: true }).click()
      await p.locator('input[name="expiry_months"]').fill('6')
      await p.getByRole('button', { name: 'Só na unidade' }).click()
      await p.getByRole('button', { name: 'Salvar', exact: true }).click()
      await expect(p.getByText('Salvo')).toBeVisible()
      const { data } = await db().from('loyalty_configs').select('enabled, expiry_months, scope_per_branch').eq('tenant_id', rede!.tenantId).single()
      expect(data).toEqual({ enabled: true, expiry_months: 6, scope_per_branch: true })

      // Com um ponto lançado, a abrangência não muda mais — nem pela tela, nem pela action.
      const c = await rede!.criarCliente('Trava')
      await lancar(c, 10, null)
      await p.reload()
      await expect(p.getByTestId('abrangencia-travada')).toHaveText('Só na unidade')
      await chamarAcao(p, 'actions/fidelidade.ts', 'salvarConfigFidelidade', '/admin/settings?tab=fidelidade', [{
        enabled: true, earn_mode: 'POR_REAL', points_per_real: 1, commission_base: 'PRECO',
        redeem_points_value: 0.01, redeem_min_points: 0, redeem_max_pct: 100, expiry_months: 6, scope_per_branch: false,
      }])
      const depois = await db().from('loyalty_configs').select('scope_per_branch').eq('tenant_id', rede!.tenantId).single()
      expect(depois.data!.scope_per_branch, 'a abrangência não mudou').toBe(true)
    } finally { await ctx.close() }
  })

  test('expiração FIFO com datas escritas à mão; rodar duas vezes não vence duas vezes', async () => {
    const c = await rede!.criarCliente('Vence')
    await lancar(c, 100, '2027-01-01T00:00:00Z')   // lote 1
    await lancar(c,  50, '2027-03-01T00:00:00Z')   // lote 2
    await lancar(c, -120, null)                     // consumo: os 100 do lote 1 + 20 do lote 2
    expect(await saldo(c)).toBe(30)

    await expirar('2026-12-31T00:00:00Z')           // nada venceu
    expect(await saldo(c)).toBe(30)
    await expirar('2027-01-02T00:00:00Z')           // lote 1 venceu, mas já tinha sido todo usado
    expect(await saldo(c)).toBe(30)
    await expirar('2027-03-02T00:00:00Z')           // lote 2 venceu: sobravam 30 dele
    expect(await saldo(c)).toBe(0)
    await expirar('2027-03-02T00:00:00Z')           // de novo: nada muda
    await expirar('2027-06-01T00:00:00Z')
    expect(await saldo(c)).toBe(0)
    const { data } = await db().from('loyalty_transactions').select('points').eq('loyalty_account_id', await conta(c)).eq('kind', 'EXPIRACAO')
    expect((data ?? []).map(l => l.points)).toEqual([-30])
  })

  test('o estorno leva a validade do lote: o lote estornado não vence de novo; "a vencer" para a tela', async () => {
    const c = await rede!.criarCliente('Estorno')
    const pago = new Date().toISOString()
    const { data: tx, error } = await db().from('financial_transactions').insert({
      branch_id: rede!.branchId, client_id: c, type: 'INCOME', category: 'Atendimento', description: `${PREFIXO} pago ${marca}`,
      amount: 80, payment_method: 'PIX', is_paid: true, paid_at: pago, created_by: 'e2e',
    }).select('id').single<{ id: string }>()
    expect(error).toBeNull()
    const { data: ganho } = await db().from('loyalty_transactions').select('points, expires_at')
      .eq('transaction_id', tx!.id).eq('kind', 'GANHO').single()
    expect(ganho!.points).toBe(80)
    expect(ganho!.expires_at, 'o ganho recebe a validade da rede (6 meses)').not.toBeNull()

    // A vencer em 200 dias: os 80 do ganho.
    const ate = new Date(Date.now() + 200 * 86_400_000).toISOString()
    expect(Number((await db().rpc('pontos_expirando', { p_cliente: c, p_unidade: null, p_ate: ate })).data)).toBe(80)

    expect((await db().rpc('estornar_transacao', { p_transacao: tx!.id, p_tenant: rede!.tenantId, p_ator: 'e2e' })).error).toBeNull()
    const { data: estorno } = await db().from('loyalty_transactions').select('expires_at')
      .eq('loyalty_account_id', await conta(c)).eq('kind', 'ESTORNO_GANHO').single()
    expect(estorno!.expires_at).toBe(ganho!.expires_at)
    expect(Number((await db().rpc('pontos_expirando', { p_cliente: c, p_unidade: null, p_ate: ate })).data), 'lote estornado não vence').toBe(0)
  })

  test('só na unidade: o saldo de A não vale em B', async () => {
    const c = await rede!.criarCliente('Unidades')
    const { error } = await db().rpc('ajustar_pontos', {
      p_tenant: rede!.tenantId, p_cliente: c, p_unidade: rede!.branchId, p_pontos: 100, p_motivo: 'saldo em A', p_ator: 'e2e',
    })
    expect(error).toBeNull()
    expect(await saldo(c, rede!.branchId)).toBe(100)
    expect(await saldo(c, unidadeB)).toBe(0)

    const debitoEmB = await db().rpc('ajustar_pontos', {
      p_tenant: rede!.tenantId, p_cliente: c, p_unidade: unidadeB, p_pontos: -50, p_motivo: 'usar em B', p_ator: 'e2e',
    })
    expect(debitoEmB.error?.message).toMatch(/insuficiente/)

    const { data: ap } = await db().from('appointments').insert({
      branch_id: unidadeB, client_id: c, professional_id: rede!.professionalId, procedure_id: rede!.procedureId,
      scheduled_at: new Date().toISOString(), duration_min: 30, price: 100, status: 'COMPLETED',
    }).select('id').single<{ id: string }>()
    await db().from('loyalty_configs').update({ redeem_points_value: 0.1 }).eq('tenant_id', rede!.tenantId)
    const pagarEmB = await db().rpc('confirmar_pagamento_do_atendimento', {
      p_agendamento: ap!.id, p_tenant: rede!.tenantId, p_ator: null, p_ator_nome: null,
      p_dados: { metodo: 'PIX', pontos: 100, desconto: 10, valor_final: 90 },
    })
    expect(pagarEmB.error?.message).toMatch(/insuficiente/)

    const { data: porUnidade } = await db().rpc('saldos_por_unidade', { p_cliente: c })
    expect(porUnidade).toEqual([{ branch_id: rede!.branchId, saldo: 100 }])
  })

  test('o cron de expiração responde com o segredo', async () => {
    const api = await request.newContext({ baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000' })
    try {
      const r = await api.get('/api/cron/fidelidade', { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } })
      expect(r.status()).toBe(200)
      expect((await r.json()).ok).toBe(true)
    } finally { await api.dispose() }
  })
})
