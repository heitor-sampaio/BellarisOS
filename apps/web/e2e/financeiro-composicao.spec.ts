import { test, expect } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * A composição do financeiro (por forma de pagamento e por categoria), contada
 * no banco — metrics_financeiro_composicao.
 *
 * A simulação de um dia de clínica (2026-10-20) viu as "Categorias de despesa"
 * somarem R$ 6.950 contra o KPI de R$ 6.900: a tela somava a lista, tirando só
 * a transação "Estornada" — a contra-transação (categoria "Estorno") entrava
 * como despesa. A regra do estorno é a de metrics_core: sai dos DOIS lados.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null

test.beforeAll(async () => { rede = await criarOutraRede(`fc${marca}`) })
test.afterAll(async () => {
  if (!rede) return
  await db().from('financial_transactions').delete().eq('branch_id', rede.branchId)
  await rede.limpar()
})

test('o estorno sai dos dois lados; despesa e receita por categoria e por forma', async () => {
  const agora = new Date().toISOString()
  const lanca = async (linha: Record<string, unknown>) => {
    const { data, error } = await db().from('financial_transactions').insert({
      branch_id: rede!.branchId, is_paid: true, paid_at: agora, created_by: 'e2e', ...linha,
    }).select('id').single<{ id: string }>()
    expect(error).toBeNull()
    return data!.id
  }
  await lanca({ type: 'EXPENSE', category: 'Aluguel', description: `${PREFIXO} aluguel`, amount: 2500, payment_method: 'PIX' })
  await lanca({ type: 'INCOME', category: 'Serviços', description: `${PREFIXO} limpeza`, amount: 180, payment_method: 'PIX' })
  const avulsa = await lanca({ type: 'INCOME', category: 'Produtos', description: `${PREFIXO} venda`, amount: 50, payment_method: 'CASH' })
  const { error: eE } = await db().rpc('estornar_transacao', { p_transacao: avulsa, p_tenant: rede!.tenantId, p_ator: 'e2e' })
  expect(eE, 'estornar').toBeNull()

  const { data, error } = await db().rpc('metrics_financeiro_composicao', {
    p_tenant: rede!.tenantId, p_branch_ids: [rede!.branchId],
    p_from: new Date(Date.now() - 3_600_000).toISOString(), p_to: new Date(Date.now() + 3_600_000).toISOString(),
  })
  expect(error, 'a função existe').toBeNull()
  const linhas = ((data ?? []) as { grupo: string; chave: string; valor: number }[])
    .map(l => `${l.grupo}:${l.chave}:${Number(l.valor)}`).sort()
  expect(linhas).toEqual(['DESPESA:Aluguel:2500', 'FORMA:PIX:180', 'RECEITA:Serviços:180'])
})

test('a despesa a pagar e a série por semana vêm do banco', async () => {
  const agora = new Date()
  await db().from('financial_transactions').insert([
    { branch_id: rede!.branchId, type: 'EXPENSE', category: 'Fornecedor', description: 'e2e a pagar', amount: 300, is_paid: false, due_date: agora.toISOString(), created_by: 'e2e' },
    { branch_id: rede!.branchId, type: 'EXPENSE', category: 'Fornecedor', description: 'e2e paga', amount: 40, is_paid: true, paid_at: agora.toISOString(), created_by: 'e2e' },
  ])
  const janela = { p_tenant: rede!.tenantId, p_branch_ids: [rede!.branchId], p_from: new Date(Date.now() - 3_600_000).toISOString(), p_to: new Date(Date.now() + 3_600_000).toISOString() }
  const { data: aPagar, error } = await db().rpc('metrics_a_pagar', janela)
  expect(error, 'a função existe').toBeNull()
  expect(Number(aPagar)).toBe(300)
  const { data: semanas, error: eS } = await db().rpc('metrics_series', { ...janela, p_granularity: 'week' })
  expect(eS).toBeNull()
  const s = (semanas ?? []) as { bucket: string }[]
  expect(s.length).toBeGreaterThan(0)
  // O balde da semana começa na segunda-feira.
  expect(new Date(s[0]!.bucket).getUTCDay()).toBe(1)
})
