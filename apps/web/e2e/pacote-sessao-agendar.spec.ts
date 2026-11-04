import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { apagarAgendamentos } from './apoio/limpeza'
import { chamarAcao } from './apoio/acao-direta'

/**
 * A24 da 6ª simulação (2026-11-04): agendar uma sessão de PACOTE ou de PLANO
 * oferecia horários que já tinham passado (00:00–04:00, a simulação rodou de
 * madrugada numa unidade 24 h) e o formulário não dizia o procedimento nem
 * deixava escolher a sala — visto nos dois fluxos.
 *
 * Agora a grade de hoje começa em AGORA (o "Outro horário" no passado é
 * recusado na tela), o formulário diz o procedimento da sessão (o pacote e o
 * plano já o decidem) e oferece a sala, opcional, com "(ocupada)" — e o
 * servidor confere a sala (da unidade, que serve ao procedimento, livre).
 */

const marca = Date.now().toString(36)
const db = () => banco()
const TODO_DIA = { dias: Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(d => [d, [{ de: '00:00', ate: '24:00' }]])) }
const PROC = `${PREFIXO} Drenagem ${marca}`
const SALA = `${PREFIXO} Sala Lótus ${marca}`

let rede: OutraRede | null = null
let recepcao: MembroDeTeste | null = null
let cliente = ''
let pacote = ''
let sala = ''

const agoraEmBrasilia = () => {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date())
  return Number(p.find(x => x.type === 'hour')!.value) * 60 + Number(p.find(x => x.type === 'minute')!.value)
}

async function comSessao<T>(browser: Browser, fn: (p: Page) => Promise<T>) {
  const ctx = await browser.newContext({ storageState: recepcao!.estado })
  try { return await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  test.setTimeout(120_000)
  rede = await criarOutraRede(`psa${marca}`)
  expect((await db().from('procedures').update({ name: PROC, price: 200, duration_min: 30 }).eq('id', rede.procedureId)).error).toBeNull()
  expect((await db().from('branches').update({ horario: TODO_DIA }).eq('id', rede.branchId)).error).toBeNull()
  expect((await db().from('users').update({ provides_services: true, branch_id: rede.branchId }).eq('id', rede.professionalId)).error).toBeNull()
  const { data: s, error: eS } = await db().from('rooms').insert({ branch_id: rede.branchId, name: SALA }).select('id').single<{ id: string }>()
  expect(eS).toBeNull()
  sala = s!.id
  cliente = await rede.criarCliente('Pacote agenda')
  recepcao = await criarMembro(`psar${marca}`, {
    tenant: rede.tenantId, rotulo: 'Recepcao',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'procedures', nivel: 'VIEW' }],
  })
  const { data: pac, error: eP } = await db().rpc('pacote_salvar', {
    p_tenant: rede.tenantId, p_id: null, p_nome: `${PREFIXO} Pacote drenagem ${marca}`, p_preco: 400, p_validade: null, p_ativo: true,
    p_itens: [{ procedure_id: rede.procedureId, quantity: 2 }],
    p_comissao: { venda: { tipo: 'PERCENTAGE', valor: 0 }, execucao: { tipo: 'REGRA', valor: null } },
  })
  expect(eP, 'criar o pacote').toBeNull()
  const { data: cp, error: eV } = await db().rpc('pacote_vender', {
    p_tenant: rede.tenantId, p_cliente: cliente, p_pacote: pac, p_unidade: rede.branchId, p_ator: recepcao.userId,
    p_lancamentos: [{ amount: 400, payment_method: 'PIX', is_paid: true }],
    p_sessoes: [{ procedure_id: rede.procedureId, preco: 200 }, { procedure_id: rede.procedureId, preco: 200 }],
  })
  expect(eV, 'vender o pacote').toBeNull()
  pacote = cp as string
})

test.afterAll(async () => {
  if (rede) {
    const { data: ags } = await db().from('appointments').select('id').eq('branch_id', rede.branchId)
    expect(await apagarAgendamentos((ags ?? []).map(a => a.id as string))).toEqual([])
    await db().from('treatment_plans').delete().eq('branch_id', rede.branchId)
    await db().from('rooms').delete().eq('branch_id', rede.branchId)
  }
  await recepcao?.limpar(); await rede?.limpar()
})

