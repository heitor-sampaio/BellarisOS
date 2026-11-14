import { test, expect } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * F68 — as contas de lib/metrics que o levantamento das regras achou erradas
 * (C44, C49, C6/C45), provadas no banco, numa rede própria com DUAS unidades.
 *
 * - C44a: o estorno de um pagamento de OUTRO período não faz o ticket médio
 *   ficar negativo — o pago entra só das clientes que pagaram (as do
 *   denominador). Era (500 − 1.000) ÷ 1 = −R$ 500.
 * - C44b: a taxa que o estorno devolve é a GRAVADA no pagamento (a das
 *   parcelas da operadora, procurada pelo `estorno_de`), não a da
 *   configuração de hoje; e o dia do pagamento segue com a taxa dele inteira.
 * - C49: os motivos de perda não contam o funil arquivado; os agendamentos do
 *   comercial contam por `aconteceu_em`; o "Reativar" da unidade mostra a
 *   última visita NA UNIDADE (a inatividade é dela).
 * - C45, revista no Bloco Tags (2026-11-14, T1): a cliente da unidade nas
 *   novas clientes por unidade é a ATENDIDA nela (agendamento não cancelado),
 *   não a tag "Unidade: X" nem a de cadastro; o total da rede conta a clínica
 *   inteira. O público da campanha não tem mais filtro de unidade (MK2).
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let unidadeB = ''
let nomeA = '', nomeB = ''
const DIA = 86_400_000
const agora = Date.now()
const iso = (ms: number) => new Date(ms).toISOString()
const janelaDeHoje = { p_from: iso(agora - DIA / 2), p_to: iso(agora + DIA / 2) }

async function lancar(campos: Record<string, unknown>) {
  const { data, error } = await db().from('financial_transactions').insert({
    branch_id: rede!.branchId, type: 'INCOME', category: 'Serviços', description: `[e2e] ${marca}`,
    is_paid: true, created_by: 'e2e', ...campos,
  }).select('id').single<{ id: string }>()
  expect(error, JSON.stringify(campos)).toBeNull()
  return data!.id
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`f68c${marca}`)
  const { data: a } = await db().from('branches').select('name').eq('id', rede.branchId).single<{ name: string }>()
  nomeA = a!.name
  nomeB = `[e2e] Água Verde ${marca}`
  const { data: b, error } = await db().from('branches')
    .insert({ tenant_id: rede.tenantId, name: nomeB, slug: `e2e-av-${marca}` }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  unidadeB = b!.id
})
test.afterAll(async () => { await rede?.limpar() })

