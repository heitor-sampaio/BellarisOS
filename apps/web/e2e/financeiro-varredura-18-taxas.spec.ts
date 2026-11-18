import { test, expect } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { responderAnamnese } from './apoio/anamnese'

/**
 * A varredura de conformidade de 18/11 — as taxas da maquininha e os caminhos
 * do dinheiro que gravavam fora da regra (vendas-financeiro.md §9.6, C75):
 *
 * - VF2-01: as vezes do cartão são `cartao_vezes` (nulo = 1x), nunca a
 *   `parcela_total` do crediário — a parcela 2/3 paga no crédito à vista era
 *   "Crédito 3x" nos avisos, na comissão e no DRE.
 * - VF2-02: o lançamento já gravado fica com a taxa que tem — o Pix, o débito
 *   e o crédito 1x ganham o retrato (`taxa_pct_retrato`); trocar a taxa da
 *   maquininha não muda o passado.
 * - VF2-03: com produto na comanda, o atendimento não se abate do pacote (só a
 *   tela do PDV barrava).
 * - VF2-04: `plano_receber` grava a bandeira e a maquininha na mesma transação.
 * - VF-01: o pagamento NOVO do usado (aqui, o estorno da venda de crédito) leva
 *   a maquininha escolhida — o banco punha a primeira.
 *
 * Numa rede [e2e] própria, pelo banco (as funções, como a action as chama).
 */

test.describe.configure({ mode: 'serial' })

const marca = Date.now().toString(36)
const db = () => banco()
const n = (v: unknown) => Number(v ?? 0)
let rede: OutraRede | null = null
let primeira = ''
let segunda = ''
let pacoteId = ''

const inicioDeHoje = () => new Date(Date.now() - 6 * 3_600_000).toISOString()
const fimDeHoje = () => new Date(Date.now() + 6 * 3_600_000).toISOString()

async function lancamento(campos: Record<string, unknown>) {
  const { data, error } = await db().from('financial_transactions').insert({
    branch_id: rede!.branchId, type: 'INCOME', category: 'Atendimento', is_paid: true,
    paid_at: new Date().toISOString(), created_by: 'e2e', ...campos,
  }).select('id, taxa_pct_retrato').single<{ id: string; taxa_pct_retrato: number | string | null }>()
  expect(error, 'lançar').toBeNull()
  return data!
}

async function taxasPorMaquininha() {
  const { data, error } = await db().rpc('metrics_taxas_por_maquininha', {
    p_tenant: rede!.tenantId, p_branch: rede!.branchId, p_from: inicioDeHoje(), p_to: fimDeHoje(),
  })
  expect(error).toBeNull()
  return new Map(((data ?? []) as { maquininha: string; bruto: number; taxa: number }[]).map(l => [l.maquininha, [n(l.bruto), n(l.taxa)]]))
}

test.beforeAll(async () => {
  test.setTimeout(150_000)
  rede = await criarOutraRede(`vf18${marca}`)
  const { data: m } = await db().from('maquininhas').select('id').eq('tenant_id', rede.tenantId).single<{ id: string }>()
  primeira = m!.id
  // A primeira: só o crédito 1x (3%). Uma parcela lida como "3x" fica SEM taxa.
  expect((await db().from('maquininhas').update({ nome: 'Primeira', taxas: { 'CREDIT_CARD:1': 3 } }).eq('id', primeira)).error).toBeNull()
  const { data: s, error } = await db().from('maquininhas')
    .insert({ tenant_id: rede.tenantId, nome: 'Segunda', ordem: 1, taxas: { 'DEBIT_CARD:1': 2, 'CREDIT_CARD:1': 4 }, prazo_dias: 1 })
    .select('id').single<{ id: string }>()
  expect(error).toBeNull()
  segunda = s!.id
})

test.afterAll(async () => {
  if (!rede) return
  const falhas: string[] = []
  const { data: cps } = await db().from('client_packages').select('id').eq('branch_id', rede.branchId)
  const ids = (cps ?? []).map(c => c.id as string)
  if (ids.length) {
    const r1 = await db().from('package_sessions').delete().in('client_package_id', ids)
    if (r1.error) falhas.push(`sessões: ${r1.error.message}`)
    const r2 = await db().from('financial_transactions').update({ client_package_id: null }).in('client_package_id', ids)
    if (r2.error) falhas.push(`lançamentos: ${r2.error.message}`)
    const r3 = await db().from('commission_lines').update({ client_package_id: null }).in('client_package_id', ids)
    if (r3.error) falhas.push(`linhas de comissão: ${r3.error.message}`)
    const r4 = await db().from('client_packages').delete().in('id', ids)
    if (r4.error) falhas.push(`pacotes do cliente: ${r4.error.message}`)
  }
  if (pacoteId) {
    const r5 = await db().from('service_packages').delete().eq('tenant_id', rede.tenantId)
    if (r5.error) falhas.push(`pacotes: ${r5.error.message}`)
  }
  await rede.limpar()
  expect(falhas).toEqual([])
})

