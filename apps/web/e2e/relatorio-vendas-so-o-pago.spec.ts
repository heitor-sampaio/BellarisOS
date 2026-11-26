import { test, expect } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * D6 (o Heitor, 18/11, sobre a 25ª simulação): "nao pago nao conta na venda".
 *
 * O relatório de Vendas (`metrics_vendas`) contava o atendimento avulso
 * concluído e o pacote, o pré-pago, o produto e o crédito vendidos AINDA NÃO
 * pagos. Agora todo tipo segue a régua do plano (20261124900002): a venda
 * entra quando há dinheiro pago dela — o primeiro lançamento de receita ligado
 * a ela, pago, que não é estorno nem estornado, com algum valor — e na DATA
 * desse recebimento. O valor não muda.
 *
 * Numa rede [e2e] própria.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
const horas = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString()

type Ligacao = Record<string, string>
type Linha = { id: string; tipo: string; data: string; valor: number | string }

async function receber(ligacao: Ligacao, campos: Record<string, unknown>) {
  const { data, error } = await db().from('financial_transactions').insert({
    branch_id: rede!.branchId, type: 'INCOME', category: 'e2e', amount: 100, created_by: 'e2e',
    description: `${PREFIXO} Recebimento ${marca}`, created_at: horas(-4), payment_method: 'PIX', ...ligacao, ...campos,
  }).select('id').single<{ id: string }>()
  expect(error, error?.message).toBeNull()
  return data!.id
}

/** Uma venda de cada tipo; devolve o id da linha em `metrics_vendas` e a ligação do pagamento. */
async function vender(tipo: string, rotulo: string): Promise<{ id: string; ligacao: Ligacao }> {
  const cliente = await rede!.criarCliente(`${tipo} ${rotulo}`)
  const vendidoEm = horas(-5)
  if (tipo === 'PROCEDIMENTO') {
    const { data, error } = await db().from('appointments').insert({
      branch_id: rede!.branchId, client_id: cliente, procedure_id: rede!.procedureId, professional_id: rede!.professionalId,
      duration_min: 30, status: 'COMPLETED', source: 'INTERNAL', price: 100, scheduled_at: vendidoEm, completed_at: vendidoEm,
    }).select('id').single<{ id: string }>()
    expect(error, error?.message).toBeNull()
    return { id: data!.id, ligacao: { client_id: cliente, appointment_id: data!.id } }
  }
  if (tipo === 'PACOTE') {
    const sp = await db().from('service_packages').insert({
      tenant_id: rede!.tenantId, procedure_id: rede!.procedureId, name: `${PREFIXO} Pacote ${rotulo} ${marca}`, total_sessions: 2, price: 100,
    }).select('id').single<{ id: string }>()
    expect(sp.error, sp.error?.message).toBeNull()
    const { data, error } = await db().from('client_packages').insert({
      client_id: cliente, package_id: sp.data!.id, branch_id: rede!.branchId, purchased_at: vendidoEm,
      total_sessions: 2, used_sessions: 0, price: 100, preco_tabela: 100, desconto: 0, sold_by: rede!.professionalId,
    }).select('id').single<{ id: string }>()
    expect(error, error?.message).toBeNull()
    return { id: data!.id, ligacao: { client_id: cliente, client_package_id: data!.id } }
  }
  if (tipo === 'PRE_PAGO') {
    const { data, error } = await db().from('procedure_sales').insert({
      tenant_id: rede!.tenantId, branch_id: rede!.branchId, client_id: cliente, procedure_id: rede!.procedureId,
      quantity: 1, preco_unitario_tabela: 100, preco_tabela: 100, desconto: 0, price: 100,
      sold_by: rede!.professionalId, sold_at: vendidoEm,
    }).select('id').single<{ id: string }>()
    expect(error, error?.message).toBeNull()
    return { id: data!.id, ligacao: { client_id: cliente, procedure_sale_id: data!.id } }
  }
  if (tipo === 'PRODUTO') {
    const produto = await rede!.criarProduto(`Produto ${rotulo}`)
    const { data, error } = await db().from('product_sales').insert({
      tenant_id: rede!.tenantId, branch_id: rede!.branchId, client_id: cliente, product_id: produto, quantity: 1,
      preco_unitario: 100, preco_tabela: 100, desconto: 0, price: 100, custo: 10, sold_by: rede!.professionalId, sold_at: vendidoEm,
    }).select('id').single<{ id: string }>()
    expect(error, error?.message).toBeNull()
    return { id: data!.id, ligacao: { client_id: cliente, product_sale_id: data!.id } }
  }
  const { data, error } = await db().from('creditos_vendidos').insert({
    tenant_id: rede!.tenantId, branch_id: rede!.branchId, client_id: cliente, valor: 100,
    registrado_por_nome: 'e2e', created_at: vendidoEm,
  }).select('id').single<{ id: string }>()
  expect(error, error?.message).toBeNull()
  return { id: data!.id, ligacao: { client_id: cliente, credito_vendido_id: data!.id } }
}

