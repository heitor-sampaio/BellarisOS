import { test, expect } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'

/**
 * A fidelidade da F67 (o levantamento das regras, 2026-11-12):
 * - C43 (D14): o pacote e o pré-pago no crediário pontuam CUMULATIVOS, como o
 *   plano — cada parcela paga dá o alvo menos o que já foi dado. Por real,
 *   cada parcela arredondava para baixo sozinha: 3 × R$ 33,33 davam 99 pontos
 *   de R$ 100.
 * - A6 da 13ª: a aba Fidelidade diz que o crédito na clínica vendido pontua.
 *
 * Numa rede [e2e] própria.
 */

test.describe.configure({ mode: 'serial' })

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let dona: MembroDeTeste | null = null

test.beforeAll(async () => {
  test.setTimeout(150_000)
  rede = await criarOutraRede(`fi67${marca}`)
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  dona = await criarMembro(`fi67d${marca}`, { tenant: rede.tenantId, donoDaRede: true, permissoes: [] })
  expect((await db().from('loyalty_configs').upsert({ tenant_id: rede.tenantId, enabled: true, earn_mode: 'POR_REAL', points_per_real: 1 }, { onConflict: 'tenant_id' })).error).toBeNull()
})

test.afterAll(async () => {
  await dona?.limpar()
  await rede?.limpar()
})

test('C43: o pacote em 3 parcelas de R$ 33,33 dá os 100 pontos dos R$ 100', async () => {
  const b = db()
  const { data: pac, error } = await b.rpc('pacote_salvar', {
    p_tenant: rede!.tenantId, p_id: null, p_nome: `${PREFIXO} Pacote parcelas ${marca}`, p_preco: 100, p_validade: null, p_ativo: true,
    p_itens: [{ procedure_id: rede!.procedureId, quantity: 2 }],
    p_comissao: { venda: null, execucao: { tipo: 'NENHUMA', valor: null } },
  })
  expect(error, 'criar o pacote').toBeNull()
  const cliente = await rede!.criarCliente('Parcelas')
  const { error: e2 } = await b.rpc('pacote_vender', {
    p_tenant: rede!.tenantId, p_cliente: cliente, p_pacote: pac as string, p_unidade: rede!.branchId, p_ator: dona!.userId,
    p_lancamentos: [33.33, 33.33, 33.34].map(v => ({ amount: v, payment_method: 'PIX', is_paid: true })),
    p_sessoes: [{ procedure_id: rede!.procedureId, preco: 50 }, { procedure_id: rede!.procedureId, preco: 50 }],
  })
  expect(e2, 'vender o pacote').toBeNull()
  const { data: conta } = await b.from('loyalty_accounts').select('id').eq('client_id', cliente).single<{ id: string }>()
  const { data: linhas } = await b.from('loyalty_transactions').select('points').eq('loyalty_account_id', conta!.id)
  expect((linhas ?? []).reduce((s, l) => s + Number(l.points), 0), 'R$ 100 pagos, 100 pontos').toBe(100)
})

test('A6: a aba Fidelidade diz que o crédito na clínica vendido pontua', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: dona!.estado })
  try {
    const p = await ctx.newPage()
    await p.goto('/admin/settings?tab=fidelidade')
    await expect(p.getByText('O produto vendido na ficha não dá pontos.', { exact: false }))
      .toContainText('o crédito na clínica vendido')
  } finally { await ctx.close() }
})