test('VF2-01: a parcela do crediário paga no crédito à vista é crédito 1x, não "Crédito 3x"', async () => {
  const cliente = await rede!.criarCliente(`Parcela ${marca}`)
  const parcela = await lancamento({
    client_id: cliente, description: `Parcela 2/3 ${marca}`, amount: 100,
    payment_method: 'CREDIT_CARD', maquininha_id: primeira,
    parcela_numero: 2, parcela_total: 3, parcela_grupo: crypto.randomUUID(),
  })
  // O retrato é a taxa do 1x.
  expect(n(parcela.taxa_pct_retrato)).toBe(3)
  // O aviso "Sem taxa" não acusa um "Crédito 3x" que não houve.
  const { data: semTaxa, error } = await db().rpc('metrics_vendas_sem_taxa_do_fechamento', {
    p_tenant: rede!.tenantId, p_branch: rede!.branchId, p_from: inicioDeHoje(), p_to: fimDeHoje(),
  })
  expect(error).toBeNull()
  expect(((semTaxa ?? []) as { metodo: string; vezes: number }[]).filter(l => l.metodo === 'CREDIT_CARD')).toEqual([])
  // A taxa da primeira no dia: 3% de R$ 100.
  expect((await taxasPorMaquininha()).get('Primeira')).toEqual([100, 3])
})

test('VF2-02: trocar a taxa da maquininha não muda a taxa do débito já recebido', async () => {
  const debito = await lancamento({ description: `Débito ${marca}`, amount: 200, payment_method: 'DEBIT_CARD', maquininha_id: segunda })
  expect(n(debito.taxa_pct_retrato), 'o retrato do débito').toBe(2)
  expect((await taxasPorMaquininha()).get('Segunda')).toEqual([200, 4])
  // A rede passa o débito da Segunda para 5%: o que já entrou fica com os 2%.
  expect((await db().from('maquininhas').update({ taxas: { 'DEBIT_CARD:1': 5, 'CREDIT_CARD:1': 4 } }).eq('id', segunda)).error).toBeNull()
  expect((await taxasPorMaquininha()).get('Segunda'), 'o passado não muda').toEqual([200, 4])
  const { data: depois } = await db().from('financial_transactions').select('taxa_pct_retrato').eq('id', debito.id).single<{ taxa_pct_retrato: number }>()
  expect(n(depois!.taxa_pct_retrato)).toBe(2)
  // Um débito novo entra com a taxa nova.
  const novo = await lancamento({ description: `Débito novo ${marca}`, amount: 100, payment_method: 'DEBIT_CARD', maquininha_id: segunda })
  expect(n(novo.taxa_pct_retrato)).toBe(5)
})