async function vendas(): Promise<Linha[]> {
  const { data, error } = await db().rpc('metrics_vendas', {
    p_tenant: rede!.tenantId, p_branch_ids: null, p_from: horas(-24), p_to: horas(24), p_professional_id: null,
  })
  expect(error, error?.message).toBeNull()
  return (data ?? []) as Linha[]
}

const TIPOS = ['PROCEDIMENTO', 'PACOTE', 'PRE_PAGO', 'PRODUTO', 'CREDITO'] as const

test.beforeAll(async () => {
  test.setTimeout(180_000)
  rede = await criarOutraRede(`vsp${marca}`)
})

test.afterAll(async () => {
  test.setTimeout(120_000)
  await rede?.limpar()
})

test('a venda não paga fica fora; a paga entra no dia do primeiro recebimento pago — em todos os tipos', async () => {
  test.setTimeout(180_000)
  const casos: { tipo: string; pago: string; pagoEm: string; aberto: string; abertoTx: string; estornado: string }[] = []
  for (const tipo of TIPOS) {
    // A paga: vendida há 5h, paga há 2h — entra na data do pagamento.
    const pago = await vender(tipo, 'Paga')
    const pagoEm = horas(-2)
    await receber(pago.ligacao, { is_paid: true, paid_at: pagoEm })
    // A em aberto: só a parcela a receber.
    const aberto = await vender(tipo, 'Aberta')
    const abertoTx = await receber(aberto.ligacao, { is_paid: false, due_date: horas(24 * 30).slice(0, 10) })
    // A de pagamento único estornado inteiro.
    const estornado = await vender(tipo, 'Estornada')
    await receber(estornado.ligacao, { is_paid: true, paid_at: horas(-3), notes: 'Estornada' })
    casos.push({ tipo, pago: pago.id, pagoEm, aberto: aberto.id, abertoTx, estornado: estornado.id })
  }

  let linhas = await vendas()
  for (const c of casos) {
    const doTipo = linhas.filter(l => l.tipo === c.tipo)
    const paga = doTipo.find(l => l.id === c.pago)
    expect(paga, `${c.tipo}: a paga entra`).toBeTruthy()
    expect(new Date(paga!.data).toISOString(), `${c.tipo}: na data do pagamento, não na da venda`).toBe(c.pagoEm)
    expect(Number(paga!.valor), `${c.tipo}: o valor não muda`).toBe(100)
    expect(doTipo.map(l => l.id), `${c.tipo}: a não paga não é venda`).not.toContain(c.aberto)
    expect(doTipo.map(l => l.id), `${c.tipo}: a do único pagamento estornado não é venda`).not.toContain(c.estornado)
  }

  // O resumo bate: só as pagas. O "Total vendido" (o geral) soma o crédito vendido também (o Heitor, 25/11:
  // "se o crédito foi vendido, é venda, tem que contar, não conta é quando só usa").
  const { data: resumo, error } = await db().rpc('metrics_vendas_resumo', {
    p_tenant: rede!.tenantId, p_branch_ids: null, p_from: horas(-24), p_to: horas(24), p_professional_id: null,
  })
  expect(error).toBeNull()
  const porTipo = Object.fromEntries((resumo as { tipo: string | null; quantidade: number; total: number }[])
    .map(r => [r.tipo ?? 'GERAL', { q: Number(r.quantidade), total: Number(r.total) }]))
  for (const tipo of TIPOS) expect(porTipo[tipo], `${tipo} no resumo`).toEqual({ q: 1, total: 100 })
  expect(porTipo.GERAL, 'o Total vendido: as cinco pagas, o crédito também').toEqual({ q: 5, total: 500 })

  // A primeira parcela paga faz a venda, no dia em que o dinheiro entrou.
  const pagaAgora = horas(-1)
  for (const c of casos) {
    expect((await db().from('financial_transactions').update({ is_paid: true, paid_at: pagaAgora }).eq('id', c.abertoTx)).error).toBeNull()
  }
  linhas = await vendas()
  for (const c of casos) {
    const virou = linhas.find(l => l.tipo === c.tipo && l.id === c.aberto)
    expect(virou, `${c.tipo}: paga a parcela, vira venda`).toBeTruthy()
    expect(new Date(virou!.data).toISOString(), `${c.tipo}: no dia do recebimento`).toBe(pagaAgora)
  }
})

