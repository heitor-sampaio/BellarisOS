import { test, expect, request } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * Fidelidade, fase 4 — validade dos pontos (migration 20260929000004).
 * A abrangência "só na unidade" saiu no FD3 (2026-11-14): o saldo é um só, da
 * rede — a prova é `fidelidade-saldo-da-rede.spec.ts`.
 *
 * A expiração é conferida com um cenário de datas escritas à mão: o valor
 * esperado de cada passo está no comentário ao lado, calculado sem o sistema.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let gestor: MembroDeTeste | null = null

test.beforeAll(async () => {
  rede = await criarOutraRede(`fva${marca}`)
  gestor = await criarMembro(`fvag${marca}`, {
    tenant: rede.tenantId, rotulo: 'Gestor validade',
    permissoes: [{ modulo: 'settings', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'VIEW' }, { modulo: 'loyalty', nivel: 'MANAGE' }],
  })
})
test.afterAll(async () => {
  if (gestor) await gestor.limpar()
  if (!rede) return
  // A rede inteira (e2e_apagar_rede); na completa, no fim da rodada (F25).
  await rede.limpar()
})

const conta = async (c: string) => (await db().rpc('fidelidade_conta', { p_cliente: c })).data as string
const saldo = async (c: string) =>
  Number((await db().rpc('saldo_de_pontos', { p_cliente: c })).data)
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

test.describe.serial('fidelidade: validade', () => {
  test('pela tela: a rede define a validade', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: gestor!.estado })
    try {
      const p = await ctx.newPage()
      await p.goto('/admin/settings?tab=fidelidade')
      await p.getByRole('button', { name: 'Programa desligado' }).click()
      await p.getByRole('button', { name: 'Vencem', exact: true }).click()
      await p.locator('input[name="expiry_months"]').fill('6')
      await p.getByRole('button', { name: 'Salvar', exact: true }).click()
      await expect(p.getByText('Salvo')).toBeVisible()
      const { data } = await db().from('loyalty_configs').select('enabled, expiry_months').eq('tenant_id', rede!.tenantId).single()
      expect(data).toEqual({ enabled: true, expiry_months: 6 })
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
    expect(Number((await db().rpc('pontos_expirando', { p_cliente: c, p_ate: ate })).data)).toBe(80)

    expect((await db().rpc('estornar_transacao', { p_transacao: tx!.id, p_tenant: rede!.tenantId, p_ator: 'e2e' })).error).toBeNull()
    const { data: estorno } = await db().from('loyalty_transactions').select('expires_at')
      .eq('loyalty_account_id', await conta(c)).eq('kind', 'ESTORNO_GANHO').single()
    expect(estorno!.expires_at).toBe(ganho!.expires_at)
    expect(Number((await db().rpc('pontos_expirando', { p_cliente: c, p_ate: ate })).data), 'lote estornado não vence').toBe(0)
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