test('a sessão do pacote: sem horário passado, com o procedimento e a sala', async ({ browser }) => {
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
  await comSessao(browser, async p => {
    await p.goto(`/admin/clients/${cliente}`)
    await p.getByText('TRATAMENTO EM ANDAMENTO').first().click()
    await p.getByRole('button', { name: /Gerenciar/ }).first().click()
    await p.getByRole('button', { name: 'Agendar', exact: true }).first().click()

    const agendar = p.locator('[data-agendar-sessao]')
    await expect(agendar.locator('[data-procedimento-da-sessao]'), 'o formulário diz o procedimento da sessão').toContainText(PROC)

    await agendar.getByLabel('Profissional').selectOption({ index: 1 })
    await agendar.getByLabel('Data').fill(hoje)
    const grade = agendar.locator('[data-grade-de-horarios]')
    await expect(grade.locator('[data-horario]').first()).toBeVisible()
    // Nenhum horário que já passou (com folga de 30 min para o relógio do teste).
    const agora = agoraEmBrasilia()
    const horas = await grade.locator('[data-horario]').evaluateAll(els => els.map(e => e.getAttribute('data-horario') ?? ''))
    const [h0, m0] = (horas[0] ?? '00:00').split(':').map(Number)
    if (agora >= 30) expect(h0! * 60 + m0!, `a grade de hoje começa em agora (${horas[0]})`).toBeGreaterThanOrEqual(agora - 30)

    // O "Outro horário" no passado é recusado na tela.
    if (agora >= 60) {
      await agendar.getByLabel('Outro horário (encaixe)').fill('00:00')
      await expect(agendar.getByText(/Escolha a partir de/), 'o encaixe no passado é recusado').toBeVisible()
    }

    // A sala aparece e se escolhe.
    await grade.locator('[data-horario]').last().click()
    await agendar.getByLabel('Sala').selectOption({ label: SALA })
    await agendar.getByRole('button', { name: 'Confirmar agendamento' }).click()
    await expect(agendar).toHaveCount(0)
  })
  const { data: ses } = await db().from('package_sessions').select('appointment_id').eq('client_package_id', pacote).not('appointment_id', 'is', null)
  expect(ses, 'a sessão foi agendada').toHaveLength(1)
  const { data: ap } = await db().from('appointments').select('room_id, procedure_id').eq('id', ses![0]!.appointment_id as string).single()
  expect(ap).toEqual({ room_id: sala, procedure_id: rede!.procedureId })
})

test('a sessão do plano grava a sala — e o servidor recusa a sala de outra unidade', async ({ browser }) => {
  const plano = await rede!.criarPlanoProposto(`Plano ${marca}`, { semTermo: true })
  expect((await db().from('treatment_plans').update({ status: 'ACCEPTED' }).eq('id', plano.planId)).error).toBeNull()
  const { data: sessao } = await db().from('treatment_plan_sessions').select('id').eq('plan_id', plano.planId).single<{ id: string }>()
  const { data: b2, error: eB2 } = await db().from('branches')
    .insert({ tenant_id: rede!.tenantId, name: `${PREFIXO} Outra ${marca}`, slug: `e2e-psa2-${marca}` }).select('id').single<{ id: string }>()
  expect(eB2).toBeNull()
  const { data: alheia } = await db().from('rooms').insert({ branch_id: b2!.id, name: `${PREFIXO} Sala alheia ${marca}` }).select('id').single<{ id: string }>()
  const amanha = new Date(Date.now() + 26 * 3600_000)
  amanha.setUTCMinutes(0, 0, 0)
  const base = {
    planId: plano.planId, sessionId: sessao!.id, branchId: rede!.branchId, professionalId: rede!.professionalId,
    scheduledAt: amanha.toISOString(), clientId: plano.clientId, procedureId: rede!.procedureId, price: 50, durationMin: 30, slug: 'x',
  }
  try {
    await comSessao(browser, async p => {
      await p.goto(`/admin/clients/${plano.clientId}`)
      const recusa = await chamarAcao(p, 'actions/appointments.ts', 'schedulePlanSession', `/admin/clients/${plano.clientId}`, [{ ...base, roomId: alheia!.id }])
      expect(recusa.texto, 'a sala de outra unidade é recusada').toContain('Sala não encontrada nesta unidade.')
      const ok = await chamarAcao(p, 'actions/appointments.ts', 'schedulePlanSession', `/admin/clients/${plano.clientId}`, [{ ...base, roomId: sala }])
      expect(ok.texto).toContain('appointmentId')
    })
    const { data: lig } = await db().from('treatment_plan_sessions').select('appointment_id').eq('id', sessao!.id).single()
    const { data: ap } = await db().from('appointments').select('room_id').eq('id', lig!.appointment_id as string).single()
    expect(ap?.room_id).toBe(sala)
  } finally {
    await db().from('rooms').delete().eq('branch_id', b2!.id)
    await db().from('branches').delete().eq('id', b2!.id)
  }
})