/**
 * O Heitor, 25/11: "se o crédito foi vendido, é venda, tem que contar, não conta é quando só usa".
 * O que a cliente paga com o crédito interno não é venda de novo: a venda paga só com ele não entra,
 * e a paga em parte com ele entra no dia do primeiro dinheiro, com o valor menos o pago com crédito.
 */
test('o pago com crédito interno não conta de novo — a venda só com crédito não entra, e a em parte vale o resto', async () => {
  test.setTimeout(180_000)
  const casos: { tipo: string; soCredito: string; emParte: string; dinheiroEm: string }[] = []
  // O saldo que a cliente já tinha (o crédito de fora, sem venda): é dele que sai o pago com crédito.
  const comSaldo = async (ligacao: Ligacao) => {
    const r = await db().from('internal_credits').insert({ client_id: ligacao.client_id, branch_id: rede!.branchId, amount: 100, description: 'Crédito de fora' })
    expect(r.error, r.error?.message).toBeNull()
  }
  for (const tipo of ['PROCEDIMENTO', 'PACOTE', 'PRE_PAGO', 'PRODUTO'] as const) {
    const so = await vender(tipo, 'SoCredito')
    await comSaldo(so.ligacao)
    await receber(so.ligacao, { is_paid: true, paid_at: horas(-3), payment_method: 'INTERNAL_CREDIT' })
    const parte = await vender(tipo, 'EmParte')
    await comSaldo(parte.ligacao)
    await receber(parte.ligacao, { amount: 40, is_paid: true, paid_at: horas(-3), payment_method: 'INTERNAL_CREDIT' })
    const dinheiroEm = horas(-2)
    await receber(parte.ligacao, { amount: 60, is_paid: true, paid_at: dinheiroEm, payment_method: 'PIX' })
    casos.push({ tipo, soCredito: so.id, emParte: parte.id, dinheiroEm })
  }

  const linhas = await vendas()
  for (const c of casos) {
    const doTipo = linhas.filter(l => l.tipo === c.tipo)
    expect(doTipo.map(l => l.id), `${c.tipo}: a paga só com crédito interno não é venda`).not.toContain(c.soCredito)
    const parte = doTipo.find(l => l.id === c.emParte)
    expect(parte, `${c.tipo}: a paga em parte com crédito entra`).toBeTruthy()
    expect(new Date(parte!.data).toISOString(), `${c.tipo}: no dia do primeiro dinheiro`).toBe(c.dinheiroEm)
    expect(Number(parte!.valor), `${c.tipo}: o valor sem a parte paga com crédito`).toBe(60)
  }
})
