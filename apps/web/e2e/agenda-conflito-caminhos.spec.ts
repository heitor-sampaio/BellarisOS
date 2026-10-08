import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'

/**
 * Todo caminho que CRIA ou MOVE agendamento confere o horário do profissional
 * (`horarioOcupado`, `lib/appointments/core.ts`) — não só o núcleo da agenda.
 *
 * A revisão do Copilot (2026-10-08) achou três que gravavam por cima de um
 * horário já ocupado: trocar o profissional, marcar a sessão de um plano e o
 * checkout do plano. Cada recusa tem o controle (o mesmo gesto num horário
 * livre passa).
 */

const marca = Date.now().toString(36)
const db = () => banco()

const PERMISSOES = (['agenda', 'cashier', 'financial', 'clients', 'medical_records'] as const)
  .map(modulo => ({ modulo, nivel: 'MANAGE' as const }))

interface Fx {
  outra: OutraRede; rede: MembroDeTeste
  /** O segundo profissional: ocupado às 13h. */
  p2: string
  cliente: string; ocupado: string; noMesmoHorario: string; emOutroHorario: string
  plano: string; sessao: string; planoCheckout: string; sessaoCheckout: string
  t: Date
}
let f: Fx | null = null
const criado: { outra?: OutraRede; membros: MembroDeTeste[] } = { membros: [] }

const horas = (base: Date, h: number) => new Date(base.getTime() + h * 3_600_000).toISOString()

test.beforeAll(async ({ browser }) => {
  const b = db()
  const ins = async (tabela: string, linha: Record<string, unknown>) => {
    const { data, error } = await b.from(tabela).insert(linha).select('id').single<{ id: string }>()
    expect(error, `criar ${tabela}`).toBeNull()
    return data!.id
  }
  const outra = await criarOutraRede(`cfl${marca}`)
  criado.outra = outra
  const rede = await criarMembro(`cflR${marca}`, { tenant: outra.tenantId, rotulo: 'Gestão', permissoes: PERMISSOES })
  criado.membros.push(rede)
  const p2 = rede.userId

  const cliente = await outra.criarCliente('conflito')
  const t = new Date(Date.now() + 2 * 86_400_000); t.setUTCHours(13, 0, 0, 0)
  const agendamento = (prof: string, quando: string) => ins('appointments', {
    branch_id: outra.branchId, client_id: cliente, procedure_id: outra.procedureId, professional_id: prof,
    scheduled_at: quando, duration_min: 60, price: 100, status: 'SCHEDULED', source: 'INTERNAL',
  })
  const { planId: plano } = await outra.criarPlanoProposto('sessão', { semTermo: true })
  const { planId: planoCheckout } = await outra.criarPlanoProposto('checkout', { semTermo: true })
  const sessaoDo = async (planId: string) => {
    const { data } = await b.from('treatment_plan_sessions').select('id').eq('plan_id', planId).single()
    return data!.id as string
  }

  f = {
    outra, rede, p2, cliente, t,
    ocupado:        await agendamento(p2, t.toISOString()),
    noMesmoHorario: await agendamento(outra.professionalId, t.toISOString()),
    emOutroHorario: await agendamento(outra.professionalId, horas(t, 3)),
    plano, sessao: await sessaoDo(plano), planoCheckout, sessaoCheckout: await sessaoDo(planoCheckout),
  }

  await como(browser, async p => {
    for (const tela of [`/admin/agenda/${f!.noMesmoHorario}`, `/admin/clients/${cliente}`, `/admin/checkout/${planoCheckout}`]) {
      await p.goto(tela)
      await p.waitForLoadState('networkidle')
    }
  })
})

test.afterAll(async () => {
  if (!criado.outra) return
  const b = db()
  const { data: appts } = await b.from('appointments').select('id').eq('branch_id', criado.outra.branchId)
  if (appts?.length) await b.from('appointment_history').delete().in('appointment_id', appts.map(a => a.id))
  for (const m of criado.membros) await m.limpar()
  await criado.outra.limpar()
})

