import { test, expect } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * O Relatório de Vendas (`metrics_vendas`), dois achados da 25ª simulação:
 *
 * - O plano entrava em Vendas no primeiro lançamento de receita, PAGO OU NÃO:
 *   no crediário, a parcela em aberto já fazia a venda. O Heitor, 18/11:
 *   "Obviamente que no recebimento. Uma coisa só foi vendida se foi paga."
 *   Agora: o primeiro lançamento pago do plano, que não é estorno nem
 *   estornado, na data do pagamento (a régua do "Comprou" do CRM).
 * - D5: a forma "Crédito na clínica" voltou (CLAUDE.md §1). É "Crédito
 *   interno".
 *
 * Numa rede [e2e] própria.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
const horas = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString()

async function plano(nome: string) {
  const { data, error } = await db().from('treatment_plans').insert({
    branch_id: rede!.branchId, professional_id: rede!.professionalId, client_id: await rede!.criarCliente(`Cliente ${nome}`),
    status: 'ACCEPTED', name: `${PREFIXO} ${nome} ${marca}`, aceito_em: horas(-5),
  }).select('id').single<{ id: string }>()
  expect(error, `plano ${nome}`).toBeNull()
  const s = await db().from('treatment_plan_sessions').insert({ plan_id: data!.id, sort_order: 0 }).select('id').single<{ id: string }>()
  expect(s.error).toBeNull()
  expect((await db().from('treatment_plan_session_procedures').insert({ session_id: s.data!.id, procedure_id: rede!.procedureId, price: 600, sort_order: 0 })).error).toBeNull()
  return data!.id
}

async function receita(planoId: string, campos: Record<string, unknown>) {
  const { data, error } = await db().from('financial_transactions').insert({
    branch_id: rede!.branchId, type: 'INCOME', category: 'e2e', amount: 300, created_by: 'e2e',
    description: `${PREFIXO} Recebimento ${marca}`, treatment_plan_id: planoId, created_at: horas(-4), ...campos,
  }).select('id').single<{ id: string }>()
  expect(error, error?.message).toBeNull()
  return data!.id
}

async function vendas() {
  const { data, error } = await db().rpc('metrics_vendas', {
    p_tenant: rede!.tenantId, p_branch_ids: null, p_from: horas(-24), p_to: horas(24), p_professional_id: null,
  })
  expect(error).toBeNull()
  return data as { id: string; tipo: string; data: string; descricao: string }[]
}

test.beforeAll(async () => {
  test.setTimeout(120_000)
  rede = await criarOutraRede(`vpr${marca}`)
})

test.afterAll(async () => {
  test.setTimeout(120_000)
  await rede?.limpar()
})

test('o plano entra em Vendas no primeiro recebimento PAGO, na data do pagamento', async () => {
  // No crediário: as parcelas em aberto não são venda.
  const noCrediario = await plano('Crediario')
  const parcela = await receita(noCrediario, { is_paid: false, due_date: horas(24 * 30).slice(0, 10) })
  // Só um recebimento estornado: não é venda.
  const estornado = await plano('Estornado')
  await receita(estornado, { is_paid: true, paid_at: horas(-3), notes: 'Estornada' })
  // O controle: pago, entra — na data do pagamento, não na do lançamento.
  const pago = await plano('Pago')
  const pagoEm = horas(-2)
  await receita(pago, { is_paid: true, paid_at: pagoEm })

  let planos = (await vendas()).filter(v => v.tipo === 'PLANO')
  expect(planos.map(v => v.id), 'o pago entra').toContain(pago)
  expect(new Date(planos.find(v => v.id === pago)!.data).toISOString(), 'na data do pagamento').toBe(pagoEm)
  expect(planos.map(v => v.id), 'a parcela em aberto não é venda').not.toContain(noCrediario)
  expect(planos.map(v => v.id), 'o estornado não é venda').not.toContain(estornado)

  // A primeira parcela paga faz a venda, no dia em que o dinheiro entrou.
  const pagaEm = horas(-1)
  expect((await db().from('financial_transactions').update({ is_paid: true, paid_at: pagaEm }).eq('id', parcela)).error).toBeNull()
  planos = (await vendas()).filter(v => v.tipo === 'PLANO')
  expect(planos.map(v => v.id), 'paga a parcela, vira venda').toContain(noCrediario)
  expect(new Date(planos.find(v => v.id === noCrediario)!.data).toISOString()).toBe(pagaEm)
})

test('D5: o crédito vendido aparece como "Crédito interno"', async () => {
  const cliente = await rede!.criarCliente('Credito')
  const cv = await db().from('creditos_vendidos').insert({
    tenant_id: rede!.tenantId, branch_id: rede!.branchId, client_id: cliente, valor: 150, registrado_por_nome: 'e2e',
  }).select('id').single<{ id: string }>()
  expect(cv.error, cv.error?.message).toBeNull()
  const linha = (await vendas()).find(v => v.id === cv.data!.id)
  expect(linha?.descricao, 'a forma do crédito').toBe('Crédito interno')
})
