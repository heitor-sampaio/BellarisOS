import { test, expect } from '@playwright/test'
import { banco, tenantId, filiaisAtivas, PREFIXO } from './apoio/banco'
import { apagarClientes, apagarAgendamentos } from './apoio/limpeza'

/**
 * Todos os indicadores contra um CENÁRIO CONHECIDO (CLAUDE.md §13.1).
 *
 * `relatorios-coerencia.spec.ts` compara a tela com a mesma RPC — prova que
 * as duas concordam, não que estão CERTAS. Aqui cada número tem um valor
 * esperado escrito à mão. Até 2026-09-27 nada testava despesas, pendente,
 * comissões, retenção, clientes novos, rankings, por unidade nem funil.
 *
 * Isolamento: uma unidade `[e2e]` NA REDE REAL e uma janela em MARÇO DE 2021,
 * antes de qualquer dado real (o banco começa em 2026). Todo registro do
 * cenário tem data explícita dentro (ou, de propósito, fora) dessa janela.
 */

const marca = Date.now().toString(36)
const DE  = '2021-03-01T00:00:00-03:00'
const ATE = '2021-03-31T23:59:59-03:00'
const dia = (d: number, h = 10) => `2021-03-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:00:00-03:00`

interface Cenario {
  tenant: string; unidade: string; profissional: string
  pA: string; pB: string; c1: string; c2: string; c3: string
  agendamentos: string[]; leads: string[]; produtos: string[]
}

const num = (v: unknown) => Number(v ?? 0)
const nums2 = (xs: unknown) => (xs as { procedure_id: string; sessoes: unknown }[]).map(x => [x.procedure_id, num(x.sessoes)])