test('VF2-03: com produto na comanda, o atendimento não se abate do pacote', async () => {
  const cliente = await rede!.criarCliente(`Abater ${marca}`)
  const procedimento = rede!.procedureId
  expect((await db().from('commission_configs').upsert({
    tenant_id: rede!.tenantId, desconta_insumos: false, desconta_taxa: false, base_com_pontos: 'PRECO', periodo: 'MENSAL',
  }, { onConflict: 'tenant_id' })).error).toBeNull()
  // O avulso concluído (uma comanda aberta do PDV)…
  const { data: ag, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: cliente, professional_id: rede!.professionalId, procedure_id: procedimento,
    scheduled_at: new Date().toISOString(), duration_min: 30, price: 150, status: 'IN_PROGRESS', source: 'INTERNAL',
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  await responderAnamnese(cliente, rede!.tenantId)
  expect((await db().rpc('concluir_atendimento', {
    p_agendamento: ag!.id, p_tenant: rede!.tenantId, p_ator: null, p_ator_nome: null,
    p_dados: { insumos: [], comissoes: [{ procedure_id: procedimento, origem: 'AVULSO', treatment_plan_id: null, regra_tipo: 'PERCENTAGE', regra_valor: 10, preco: 150 }] },
  })).error, 'concluir').toBeNull()
  // … com um produto ainda a receber.
  const { data: comanda } = await db().from('comandas').select('id').eq('appointment_id', ag!.id).is('cancelada_em', null).single<{ id: string }>()
  const { data: produto } = await db().from('products')
    .insert({ tenant_id: rede!.tenantId, name: `${PREFIXO} Sérum ${marca}`, unit: 'un', uso: 'REVENDA', sale_price: 120 })
    .select('id').single<{ id: string }>()
  expect((await db().from('comanda_itens').insert({
    tenant_id: rede!.tenantId, branch_id: rede!.branchId, comanda_id: comanda!.id, product_id: produto!.id, quantidade: 1,
  })).error).toBeNull()
  // O pacote com o mesmo procedimento.
  const { data: pac, error: ePac } = await db().rpc('pacote_salvar', {
    p_tenant: rede!.tenantId, p_id: null, p_nome: `${PREFIXO} 2 sessões ${marca}`, p_preco: 200, p_validade: null, p_ativo: true,
    p_itens: [{ procedure_id: procedimento, quantity: 2 }],
  })
  expect(ePac, 'criar o pacote').toBeNull()
  pacoteId = pac as string
  const { data: cp, error: eV } = await db().rpc('pacote_vender', {
    p_tenant: rede!.tenantId, p_cliente: cliente, p_pacote: pacoteId, p_unidade: rede!.branchId, p_ator: null,
    p_lancamentos: [{ amount: 200, payment_method: 'PIX', is_paid: true }],
    p_sessoes: [{ procedure_id: procedimento, preco: 100 }, { procedure_id: procedimento, preco: 100 }],
  })
  expect(eV, 'vender o pacote').toBeNull()
  const { data: sessao } = await db().from('package_sessions').select('id').eq('client_package_id', cp as string)
    .eq('status', 'AVAILABLE').order('session_number').limit(1).single<{ id: string }>()

  const abater = await db().rpc('atendimento_abater_do_pacote', {
    p_agendamento: ag!.id, p_sessao: sessao!.id, p_tenant: rede!.tenantId, p_ator: null, p_ator_nome: null,
  })
  expect(abater.error?.message ?? '').toContain('Com produto na comanda')
  // Nada mudou: a sessão segue livre.
  const { data: s } = await db().from('package_sessions').select('status, appointment_id').eq('id', sessao!.id).single<{ status: string; appointment_id: string | null }>()
  expect([s!.status, s!.appointment_id]).toEqual(['AVAILABLE', null])
})

test('VF2-04: o recebimento do plano grava a bandeira e a maquininha na mesma função', async () => {
  const { planId, clientId } = await rede!.criarPlanoProposto(`Receber ${marca}`, { semTermo: true })
  const { data: aberto, error } = await db().from('financial_transactions').insert({
    branch_id: rede!.branchId, client_id: clientId, treatment_plan_id: planId, type: 'INCOME', category: 'Serviços',
    description: `Plano ${marca}`, amount: 300, is_paid: false, created_by: 'e2e',
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  const r = await db().rpc('plano_receber', {
    p_tenant: rede!.tenantId, p_plano: planId, p_pendentes: [aberto!.id], p_esperado: 300, p_forma: 'AVISTA',
    p_metodo: 'CREDIT_CARD', p_vezes: 1, p_lancamentos: null, p_ator: null,
    p_bandeira: 'VISA', p_maquininha: segunda,
  })
  expect(r.error).toBeNull()
  const { data: pago } = await db().from('financial_transactions')
    .select('is_paid, payment_method, cartao_bandeira, maquininha_id').eq('id', aberto!.id)
    .single<{ is_paid: boolean; payment_method: string; cartao_bandeira: string | null; maquininha_id: string | null }>()
  expect(pago).toEqual({ is_paid: true, payment_method: 'CREDIT_CARD', cartao_bandeira: 'VISA', maquininha_id: segunda })
})

test('VF-01: o pagamento novo do estorno da venda de crédito leva a maquininha escolhida', async () => {
  const cliente = await rede!.criarCliente(`Credito ${marca}`)
  const { data: venda, error } = await db().rpc('credito_vender', {
    p_tenant: rede!.tenantId, p_cliente: cliente, p_unidade: rede!.branchId, p_valor: 200,
    p_metodo: 'PIX', p_vezes: 1, p_bandeira: null, p_ator: null, p_ator_nome: 'e2e',
  })
  expect(error).toBeNull()
  expect((await db().from('internal_credits').insert({ client_id: cliente, branch_id: rede!.branchId, amount: -50, description: 'uso e2e' })).error).toBeNull()
  const inteiro = await db().rpc('credito_estornar_venda', {
    p_tenant: rede!.tenantId, p_venda: venda, p_ator: null, p_ator_nome: 'e2e', p_motivo: 'e2e',
    p_esperado: 150, p_simular: false, p_estorno: 'INTEIRO',
    p_novo: { metodo: 'DEBIT_CARD', vezes: 1, bandeira: null, maquininha: segunda },
  })
  expect(inteiro.error).toBeNull()
  const { data: txs } = await db().from('financial_transactions')
    .select('amount, payment_method, maquininha_id, notes, category')
    .eq('client_id', cliente).not('credito_vendido_id', 'is', null).order('created_at')
  const novo = (txs ?? []).filter(t => t.notes !== 'Estornada' && t.category !== 'Estorno')
  expect(novo.map(t => [n(t.amount), t.payment_method, t.maquininha_id])).toEqual([[50, 'DEBIT_CARD', segunda]])
})