test.describe('F68 — as contas no banco', () => {
  test('C44a: o estorno de outro período não deixa o ticket negativo', async () => {
    const pagou = await rede!.criarCliente('Pagou')
    const estornada = await rede!.criarCliente('Estornada')
    await lancar({ client_id: pagou, amount: 500, payment_method: 'PIX', paid_at: iso(agora) })
    // O pagamento de 40 dias atrás, estornado inteiro hoje.
    const antigo = await lancar({ client_id: estornada, amount: 1000, payment_method: 'PIX', paid_at: iso(agora - 40 * DIA), notes: 'Estornada' })
    await lancar({ client_id: estornada, type: 'EXPENSE', category: 'Estorno', amount: 1000, payment_method: 'PIX', paid_at: iso(agora), estorno_de: antigo })

    const { data, error } = await db().rpc('metrics_ticket_medio', { p_tenant: rede!.tenantId, p_branch_ids: null, ...janelaDeHoje })
    expect(error).toBeNull()
    const total = (data as { branch_id: string | null; pago: number; clientes: number }[]).find(r => r.branch_id === null)!
    // O pago é o da cliente que pagou: R$ 500 ÷ 1 (era −R$ 500 ÷ 1).
    expect([Number(total.pago), Number(total.clientes)]).toEqual([500, 1])
    // A receita do dia continua com o estorno descontado (a regra do caixa não muda).
    const { data: nucleo } = await db().rpc('metrics_core', { p_tenant: rede!.tenantId, p_branch_ids: null, ...janelaDeHoje, p_professional_id: null })
    expect(Number(nucleo![0]!.revenue_cash)).toBe(-500)
  })

  test('C44b: o estorno devolve a taxa GRAVADA no pagamento, e o dia do pagamento fica com a dele', async () => {
    const cliente = await rede!.criarCliente('Cartão')
    const quando = agora - 20 * DIA
    const pagamento = await lancar({ client_id: cliente, amount: 300, payment_method: 'CREDIT_CARD', cartao_vezes: 3, paid_at: iso(quando) })
    const { data: parcelas } = await db().from('recebiveis_do_cartao').select('id').eq('transaction_id', pagamento)
    expect(parcelas, 'as parcelas da operadora nascem com o pagamento').toHaveLength(3)
    // Estornado inteiro hoje (o gatilho cancela as parcelas)...
    const { error: eE } = await db().from('financial_transactions').update({ notes: 'Estornada' }).eq('id', pagamento)
    expect(eE).toBeNull()
    await lancar({ client_id: cliente, type: 'EXPENSE', category: 'Estorno', amount: 300, payment_method: 'CREDIT_CARD', paid_at: iso(agora), estorno_de: pagamento })
    // ... e a taxa GRAVADA na venda era 9% (a configuração da rede, hoje, é 0%).
    const { error: eT } = await db().from('recebiveis_do_cartao').update({ taxa_pct: 9 }).eq('transaction_id', pagamento)
    expect(eT).toBeNull()

    const taxa = async (de: number, ate: number) => {
      const { data, error } = await db().rpc('metrics_custos_da_venda', {
        p_tenant: rede!.tenantId, p_branch_ids: [rede!.branchId], p_from: iso(de), p_to: iso(ate), p_professional_id: null,
      })
      expect(error).toBeNull()
      return Number((data as { branch_id: string | null; taxas_da_maquininha: number }[]).find(r => r.branch_id === null)!.taxas_da_maquininha)
    }
    // No dia do pagamento, a taxa dele inteira (9% de 300); no dia do estorno, ela sai.
    expect(await taxa(quando - DIA / 2, quando + DIA / 2)).toBe(27)
    expect(await taxa(agora - DIA / 2, agora + DIA / 2)).toBe(-27)
    // O gráfico (a série) diz o mesmo.
    const { data: serie, error: eS } = await db().rpc('metrics_series_dos_custos_da_venda', {
      p_tenant: rede!.tenantId, p_branch_ids: [rede!.branchId], p_from: iso(agora - DIA / 2), p_to: iso(agora + DIA / 2), p_granularity: 'day', p_professional_id: null,
    })
    expect(eS).toBeNull()
    expect((serie as { taxas_da_maquininha: number }[]).reduce((t, r) => t + Number(r.taxas_da_maquininha), 0)).toBe(-27)
  })

  test('C49: os motivos de perda não contam o funil arquivado', async () => {
    const { data: f } = await db().from('crm_funnels')
      .insert({ tenant_id: rede!.tenantId, name: `[e2e] Arquivado ${marca}`, archived_at: iso(agora) }).select('id').single<{ id: string }>()
    const { data: st } = await db().from('crm_stages')
      .insert({ tenant_id: rede!.tenantId, funnel_id: f!.id, name: 'Perdido', outcome: 'LOST' }).select('id').single<{ id: string }>()
    const { data: m } = await db().from('crm_motivos_perda')
      .insert({ tenant_id: rede!.tenantId, nome: `[e2e] Caro ${marca}` }).select('id').single<{ id: string }>()
    const { data: ct } = await db().from('contacts').insert({ tenant_id: rede!.tenantId, name: `[e2e] Lead ${marca}` }).select('id').single<{ id: string }>()
    const { error } = await db().from('leads').insert({
      tenant_id: rede!.tenantId, name: `[e2e] Lead ${marca}`, contato_id: ct!.id, crm_stage_id: st!.id,
      motivo_perda_id: m!.id, perdido_em: iso(agora),
    })
    expect(error).toBeNull()
    const { data, error: eM } = await db().rpc('metrics_motivos_de_perda', { p_tenant: rede!.tenantId, ...janelaDeHoje, p_owner: null })
    expect(eM).toBeNull()
    expect(data).toEqual([])
  })

  test('C49: o agendamento do comercial conta quando ACONTECEU (aconteceu_em), não no dia marcado', async () => {
    const cliente = await rede!.criarCliente('Comercial')
    // Marcado para daqui a 10 dias, concluído hoje (o encaixe adiantou).
    const { error } = await db().from('appointments').insert({
      branch_id: rede!.branchId, client_id: cliente, procedure_id: rede!.procedureId, professional_id: rede!.professionalId,
      status: 'COMPLETED', source: 'COMMERCIAL', duration_min: 30, price: 0,
      scheduled_at: iso(agora + 10 * DIA), completed_at: iso(agora),
    })
    expect(error).toBeNull()
    const { data, error: eC } = await db().rpc('metrics_comercial', { p_tenant: rede!.tenantId, p_branch_ids: [rede!.branchId], ...janelaDeHoje, p_owner: null })
    expect(eC).toBeNull()
    const d = data as { agendados: number; realizados: number }
    expect([d.agendados, d.realizados]).toEqual([1, 1])
  })

  test('C49: o "Reativar" da unidade mostra a última visita NELA, não a de outra unidade', async () => {
    const cliente = await rede!.criarCliente('Sumida da A')
    const { error: eData } = await db().from('clients').update({ created_at: iso(agora - 200 * DIA) }).eq('id', cliente)
    expect(eData).toBeNull()
    const visita = (unidade: string, dias: number) => db().from('appointments').insert({
      branch_id: unidade, client_id: cliente, procedure_id: rede!.procedureId, professional_id: rede!.professionalId,
      status: 'COMPLETED', source: 'INTERNAL', duration_min: 30, price: 0,
      scheduled_at: iso(agora - dias * DIA), completed_at: iso(agora - dias * DIA),
    })
    expect((await visita(rede!.branchId, 120)).error).toBeNull()
    expect((await visita(unidadeB, 10)).error).toBeNull()
    // A cliente da unidade é a atendida nela (T1 do Bloco Tags, 2026-11-14).
    const { data, error } = await db().rpc('metrics_clientes_para_reativar', {
      p_tenant: rede!.tenantId, p_branch_id: rede!.branchId,
      p_desde: iso(agora - 90 * DIA), p_limite: 50, p_professional_id: null,
    })
    expect(error).toBeNull()
    const dela = (data as { lista: { id: string; ultima_visita: string }[] }).lista.find(c => c.id === cliente)
    expect(dela, 'sumida da unidade A há 120 dias').toBeTruthy()
    // A última visita NA UNIDADE: há 120 dias (era a de 10 dias atrás, na B).
    const dias = Math.round((agora - new Date(dela!.ultima_visita).getTime()) / DIA)
    expect(dias).toBe(120)
  })

  test('MK2: o público da campanha e da automação não recorta por unidade (o branch_ids gravado antes é ignorado)', async () => {
    const cliente = await rede!.criarCliente('Só vai à B')
    const publico = async (unidade: string) => {
      const { data, error: e } = await db().rpc('clientes_do_publico', { p_tenant: rede!.tenantId, p_filtros: { branch_ids: [unidade], client_ids: [cliente] } })
      expect(e).toBeNull()
      return (data as { id: string }[]).map(c => c.id)
    }
    expect(await publico(unidadeB)).toEqual([cliente])
    expect(await publico(rede!.branchId)).toEqual([cliente])
  })

  test('T1/C45: as novas clientes de cada unidade são as atendidas nela (não a tag); o total da rede, a clínica inteira', async () => {
    // Uma nova atendida só na B (cadastrada na A, com a tag "Unidade: A" — que
    // não conta), uma nas duas, uma sem atendimento, uma com o da B cancelado.
    const soB = await rede!.criarCliente('Nova da B')
    const duas = await rede!.criarCliente('Nova das duas')
    const nenhuma = await rede!.criarCliente('Nova sem unidade')
    const cancelada = await rede!.criarCliente('Nova cancelada na B')
    await db().from('clients').update({ tags: [`Unidade: ${nomeA}`] }).eq('id', soB)
    await db().from('clients').update({ tags: [], branch_id: null }).eq('id', nenhuma)
    const marcar = async (cliente: string, unidade: string, status = 'SCHEDULED') => {
      const { error } = await db().from('appointments').insert({
        branch_id: unidade, client_id: cliente, procedure_id: rede!.procedureId, professional_id: rede!.professionalId,
        status, source: 'INTERNAL', duration_min: 30, price: 0, scheduled_at: iso(agora + 3 * DIA),
      })
      expect(error).toBeNull()
    }
    await marcar(soB, unidadeB)
    await marcar(duas, rede!.branchId)
    await marcar(duas, unidadeB)
    await marcar(cancelada, unidadeB, 'CANCELLED')
    const novas = async (unidades: string[] | null) => {
      const { data, error } = await db().rpc('metrics_core', { p_tenant: rede!.tenantId, p_branch_ids: unidades, ...janelaDeHoje, p_professional_id: null })
      expect(error).toBeNull()
      return Number(data![0]!.new_clients)
    }
    const { data: todas } = await db().from('clients').select('id, created_at').eq('tenant_id', rede!.tenantId).gte('created_at', janelaDeHoje.p_from)
    const ids = (todas ?? []).map(c => c.id as string)
    const { data: ags } = await db().from('appointments').select('client_id, branch_id, status').in('client_id', ids)
    const atendidasEm = (u: string) => new Set((ags ?? []).filter(a => a.branch_id === u && a.status !== 'CANCELLED').map(a => a.client_id as string)).size
    expect(await novas([unidadeB])).toBe(atendidasEm(unidadeB))
    expect(await novas([rede!.branchId])).toBe(atendidasEm(rede!.branchId))
    expect(await novas(null)).toBe((todas ?? []).length)
    expect(atendidasEm(unidadeB), 'a da B e a das duas; a cancelada não').toBeGreaterThanOrEqual(2)

    // O "Por filial" (metrics_by_branch) conta a MESMA régua.
    const { data: porUnidade, error } = await db().rpc('metrics_by_branch', { p_tenant: rede!.tenantId, ...janelaDeHoje })
    expect(error).toBeNull()
    const linha = (id: string) => Number((porUnidade as { branch_id: string; new_clients: number }[]).find(l => l.branch_id === id)!.new_clients)
    expect(linha(unidadeB)).toBe(atendidasEm(unidadeB))
    expect(linha(rede!.branchId)).toBe(atendidasEm(rede!.branchId))
  })
})