async function como<T>(browser: Browser, fn: (p: Page) => Promise<T>) {
  const ctx = await browser.newContext({ storageState: f ? f.rede.estado : undefined })
  try { return await fn(await ctx.newPage()) } finally { await ctx.close() }
}

async function profissionalDe(id: string) {
  const { data } = await db().from('appointments').select('professional_id').eq('id', id).single()
  return data!.professional_id as string
}

async function agendamentosDoPlano(planId: string) {
  const { data } = await db().from('appointments').select('id').eq('treatment_plan_id', planId)
  return data ?? []
}

test('trocar o profissional para um que está ocupado é recusado', async ({ browser }) => {
  await como(browser, async p => {
    const tela = `/admin/agenda/${f!.noMesmoHorario}`
    const r = await chamarAcao(p, 'actions/appointments.ts', 'reassignProfessional', tela, [f!.noMesmoHorario, f!.p2, 'admin'])
    expect(r.texto).toContain('já tem agendamento nesse horário')
    // Controle: no horário livre, a troca vale.
    await chamarAcao(p, 'actions/appointments.ts', 'reassignProfessional', tela, [f!.emOutroHorario, f!.p2, 'admin'])
  })
  expect(await profissionalDe(f!.noMesmoHorario), 'o ocupado não recebeu').toBe(f!.outra.professionalId)
  expect(await profissionalDe(f!.emOutroHorario), 'o livre recebeu').toBe(f!.p2)
})

test('marcar a sessão do plano num horário ocupado é recusado', async ({ browser }) => {
  const params = (quando: string) => ({
    planId: f!.plano, sessionId: f!.sessao, branchId: f!.outra.branchId, professionalId: f!.p2,
    scheduledAt: quando, clientId: null as string | null, procedureId: f!.outra.procedureId,
    price: 50, durationMin: 30, slug: 'admin',
  })
  const { data: pl } = await db().from('treatment_plans').select('client_id').eq('id', f!.plano).single()
  await como(browser, async p => {
    const tela = `/admin/clients/${f!.cliente}`
    const r = await chamarAcao(p, 'actions/appointments.ts', 'schedulePlanSession', tela,
      [{ ...params(horas(f!.t, 0.5)), clientId: pl!.client_id }])
    expect(r.texto).toContain('já tem agendamento nesse horário')
    expect(await agendamentosDoPlano(f!.plano), 'nada gravado').toHaveLength(0)
    // Controle: num horário livre, marca.
    await chamarAcao(p, 'actions/appointments.ts', 'schedulePlanSession', tela,
      [{ ...params(horas(f!.t, 6)), clientId: pl!.client_id }])
  })
  expect(await agendamentosDoPlano(f!.plano), 'o livre marcou').toHaveLength(1)
})

test('o checkout do plano recusa horário ocupado ANTES do dinheiro', async ({ browser }) => {
  await como(browser, async p => {
    const r = await chamarAcao(p, 'actions/treatment-plans.ts', 'checkoutTreatmentPlan', `/admin/checkout/${f!.planoCheckout}`, [
      f!.planoCheckout, null,
      [{ planSessionId: f!.sessaoCheckout, scheduledAt: horas(f!.t, 0.5), professionalId: f!.p2, branchId: f!.outra.branchId }],
      'admin',
    ])
    expect(r.texto).toContain('já tem agendamento nesse horário')
  })
  expect(await agendamentosDoPlano(f!.planoCheckout), 'nenhum agendamento').toHaveLength(0)
  const { data: txs } = await db().from('financial_transactions').select('id').eq('treatment_plan_id', f!.planoCheckout)
  expect(txs ?? [], 'nenhum lançamento').toHaveLength(0)
  const { data: pl } = await db().from('treatment_plans').select('status').eq('id', f!.planoCheckout).single()
  expect(pl!.status, 'o plano segue proposto').toBe('PROPOSED')
})