test.describe.serial('indicadores com cenário conhecido', () => {
  let c: Cenario | null = null

  test.beforeAll(async () => {
    const db = banco()
    const tenant = await tenantId()
    const outra = (await filiaisAtivas())[0]!
    const ins = async <T = { id: string }>(tabela: string, linha: Record<string, unknown>) => {
      const { data, error } = await db.from(tabela).insert(linha).select('id').single()
      expect(error, `criar ${tabela}`).toBeNull()
      return data as T & { id: string }
    }

    const unidade = await ins('branches', { tenant_id: tenant, name: `${PREFIXO} Unidade indicadores ${marca}`, slug: `e2e-ind-${marca}`, is_active: true })
    const { data: prof } = await db.from('users').select('id').eq('tenant_id', tenant).eq('is_active', true).limit(1).single<{ id: string }>()
    const pA = await ins('procedures', { tenant_id: tenant, name: `${PREFIXO} Proc A ${marca}`, category: 'e2e', duration_min: 60, price: 200 })
    const pB = await ins('procedures', { tenant_id: tenant, name: `${PREFIXO} Proc B ${marca}`, category: 'e2e', duration_min: 30, price: 50 })

    // C1: cliente ANTIGO (antes da janela) que volta; C2: novo na unidade;
    // C3: novo, mas de OUTRA unidade — não pode contar como novo desta.
    // C1 tem nascimento: prova a faixa etária dos relatórios (35–44 em 2026).
    const c1 = await ins('clients', { tenant_id: tenant, branch_id: unidade.id, name: `${PREFIXO} Ind C1 ${marca}`, phone: '5548900000001', created_at: '2021-01-15T10:00:00-03:00', birth_date: '1990-06-15' })
    const c2 = await ins('clients', { tenant_id: tenant, branch_id: unidade.id, name: `${PREFIXO} Ind C2 ${marca}`, phone: '5548900000002', created_at: dia(6) })
    const c3 = await ins('clients', { tenant_id: tenant, branch_id: outra.id, name: `${PREFIXO} Ind C3 ${marca}`, phone: '5548900000003', created_at: dia(7) })

    const ag = (cli: string, proc: string, quando: string, status: string, preco: number, dur: number) => ins('appointments', {
      branch_id: unidade.id, client_id: cli, procedure_id: proc, professional_id: prof!.id,
      scheduled_at: quando, duration_min: dur, price: preco, status, source: 'INTERNAL',
    })
    const a0 = await ag(c1.id, pA.id, '2021-02-10T10:00:00-03:00', 'COMPLETED', 999, 60) // antes: faz C1 "voltar"
    const a1 = await ag(c1.id, pA.id, dia(10), 'COMPLETED', 200, 60)
    const a2 = await ag(c2.id, pA.id, dia(11), 'COMPLETED', 100, 30)
    const a3 = await ag(c2.id, pB.id, dia(12), 'CANCELLED', 50, 30)
    const a4 = await ag(c1.id, pB.id, dia(13), 'NO_SHOW', 80, 45)
    const a5 = await ag(c2.id, pB.id, dia(14), 'SCHEDULED', 70, 20)

    const tx = (linha: Record<string, unknown>) => ins('financial_transactions', {
      branch_id: unidade.id, category: 'Serviços', created_by: 'e2e', ...linha,
    })
    await tx({ type: 'INCOME', amount: 200, is_paid: true, paid_at: dia(10), created_at: dia(10), client_id: c1.id, appointment_id: a1.id, payment_method: 'PIX', description: `${PREFIXO} t1` })
    await tx({ type: 'INCOME', amount: 100, is_paid: true, paid_at: dia(11), created_at: dia(11), client_id: c2.id, appointment_id: a2.id, payment_method: 'CREDIT_CARD', description: `${PREFIXO} t2` })
    await tx({ type: 'INCOME', amount: 70, is_paid: false, created_at: dia(12), client_id: c2.id, payment_method: 'PIX', description: `${PREFIXO} t3 pendente` })
    await tx({ type: 'EXPENSE', amount: 40, is_paid: true, paid_at: dia(15), created_at: dia(15), description: `${PREFIXO} t4 despesa` })
    // Um estorno, os dois lados — nenhum pode aparecer em lugar nenhum. Com
    // forma de pagamento: os gráficos por forma somavam o estornado.
    await tx({ type: 'INCOME', amount: 55, is_paid: true, paid_at: dia(16), created_at: dia(16), client_id: c2.id, notes: 'Estornada', payment_method: 'PIX', description: `${PREFIXO} t5 estornada` })
    await tx({ type: 'EXPENSE', category: 'Estorno', amount: 55, is_paid: true, paid_at: dia(16, 11), created_at: dia(16, 11), client_id: c2.id, description: `Estorno: ${PREFIXO} t5 estornada` })
    await tx({ type: 'EXPENSE', amount: 30, is_paid: false, created_at: dia(17), description: `${PREFIXO} t6 despesa pendente` })

    const comissao = (ap: string, amount: number, status: string, quando: string, kind = 'LIBERACAO') => ins('commissions', {
      branch_id: unidade.id, professional_id: prof!.id, appointment_id: ap, amount, type: 'PERCENTAGE', rule_value: 10,
      status, kind, period_ref: quando.slice(0, 7), released_at: quando,
    })
    await comissao(a1.id, 20, 'OPEN', dia(10))
    await comissao(a2.id, 10, 'PAID', dia(11))
    // O período da comissão é o do LANÇAMENTO (released_at), desde 2026-09-30:
    // um ajuste de a1 lançado em ABRIL fica fora de março, e um acerto de a0
    // (atendimento de FEVEREIRO) lançado em março entra. Pelo eixo antigo
    // (scheduled_at do atendimento) seria o contrário.
    await comissao(a1.id, -2, 'OPEN', '2021-04-02T10:00:00-03:00', 'AJUSTE')
    await comissao(a0.id, 5, 'OPEN', dia(12), 'AJUSTE')

    // Estoque: um insumo normal, um crítico, um zerado; o Proc A consome 2 do
    // normal (custo 10 → margem 95% em a1, 90% em a2); e um consumo no dia 10
    // com custo NO MOVIMENTO (4), diferente do de cadastro (5).
    const produto = (nome: string, custo: number) => ins('products', {
      tenant_id: tenant, name: `${PREFIXO} ${nome} ${marca}`, unit: 'un', cost_price: custo, category: `e2e-cat-${marca}`,
    })
    const iOk = await produto('Insumo ok', 5)
    const iCrit = await produto('Insumo crítico', 10)
    const iZero = await produto('Insumo zerado', 2)
    const { error: erroSaldo } = await db.from('branch_product_stock').insert([
      { branch_id: unidade.id, product_id: iOk.id,   current_stock: 10, min_stock: 2 },
      { branch_id: unidade.id, product_id: iCrit.id, current_stock: 1,  min_stock: 2 },
      { branch_id: unidade.id, product_id: iZero.id, current_stock: 0,  min_stock: 0 },
    ])
    expect(erroSaldo).toBeNull()
    const { error: erroInsumo } = await db.from('procedure_products').insert({ procedure_id: pA.id, product_id: iOk.id, quantity: 2 })
    expect(erroInsumo).toBeNull()
    await ins('stock_movements', {
      branch_id: unidade.id, product_id: iOk.id, type: 'PROCEDURE_USAGE', quantity: -3, unit_cost: 4,
      balance_after: 10, created_by: 'e2e', created_at: dia(10, 15),
    })

    // Funil padrão: 2 na 1ª etapa (1 virou cliente) e 1 na de ganho.
    const { data: funil } = await db.from('crm_funnels').select('id').eq('tenant_id', tenant).eq('is_default', true).single<{ id: string }>()
    const { data: etapas } = await db.from('crm_stages').select('id, position, outcome').eq('funnel_id', funil!.id).order('position')
    const primeira = etapas![0]!.id as string
    const ganho = etapas!.find(e => e.outcome === 'WON')!.id as string
    const lead = (nome: string, etapa: string, cliente: string | null, fone: string) => ins('leads', {
      tenant_id: tenant, name: `${PREFIXO} ${nome} ${marca}`, phone: fone, crm_stage_id: etapa,
      branch_id: unidade.id, client_id: cliente, created_at: dia(8),
    })
    const l1 = await lead('Lead 1', primeira, null, '5548911110001')
    const l2 = await lead('Lead 2', primeira, c2.id, '5548911110002')
    const l3 = await lead('Lead 3', ganho, null, '5548911110003')

    c = {
      tenant, unidade: unidade.id, profissional: prof!.id, pA: pA.id, pB: pB.id,
      c1: c1.id, c2: c2.id, c3: c3.id,
      agendamentos: [a0.id, a1.id, a2.id, a3.id, a4.id, a5.id], leads: [l1.id, l2.id, l3.id],
      produtos: [iOk.id, iCrit.id, iZero.id],
    }
  })

  test.afterAll(async () => {
    if (!c) return
    const db = banco()
    const { data: contatos } = await db.from('leads').select('contato_id').in('id', c.leads)
    await db.from('lead_events').delete().in('lead_id', c.leads)
    await db.from('leads').delete().in('id', c.leads)
    const idsContatos = (contatos ?? []).map(x => x.contato_id as string).filter(Boolean)
    if (idsContatos.length) await db.from('contacts').delete().in('id', idsContatos)
    await db.from('commissions').delete().eq('branch_id', c.unidade)
    await db.from('stock_movements').delete().eq('branch_id', c.unidade)
    await db.from('branch_product_stock').delete().eq('branch_id', c.unidade)
    await db.from('procedure_products').delete().in('product_id', c.produtos)
    await db.from('domain_events').delete().in('entidade_id', c.produtos)
    await db.from('products').delete().in('id', c.produtos)
    await db.from('financial_transactions').delete().eq('branch_id', c.unidade)
    const falhas = await apagarAgendamentos(c.agendamentos)
    await apagarClientes([c.c1, c.c2, c.c3], falhas)
    await db.from('procedures').delete().in('id', [c.pA, c.pB])
    await db.from('domain_events').delete().eq('branch_id', c.unidade)
    await db.from('branches').delete().eq('id', c.unidade)
    expect(falhas, 'a limpeza tem de apagar tudo').toEqual([])
  })

  const args = () => ({ p_tenant: c!.tenant, p_branch_ids: [c!.unidade], p_from: DE, p_to: ATE })

  test('núcleo: caixa, pendente, despesa, serviço, agenda, clientes novos e comissões', async () => {
    const { data, error } = await banco().rpc('metrics_core', { ...args(), p_professional_id: null })
    expect(error).toBeNull()
    const r = data![0]!
    expect({
      revenueCash: num(r.revenue_cash), revenuePending: num(r.revenue_pending), expensesCash: num(r.expenses_cash),
      serviceRevenue: num(r.service_revenue), completed: num(r.appointments_completed), total: num(r.appointments_total),
      cancelled: num(r.appointments_cancelled), noShow: num(r.appointments_no_show), minutes: num(r.scheduled_minutes),
      newClients: num(r.new_clients), commOpen: num(r.commissions_open), commPaid: num(r.commissions_paid),
    }).toEqual({
      revenueCash: 300,     // t1 + t2 (o estorno some dos dois lados)
      revenuePending: 70,   // t3
      expensesCash: 40,     // t4 (a despesa pendente e a contra-transação não entram)
      serviceRevenue: 300,  // a1 + a2, preço dos concluídos
      completed: 2, total: 5, cancelled: 1, noShow: 1,
      minutes: 60 + 30 + 20, // cancelado e falta não ocupam agenda
      newClients: 1,        // só C2: C1 é antigo e C3 é de OUTRA unidade
      commOpen: 25, commPaid: 10, // 20 de a1 + 5 do acerto de a0 lançado em março; o −2 é de abril
    })
  })

  test('núcleo com escopo de profissional: só o caixa dos atendimentos dele', async () => {
    const { data } = await banco().rpc('metrics_core', { ...args(), p_professional_id: c!.profissional })
    const r = data![0]!
    expect(num(r.revenue_cash), 't3 pendente e as despesas não têm atendimento').toBe(300)
    expect(num(r.revenue_pending), 'o pendente não tem atendimento').toBe(0)
    expect(num(r.new_clients), 'clientes novos não são do profissional').toBe(0)
  })

  test('séries: por mês e por dia, receita e despesa pagas', async () => {
    const db = banco()
    const { data: mes } = await db.rpc('metrics_series', { ...args(), p_granularity: 'month' })
    expect(mes!.map((b: Record<string, unknown>) => [num(b.revenue), num(b.expenses)])).toEqual([[300, 40]])
    const { data: dias } = await db.rpc('metrics_series', { ...args(), p_granularity: 'day' })
    expect(dias!.map((b: Record<string, unknown>) => [num(b.revenue), num(b.expenses)])).toEqual([[200, 0], [100, 0], [0, 40]])
  })

  test('por unidade: a linha da unidade bate com o núcleo', async () => {
    const { data } = await banco().rpc('metrics_by_branch', { p_tenant: c!.tenant, p_from: DE, p_to: ATE })
    const r = data!.find((l: Record<string, unknown>) => l.branch_id === c!.unidade)!
    expect([num(r.revenue_cash), num(r.revenue_pending), num(r.expenses_cash), num(r.service_revenue), num(r.new_clients)])
      .toEqual([300, 70, 40, 300, 1])
    expect([num(r.commissions_open), num(r.commissions_paid)], 'comissão pelo lançamento, como no núcleo').toEqual([25, 10])
    // Conta TODAS as movimentações da janela, estorno incluído — é contagem de
    // lançamentos, não de dinheiro: t1..t6 e a contra-transação.
    expect(num(r.transactions_count)).toBe(7)
  })

  test('rankings: procedimento, profissional e cliente', async () => {
    const db = banco()
    const { data: procs } = await db.rpc('metrics_top_procedures', { ...args(), p_limit: 5 })
    expect(procs!.map((p: Record<string, unknown>) => [p.procedure_id, num(p.appointments), num(p.revenue), num(p.repeat_visits)]))
      .toEqual([[c!.pA, 2, 300, 0]])

    const { data: profs } = await db.rpc('metrics_top_professionals', { ...args(), p_limit: 5 })
    expect(profs!.map((p: Record<string, unknown>) => [p.professional_id, num(p.appointments), num(p.revenue), num(p.commission)]))
      .toEqual([[c!.profissional, 2, 300, 35]]) // comissão LANÇADA em março: 20 + 10 + 5

    // O ranking de comissão ordena pela comissão (o do dashboard era o top 5
    // por atendimentos, reordenado).
    const { data: ranking, error: eRanking } = await db.rpc('metrics_ranking_comissao', { ...args(), p_limit: 5 })
    expect(eRanking).toBeNull()
    expect(ranking!.map((p: Record<string, unknown>) => [p.professional_id, num(p.commission)])).toEqual([[c!.profissional, 35]])

    const { data: clis } = await db.rpc('metrics_top_clients', { ...args(), p_limit: 10 })
    expect(clis!.map((x: Record<string, unknown>) => [x.client_id, num(x.total_spent), num(x.appointments)]))
      .toEqual([[c!.c1, 200, 1], [c!.c2, 100, 1]])
  })

  test('comissões em detalhe, retenção e clientes novos no tempo', async () => {
    const db = banco()
    const { data: com } = await db.rpc('metrics_commissions_detail', args())
    expect(com!.map((x: Record<string, unknown>) => [num(x.amount), x.is_paid]).sort()).toEqual([[10, true], [20, false], [5, false]])

    const { data: ret } = await db.rpc('metrics_retention', args())
    expect([num(ret![0]!.clients_served), num(ret![0]!.returning_clients), num(ret![0]!.first_time_clients)])
      .toEqual([2, 1, 1]) // C1 já tinha sido atendida antes da janela

    const { data: novos } = await db.rpc('metrics_new_clients_series', { ...args(), p_granularity: 'month' })
    expect(novos!.map((b: Record<string, unknown>) => num(b.count))).toEqual([1])
  })

  test('relatórios, aba por aba: o que cada gráfico desenha (metrics_relatorio)', async () => {
    const db = banco()
    const aba = async (nome: string, granularidade = 'day') => {
      const { data, error } = await db.rpc('metrics_relatorio', {
        ...args(), p_prev_from: '2021-02-01T00:00:00-03:00', p_prev_to: '2021-02-28T23:59:59-03:00',
        p_aba: nome, p_granularidade: granularidade,
      })
      expect(error, `aba ${nome}`).toBeNull()
      return data as Record<string, unknown>
    }
    // Ordena por conteúdo, com as chaves em ordem fixa: o banco devolve as
    // chaves do jsonb na ordem dele, não na do objeto esperado.
    const chave = (x: unknown) => JSON.stringify(Object.entries(x as object).sort(([a], [b]) => a.localeCompare(b)))
    const ordena = <T,>(xs: T[]) => [...xs].sort((a, b) => chave(a).localeCompare(chave(b)))
    const nums = (xs: unknown, campos: string[]) => ordena((xs as Record<string, unknown>[]).map(x =>
      Object.fromEntries(Object.entries(x).map(([k, v]) => [k, campos.includes(k) ? num(v) : v]))))

    // Visão geral: dinheiro do MESMO conjunto do KPI (300) — o estorno de
    // R$ 55 no Pix e o pendente não aparecem em lugar nenhum.
    const geral = await aba('overview')
    expect(nums(geral.receita_por_unidade, ['atual', 'anterior'])).toEqual([{ branch_id: c!.unidade, atual: 300, anterior: 0 }])
    expect(nums(geral.receita_por_forma, ['valor'])).toEqual(ordena([{ forma: 'PIX', valor: 200 }, { forma: 'CREDIT_CARD', valor: 100 }]))
    expect(nums(geral.por_procedimento, ['receita', 'execucoes'])).toEqual([{ nome: `${PREFIXO} Proc A ${marca}`, categoria: 'e2e', receita: 300, execucoes: 2 }])
    expect(nums(geral.por_profissional, ['receita', 'atendimentos']).map(p => [p.receita, p.atendimentos])).toEqual([[300, 2]])
    expect(nums(geral.agendamentos_por_status, ['n'])).toEqual(ordena([
      { status: 'COMPLETED', n: 2 }, { status: 'CANCELLED', n: 1 }, { status: 'NO_SHOW', n: 1 }, { status: 'SCHEDULED', n: 1 },
    ]))
    // Consumo ao custo do MOVIMENTO (3 × 4), não do cadastro (3 × 5).
    expect(num(geral.consumo_total)).toBe(12)
    expect(nums(geral.consumo_por_fatia, ['valor'])).toEqual([{ chave: '2021-03-10', valor: 12 }])

    const financeiro = await aba('financeiro')
    expect(nums(financeiro.receita_por_categoria, ['valor'])).toEqual([{ categoria: 'Serviços', valor: 300 }])

    // Agenda: um atendimento por dia, de quarta (10/03) a domingo (14/03).
    const agenda = await aba('agenda')
    expect(nums(agenda.por_dia_da_semana, ['dia', 'n'])).toEqual(ordena([0, 3, 4, 5, 6].map(dia => ({ dia, n: 1 }))))
    expect(nums(agenda.por_origem, ['n'])).toEqual([{ origem: 'INTERNAL', n: 5 }])
    expect(nums(agenda.agenda_por_unidade, ['total', 'concluidos', 'cancelados', 'faltas']))
      .toEqual([{ branch_id: c!.unidade, total: 5, concluidos: 2, cancelados: 1, faltas: 1 }])

    // Clientes: gasto e ranking do conjunto pago; a base é a rede inteira,
    // conferida contra a contagem direta.
    const clientes = await aba('clientes')
    expect(num(clientes.gasto_medio)).toBe(150)
    expect(nums(clientes.top_clientes, ['total', 'atendimentos'])).toEqual(ordena([
      { nome: `${PREFIXO} Ind C1 ${marca}`, total: 200, atendimentos: 1 },
      { nome: `${PREFIXO} Ind C2 ${marca}`, total: 100, atendimentos: 1 },
    ]))
    const { count: ativos } = await db.from('clients').select('id', { count: 'exact', head: true }).eq('tenant_id', c!.tenant).eq('is_active', true)
    expect(num(clientes.total_ativos)).toBe(ativos)

    // Procedimentos: a faixa etária de C1 (35–44) e margem só com custo.
    const procs = await aba('procedimentos')
    expect(nums(procs.volume_por_faixa, ['n'])).toEqual(ordena([
      { faixa: '35–44', nome: `${PREFIXO} Proc A ${marca}`, n: 1 },
      { faixa: 'Não informado', nome: `${PREFIXO} Proc A ${marca}`, n: 1 },
    ]))
    expect(nums(procs.margem_por_faixa, ['margem'])).toEqual(ordena([
      { faixa: '35–44', nome: `${PREFIXO} Proc A ${marca}`, margem: 95 },
      { faixa: 'Não informado', nome: `${PREFIXO} Proc A ${marca}`, margem: 90 },
    ]))
    const { data: porCategoria, error: erroCategoria } = await db.rpc('metrics_receita_por_categoria_de_procedimento', args())
    expect(erroCategoria).toBeNull()
    expect(nums(porCategoria, ['receita'])).toEqual([{ categoria: 'e2e', receita: 300 }])

    const profs = await aba('profissionais')
    expect(nums(profs.comissoes_por_profissional, ['aberta', 'paga']).map(x => [x.aberta, x.paga])).toEqual([[25, 10]])

    // Estoque: 10×5 + 1×10 + 0×2 = 60; um crítico, um zerado.
    const estoque = await aba('estoque')
    expect([num(estoque.valor_em_estoque), num(estoque.criticos), num(estoque.zerados)]).toEqual([60, 1, 1])
    expect(nums(estoque.valor_por_categoria, ['valor'])).toEqual([{ categoria: `e2e-cat-${marca}`, valor: 60 }])
    expect(nums(estoque.estoque_por_unidade, ['itens', 'zerados', 'criticos', 'valor']))
      .toEqual([{ branch_id: c!.unidade, itens: 3, zerados: 1, criticos: 1, valor: 60 }])
    expect(nums(estoque.mais_consumidos, ['valor'])).toEqual([{ nome: `${PREFIXO} Insumo ok ${marca}`, valor: 12 }])
  })

  test('telas da unidade: sessões por procedimento e clientes para reativar', async () => {
    const db = banco()
    const { data: sessoes } = await db.rpc('metrics_sessoes_por_procedimento', { p_branch_ids: [c!.unidade] })
    // Desde sempre: a0 (fev) conta junto com a1 e a2.
    expect(nums2(sessoes)).toEqual([[c!.pA, 3]])

    // C1 e C2 com a tag da unidade: C2 tem agendamento marcado (a5, SCHEDULED)
    // "desde" 2021-03-13 — só C1 fica sem visita; a última dela é a1 (10/03).
    const { data: u } = await db.from('branches').select('name').eq('id', c!.unidade).single<{ name: string }>()
    const tag = `Unidade: ${u!.name}`
    await db.from('clients').update({ tags: [tag] }).in('id', [c!.c1, c!.c2])
    const { data: reativar } = await db.rpc('metrics_clientes_para_reativar', {
      p_tenant: c!.tenant, p_branch_id: c!.unidade, p_tag: tag, p_desde: '2021-03-13T00:00:00-03:00', p_limite: 3,
    })
    const r = reativar as { total: number; lista: { id: string; ultima_visita: string }[] }
    expect(r.total).toBe(1)
    expect(r.lista.map(x => x.id)).toEqual([c!.c1])
    expect(new Date(r.lista[0]!.ultima_visita).toISOString()).toBe(new Date(dia(10)).toISOString())

    // Ficha do cliente: LTV = o que PAGOU desde sempre. C2 tem R$ 55 estornado
    // e R$ 70 pendente — nenhum entra. Atendimentos e serviço, desde sempre
    // (C1 inclui a0, de fevereiro).
    const doCliente = async (id: string) => {
      const { data, error } = await db.rpc('metrics_do_cliente', { p_tenant: c!.tenant, p_client: id })
      expect(error).toBeNull()
      const d = data as Record<string, unknown>
      return [num(d.ltv), num(d.atendimentos), num(d.receita_servico)]
    }
    expect(await doCliente(c!.c1)).toEqual([200, 2, 999 + 200])
    expect(await doCliente(c!.c2)).toEqual([100, 1, 100])

    const { data: valor, error: erroValor } = await db.rpc('metrics_valor_em_estoque', { p_branch_ids: [c!.unidade] })
    expect(erroValor).toBeNull()
    expect(num(valor)).toBe(60)
  })

  test('funil: leads por etapa e convertidos', async () => {
    const { data } = await banco().rpc('metrics_lead_funnel', { ...args(), p_funnel: null })
    const porEtapa: [number, string, number, number][] = data!.map((e: Record<string, unknown>) =>
      [num(e.stage_position), String(e.stage_outcome), num(e.leads), num(e.converted)])
    expect(porEtapa[0], '1ª etapa: 2 leads, 1 virou cliente').toEqual([0, 'OPEN', 2, 1])
    expect(porEtapa.find(e => e[1] === 'WON'), 'ganho: 1').toEqual([4, 'WON', 1, 0])
    expect(porEtapa.reduce((s, e) => s + e[2], 0), 'nenhum outro lead na janela').toBe(3)
  })
})
