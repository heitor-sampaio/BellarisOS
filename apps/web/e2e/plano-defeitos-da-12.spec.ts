import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, clienteComSessao, type MembroDeTeste, type ClienteDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { responderAnamnese } from './apoio/anamnese'
import { chamarAcao } from './apoio/acao-direta'
import { diaEmQueAUnidadeAbre } from './apoio/datas'

/**
 * Os defeitos do plano de tratamento da 12ª simulação (2026-11-10/11, a
 * Cláudia e a Bianca da [sim] Clínica Acácia), numa rede [e2e] própria:
 *
 * - D4: o plano cancelado reabria como rascunho editável ("Nova sessão",
 *   "Adicionar procedimento", lixeiras e preços), sem o motivo e sem o que foi
 *   devolvido e o que ficou. `isPlanLocked` travava só o proposto, o fechado e o
 *   concluído.
 * - D5: cancelar gravava, e a tela continuava "Fechado e pago" com o botão
 *   "Cancelar plano" — só recarregando aparecia "Cancelado".
 * Princípio 3: o cancelado é um retrato, só leitura, com a data, o motivo e o
 * dinheiro; e a tela relê o plano ao cancelar.
 * - D8: as sessões de laser do plano ficavam sem a sala, embora o laser só se
 *   faça na Sala do laser — o checkout e o remarcar do app não escolhiam sala
 *   nenhuma. A sala segue OPCIONAL (decisão do Heitor, 2026-11-01); a regra da
 *   única opção (A2 da 10ª) vale: a sala única que serve ao procedimento, livre,
 *   vem; ocupada, a sessão vai sem sala, com o aviso.
 */

test.setTimeout(180_000)

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede
let gestor: MembroDeTeste
let slug = ''
let clienteId = ''
let salaLaser = ''
let app: ClienteDeTeste
const DIA = diaEmQueAUnidadeAbre(3)
const as = (hora: string) => new Date(`${DIA}T${hora}:00-03:00`).toISOString()

async function como(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado, viewport: { width: 1440, height: 900 } })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

