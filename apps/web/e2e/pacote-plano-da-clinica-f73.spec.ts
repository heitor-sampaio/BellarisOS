import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'

/**
 * F73 — o tratamento é da CLÍNICA (D3 da 14ª simulação; H5, CLAUDE.md §5: "A
 * cliente é da clínica, pode agendar em qualquer unidade da clínica").
 *
 * A Elisa (recepção fixa na Pampulha) abriu a ficha da Marina, que comprou o
 * pacote na Savassi, e "Gerenciar sessões" mostrou "0 / 6 sessões", sem
 * nenhuma sessão e sem erro: a lista e o agendar da janela do pacote estavam
 * presos à unidade da venda. Agora:
 * - ver e agendar as sessões do pacote e do plano valem em qualquer unidade
 *   da rede (a unidade do agendamento passa pelo alcance, no núcleo);
 * - cancelar o pacote ou o plano continua do caixa da unidade da venda.
 *
 * E o A21 da 14ª: a primeira janela ("Abrir para ver e agendar as sessões")
 * já lista as sessões com "Agendar" — antes ela só tinha outro botão.
 *
 * Quem prova é um membro de UNIDADE FIXA: como admin tudo abre.
 */

test.setTimeout(180_000)

const marca = `pc${Date.now().toString(36)}`
const db = () => banco()
let rede: OutraRede
let slugA = ''
let unidadeB = ''
let slugB = ''
let cliente = ''
let pacote = ''
let clientePackage = ''
let plano = ''
let sessaoDoPlano = ''
let gestor: MembroDeTeste
let recepcaoDeB: MembroDeTeste

async function como(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado, viewport: { width: 1440, height: 900 } })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

const daqui = (dias: number, hora = 13) => {
  const d = new Date(Date.now() + dias * 86_400_000); d.setUTCHours(hora, 0, 0, 0); return d.toISOString()
}

