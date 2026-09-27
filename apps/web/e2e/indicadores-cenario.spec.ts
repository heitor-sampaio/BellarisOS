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
  agendamentos: string[]; leads: string[]
}

const num = (v: unknown) => Number(v ?? 0)

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
    const c1 = await ins('clients', { tenant_id: tenant, branch_id: unidade.id, name: `${PREFIXO} Ind C1 ${marca}`, phone: '5548900000001', created_at: '2021-01-15T10:00:00-03:00' })
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
    await tx({ type: 'INCOME', amount: 200, is_paid: true, paid_at: dia(10), created_at: dia(10), client_id: c1.id, appointment_id: a1.id, description: `${PREFIXO} t1` })
    await tx({ type: 'INCOME', amount: 100, is_paid: true, paid_at: dia(11), created_at: dia(11), client_id: c2.id, appointment_id: a2.id, description: `${PREFIXO} t2` })
    await tx({ type: 'INCOME', amount: 70, is_paid: false, created_at: dia(12), client_id: c2.id, description: `${PREFIXO} t3 pendente` })
    await tx({ type: 'EXPENSE', amount: 40, is_paid: true, paid_at: dia(15), created_at: dia(15), description: `${PREFIXO} t4 despesa` })
    // Um estorno, os dois lados — nenhum pode aparecer em lugar nenhum.
    await tx({ type: 'INCOME', amount: 55, is_paid: true, paid_at: dia(16), created_at: dia(16), client_id: c2.id, notes: 'Estornada', description: `${PREFIXO} t5 estornada` })
    await tx({ type: 'EXPENSE', category: 'Estorno', amount: 55, is_paid: true, paid_at: dia(16, 11), created_at: dia(16, 11), client_id: c2.id, description: `Estorno: ${PREFIXO} t5 estornada` })
    await tx({ type: 'EXPENSE', amount: 30, is_paid: false, created_at: dia(17), description: `${PREFIXO} t6 despesa pendente` })

    await ins('commissions', { branch_id: unidade.id, professional_id: prof!.id, appointment_id: a1.id, amount: 20, type: 'PERCENTAGE', rule_value: 10, status: 'OPEN', period_ref: '2021-03' })
    await ins('commissions', { branch_id: unidade.id, professional_id: prof!.id, appointment_id: a2.id, amount: 10, type: 'PERCENTAGE', rule_value: 10, status: 'PAID', period_ref: '2021-03' })

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
      commOpen: 20, commPaid: 10,
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
      .toEqual([[c!.profissional, 2, 300, 30]])

    const { data: clis } = await db.rpc('metrics_top_clients', { ...args(), p_limit: 10 })
    expect(clis!.map((x: Record<string, unknown>) => [x.client_id, num(x.total_spent), num(x.appointments)]))
      .toEqual([[c!.c1, 200, 1], [c!.c2, 100, 1]])
  })

  test('comissões em detalhe, retenção e clientes novos no tempo', async () => {
    const db = banco()
    const { data: com } = await db.rpc('metrics_commissions_detail', args())
    expect(com!.map((x: Record<string, unknown>) => [num(x.amount), x.is_paid]).sort()).toEqual([[10, true], [20, false]])

    const { data: ret } = await db.rpc('metrics_retention', args())
    expect([num(ret![0]!.clients_served), num(ret![0]!.returning_clients), num(ret![0]!.first_time_clients)])
      .toEqual([2, 1, 1]) // C1 já tinha sido atendida antes da janela

    const { data: novos } = await db.rpc('metrics_new_clients_series', { ...args(), p_granularity: 'month' })
    expect(novos!.map((b: Record<string, unknown>) => num(b.count))).toEqual([1])
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