/** O plano FECHADO e pago no Pix: duas sessões de R$ 100, nenhuma feita. */
async function planoFechadoEPago(rotulo: string): Promise<string> {
  const b = db()
  const { data: pl, error } = await b.from('treatment_plans').insert({
    branch_id: rede.branchId, client_id: clienteId, professional_id: rede.professionalId,
    status: 'ACCEPTED', name: `${PREFIXO} ${rotulo} ${marca}`, aceito_em: new Date().toISOString(),
  }).select('id').single<{ id: string }>()
  expect(error, 'criar o plano').toBeNull()
  const { data: sessoes, error: eS } = await b.from('treatment_plan_sessions').insert([0, 1].map(i => ({ plan_id: pl!.id, sort_order: i }))).select('id')
  expect(eS).toBeNull()
  expect((await b.from('treatment_plan_session_procedures').insert(sessoes!.map(s => ({ session_id: s.id, procedure_id: rede.procedureId, price: 100, sort_order: 0 })))).error).toBeNull()
  expect((await b.from('financial_transactions').insert({
    branch_id: rede.branchId, client_id: clienteId, treatment_plan_id: pl!.id, type: 'INCOME', category: 'Serviços',
    description: 'Plano de tratamento', created_by: 'e2e', amount: 200, payment_method: 'PIX', is_paid: true, paid_at: new Date().toISOString(),
  })).error, 'o pagamento do plano').toBeNull()
  return pl!.id
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`pl12${marca}`)
  const b = db()
  expect((await b.from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  slug = (await b.from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  expect((await b.from('users').update({ atende_em: [rede.branchId], provides_services: true }).eq('id', rede.professionalId)).error).toBeNull()
  clienteId = await rede.criarCliente('Patricia')
  // D8: duas salas, e o procedimento (o laser) só na Sala do laser.
  const salas = await b.from('rooms').insert([
    { branch_id: rede.branchId, name: `${PREFIXO} Sala do laser ${marca}` },
    { branch_id: rede.branchId, name: `${PREFIXO} Sala facial ${marca}` },
  ]).select('id, name')
  expect(salas.error).toBeNull()
  salaLaser = salas.data!.find(s => (s.name as string).includes('laser'))!.id as string
  expect((await b.from('procedure_rooms').insert({ tenant_id: rede.tenantId, procedure_id: rede.procedureId, room_id: salaLaser })).error).toBeNull()
  expect((await b.from('procedures').update({ duration_min: 60 }).eq('id', rede.procedureId)).error).toBeNull()
  app = await clienteComSessao(`pl12c${marca}`, { id: rede.branchId, slug }, { tenant: rede.tenantId })
  await responderAnamnese(clienteId, rede.tenantId)
  // Quem cancela (o Financeiro em Gerenciar) e também monta plano (o Prontuário em
  // Gerenciar): é quem via o editor aberto no plano cancelado.
  gestor = await criarMembro(`pl12g${marca}`, {
    tenant: rede.tenantId, rotulo: 'Gestao',
    permissoes: [
      { modulo: 'financial', nivel: 'MANAGE' }, { modulo: 'cashier', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'MANAGE' },
      { modulo: 'agenda', nivel: 'MANAGE', escopo: 'ALL' }, { modulo: 'medical_records', nivel: 'MANAGE' }, { modulo: 'procedures', nivel: 'MANAGE' },
    ],
  })
})

test.afterAll(async () => {
  await app?.limpar()
  await gestor?.limpar()
  await rede?.limpar()
})

test('D5 e D4: cancelar relê o plano na hora, e o cancelado é só leitura, com a data, o motivo e o dinheiro', async ({ browser }) => {
  const plano = await planoFechadoEPago('Plano laser')
  await como(browser, gestor, async p => {
    await p.goto(`/${slug}/planejamentos/${plano}`)
    await p.locator('[data-cancelar-plano]').click()
    const dlg = p.getByRole('dialog', { name: 'Cancelar plano' })
    await expect(dlg.locator('[data-conta-do-cancelamento]')).toBeVisible()
    // A34 da 12ª: "sem multa.Usado" — a frase colava na outra.
    await expect(dlg.locator('[data-conta-do-cancelamento]')).toContainText('sem multa. Usado:')
    await dlg.getByLabel('Motivo do cancelamento *').fill('Mudou de cidade')
    await dlg.getByRole('radio', { name: /Crédito na clínica/ }).check()
    await dlg.getByRole('button', { name: 'Cancelar plano' }).click()
    await expect(dlg).toBeHidden()

    // D5: sem recarregar, a tela já é a do cancelado.
    const retrato = p.locator('[data-retrato-do-cancelamento]')
    await expect(retrato).toBeVisible()
    await expect(retrato).toContainText('Mudou de cidade')
    await expect(retrato).toContainText('R$ 200,00 em crédito na clínica')
    await expect(p.locator('[data-cancelar-plano]')).toHaveCount(0)
    await expect(p.getByText('Cancelado', { exact: true }).first()).toBeVisible()

    // D4: recarregado, continua só leitura — nada de editar o plano cancelado.
    await p.reload()
    await expect(p.locator('[data-retrato-do-cancelamento]')).toContainText('Mudou de cidade')
    await expect(p.getByRole('button', { name: /Nova sessão/ })).toHaveCount(0)
    await expect(p.getByRole('button', { name: /Adicionar procedimento/ })).toHaveCount(0)
    await expect(p.getByRole('button', { name: /Aceitar plano/ })).toHaveCount(0)
  })
})

/** O plano PROPOSTO de duas sessões, para o checkout. */
async function planoProposto(rotulo: string): Promise<{ plano: string; sessoes: string[] }> {
  const b = db()
  const { data: pl, error } = await b.from('treatment_plans').insert({
    branch_id: rede.branchId, client_id: clienteId, professional_id: rede.professionalId,
    status: 'PROPOSED', name: `${PREFIXO} ${rotulo} ${marca}`,
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  const { data: sessoes } = await b.from('treatment_plan_sessions').insert([0, 1].map(i => ({ plan_id: pl!.id, sort_order: i }))).select('id, sort_order')
  const ord = [...sessoes!].sort((x, y) => x.sort_order - y.sort_order).map(s => s.id as string)
  expect((await b.from('treatment_plan_session_procedures').insert(ord.map(s => ({ session_id: s, procedure_id: rede.procedureId, price: 100, sort_order: 0 })))).error).toBeNull()
  return { plano: pl!.id, sessoes: ord }
}

test('D8: o checkout do plano põe a sessão na sala única do procedimento; ocupada, vai sem sala e diz', async ({ browser }) => {
  // A Sala do laser já está ocupada às 14:00 (outra pessoa, outro atendimento).
  const { error: eOcupa } = await db().from('appointments').insert({
    branch_id: rede.branchId, client_id: await rede.criarCliente('Outra'), procedure_id: rede.procedureId, professional_id: gestor.userId,
    room_id: salaLaser, scheduled_at: as('14:00'), duration_min: 60, price: 0, status: 'SCHEDULED', source: 'INTERNAL',
  })
  expect(eOcupa).toBeNull()
  const { plano, sessoes } = await planoProposto('Plano D8')
  await como(browser, gestor, async p => {
    // Fase 3 do PDV (PT1b): o plano se aceita antes, e o receber (no PDV) pede a
    // forma. A tela não agenda mais ali, mas o receber ainda aceita as sessões
    // agendadas — e a regra da sala é dele.
    // O aceite é da página do plano (é ela que carrega a action); a prova é o banco.
    await chamarAcao(p, 'actions/treatment-plans.ts', 'aceitarPlano', `/admin/planejamentos/${plano}`, [plano])
    expect((await db().from('treatment_plans').select('status').eq('id', plano).single()).data?.status, 'o aceite passou').toBe('ACCEPTED')
    const r = await chamarAcao(p, 'actions/treatment-plans.ts', 'checkoutTreatmentPlan', '/admin/pdv', [
      plano, { forma: 'AVISTA', metodo: 'PIX' },
      [
        { planSessionId: sessoes[0], scheduledAt: as('10:00'), professionalId: rede.professionalId, branchId: rede.branchId },
        { planSessionId: sessoes[1], scheduledAt: as('14:00'), professionalId: rede.professionalId, branchId: rede.branchId },
      ],
      slug,
    ])
    expect(r.texto, 'o checkout fechou').toMatch(/"newAppointmentId":"[0-9a-f-]{36}"/)
    expect(r.texto, 'a sessão das 14:00 vai sem sala, e a resposta diz').toMatch(/Sala do laser[^"]*ocupada/)
  })
  const { data: ags } = await db().from('appointments').select('scheduled_at, room_id').eq('treatment_plan_id', plano).order('scheduled_at')
  expect(ags!.map(a => a.room_id), 'a das 10:00 na Sala do laser; a das 14:00 sem sala').toEqual([salaLaser, null])
})

test('D8: o remarcar do app põe o agendamento na sala única do procedimento, livre no horário novo', async ({ browser }) => {
  const { data: ag, error } = await db().from('appointments').insert({
    branch_id: rede.branchId, client_id: app.clientId, procedure_id: rede.procedureId, professional_id: rede.professionalId,
    scheduled_at: as('09:00'), duration_min: 60, price: 0, status: 'SCHEDULED', source: 'CLIENT_APP',
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  const ctx = await browser.newContext({ storageState: app.estado })
  try {
    const p = await ctx.newPage()
    const r = await chamarAcao(p, 'actions/portal-agendamentos.ts', 'remarcarPelaCliente', `/${slug}/cliente/agendamentos/${ag!.id}`,
      [ag!.id, as('16:00'), false])
    expect(r.texto).toContain('"ok":true')
  } finally { await ctx.close() }
  const { data: depois } = await db().from('appointments').select('scheduled_at, room_id').eq('id', ag!.id).single()
  expect(new Date(depois!.scheduled_at as string).toISOString()).toBe(as('16:00'))
  expect(depois!.room_id, 'a Sala do laser, livre às 16:00').toBe(salaLaser)
})