test.beforeAll(async ({ browser }) => {
  rede = await criarOutraRede(marca)
  const b = db()
  expect((await b.from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  slugA = (await b.from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  const { data: ub, error: eB } = await b.from('branches')
    .insert({ tenant_id: rede.tenantId, name: `${PREFIXO} Pampulha ${marca}`, slug: `e2e-pam-${marca}` })
    .select('id, slug').single<{ id: string; slug: string }>()
  expect(eB).toBeNull()
  unidadeB = ub!.id; slugB = ub!.slug
  expect((await b.from('procedures').update({ price: 120, duration_min: 30 }).eq('id', rede.procedureId)).error).toBeNull()
  // A Bianca atende nas duas.
  expect((await b.from('users').update({ provides_services: true, atende_em: [rede.branchId, unidadeB] }).eq('id', rede.professionalId)).error).toBeNull()

  gestor = await criarMembro(`g${marca}`, {
    tenant: rede.tenantId, rotulo: 'Gestão',
    permissoes: (['cashier', 'financial', 'clients', 'agenda', 'medical_records'] as const).map(modulo => ({ modulo, nivel: 'MANAGE' as const })),
  })
  // A Elisa: recepção fixa na Pampulha, com o Financeiro em Gerenciar (para provar que o CANCELAR segue preso).
  recepcaoDeB = await criarMembro(`r${marca}`, {
    tenant: rede.tenantId, branchId: unidadeB, rotulo: 'Recepção da Pampulha',
    permissoes: [
      { modulo: 'agenda', nivel: 'MANAGE', escopo: 'ALL' }, { modulo: 'clients', nivel: 'MANAGE' },
      { modulo: 'cashier', nivel: 'MANAGE' }, { modulo: 'financial', nivel: 'MANAGE', escopo: 'ALL' },
    ],
  })

  cliente = await rede.criarCliente('Marina')
  const { data: sp, error } = await b.from('service_packages').insert({
    tenant_id: rede.tenantId, procedure_id: rede.procedureId, name: `${PREFIXO} Pacote Savassi ${marca}`, total_sessions: 3, price: 300,
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  pacote = sp!.id
  expect((await b.from('service_package_items').insert({ tenant_id: rede.tenantId, package_id: pacote, procedure_id: rede.procedureId, quantity: 3 })).error).toBeNull()
  // A venda na SAVASSI (a unidade A).
  await como(browser, gestor, async p => {
    const r = await chamarAcao(p, 'actions/pacotes.ts', 'venderPacote', '/admin/pdv', [
      cliente, pacote, rede.branchId, { forma: 'AVISTA', metodo: 'PIX' }, null, null, { vendedorId: null, semVendedor: true, semResponsavel: true },
    ])
    expect(r.texto).toContain('clientPackageId')
  })
  clientePackage = (await b.from('client_packages').select('id').eq('client_id', cliente).single<{ id: string }>()).data!.id

  // E um plano fechado na Savassi, com uma sessão.
  const { data: pl, error: ePl } = await b.from('treatment_plans').insert({
    branch_id: rede.branchId, client_id: cliente, professional_id: rede.professionalId,
    status: 'ACCEPTED', name: `${PREFIXO} Plano Savassi ${marca}`, aceito_em: new Date().toISOString(),
  }).select('id').single<{ id: string }>()
  expect(ePl).toBeNull()
  plano = pl!.id
  const { data: ss } = await b.from('treatment_plan_sessions').insert({ plan_id: plano, sort_order: 0 }).select('id').single<{ id: string }>()
  sessaoDoPlano = ss!.id
  expect((await b.from('treatment_plan_session_procedures').insert({ session_id: sessaoDoPlano, procedure_id: rede.procedureId, price: 100 })).error).toBeNull()
})

test.afterAll(async () => {
  await recepcaoDeB?.limpar()
  await gestor?.limpar()
  await rede?.limpar()
})

test('D3: a recepção da Pampulha vê as sessões do pacote vendido na Savassi e agenda uma na Pampulha', async ({ browser }) => {
  await como(browser, recepcaoDeB, async p => {
    const rota = `/${slugB}/clients/${cliente}`
    await p.goto(rota)
    // A21: a primeira janela já lista as sessões, cada uma com "Agendar".
    await p.locator('[data-tratamento-que-abre]').click()
    const lista = p.locator('[data-sessoes-na-ficha]')
    await expect(lista.locator('[data-sessao-na-ficha]')).toHaveCount(3)
    await expect(lista.getByRole('button', { name: 'Agendar' })).toHaveCount(3)
    // O "Agendar" da primeira janela abre o agendar DAQUELA sessão.
    await lista.getByRole('button', { name: 'Agendar' }).first().click()
    await expect(p.getByRole('button', { name: 'Confirmar agendamento' })).toBeVisible()

    const r = await chamarAcao(p, 'actions/appointments.ts', 'getClientPackageSessions', rota, [clientePackage])
    expect(r.texto).toContain('"sessionNumber":3')

    const { data: sessoes } = await db().from('package_sessions').select('id').eq('client_package_id', clientePackage).order('session_number')
    const ag = await chamarAcao(p, 'actions/appointments.ts', 'schedulePackageSession', rota, [{
      packageSessionId: sessoes![0]!.id, branchId: unidadeB, professionalId: rede.professionalId,
      scheduledAt: daqui(3), clientId: cliente, procedureId: rede.procedureId, price: 0, durationMin: 30, slug: slugB,
    }])
    expect(ag.texto).toContain('appointmentId')
    const { data: s1 } = await db().from('package_sessions').select('appointment_id').eq('id', sessoes![0]!.id).single()
    const { data: appt } = await db().from('appointments').select('branch_id').eq('id', s1!.appointment_id!).single()
    expect(appt!.branch_id, 'agendada na Pampulha').toBe(unidadeB)

    // Agendar NA Savassi continua fora do alcance dela (o núcleo confere a unidade do agendamento).
    const naSavassi = await chamarAcao(p, 'actions/appointments.ts', 'schedulePackageSession', rota, [{
      packageSessionId: sessoes![1]!.id, branchId: rede.branchId, professionalId: rede.professionalId,
      scheduledAt: daqui(4), clientId: cliente, procedureId: rede.procedureId, price: 0, durationMin: 30, slug: slugB,
    }])
    expect(naSavassi.texto).not.toContain('appointmentId')
    expect((await db().from('package_sessions').select('appointment_id').eq('id', sessoes![1]!.id).single()).data!.appointment_id).toBeNull()
  })
})

test('D3: o plano fechado na Savassi — a ficha de tratamento e o agendar valem na Pampulha', async ({ browser }) => {
  await como(browser, recepcaoDeB, async p => {
    const rota = `/${slugB}/clients/${cliente}`
    await p.goto(rota)
    const det = await chamarAcao(p, 'actions/treatment-plans.ts', 'getTreatmentPlanDetails', rota, [plano, cliente])
    expect(det.texto).not.toContain('Plano não encontrado')
    expect(det.texto).toContain(sessaoDoPlano)
    const lista = await chamarAcao(p, 'actions/appointments.ts', 'getPlannedSessionAppointments', rota, [plano])
    expect(lista.texto).toContain(sessaoDoPlano)
    const ag = await chamarAcao(p, 'actions/appointments.ts', 'schedulePlanSession', rota, [{
      planId: plano, sessionId: sessaoDoPlano, branchId: unidadeB, professionalId: rede.professionalId,
      scheduledAt: daqui(5), clientId: cliente, procedureId: rede.procedureId, price: 0, durationMin: 30, slug: slugB,
    }])
    expect(ag.texto).toContain('appointmentId')
    expect((await db().from('treatment_plan_sessions').select('appointment_id').eq('id', sessaoDoPlano).single()).data!.appointment_id).toBeTruthy()
  })
})

test('D3: cancelar o pacote e o plano segue do caixa da Savassi', async ({ browser }) => {
  await como(browser, recepcaoDeB, async p => {
    const rota = `/${slugB}/clients/${cliente}`
    await p.goto(rota)
    const pac = await chamarAcao(p, 'actions/pacotes.ts', 'previaDoCancelamentoDoPacote', rota, [clientePackage])
    expect(pac.texto).toContain('Pacote não encontrado')
    const pla = await chamarAcao(p, 'actions/treatment-plans.ts', 'previaDoCancelamentoDoPlano', rota, [plano])
    expect(pla.texto).toContain('Plano não encontrado')
  })
  // Controle: a gestão da rede vê a prévia.
  await como(browser, gestor, async p => {
    const pac = await chamarAcao(p, 'actions/pacotes.ts', 'previaDoCancelamentoDoPacote', `/admin/clients/${cliente}`, [clientePackage])
    expect(pac.texto).toContain('previa')
  })
  void slugA
})
