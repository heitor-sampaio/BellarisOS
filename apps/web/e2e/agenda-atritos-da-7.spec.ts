import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { chamarAcao } from './apoio/acao-direta'
import { haMinutosHoje } from './apoio/datas'
import { addDaysTZ, dayKeyTZ } from '../lib/datetime'

/**
 * Os atritos de agenda da 7ª simulação (2026-11-05), da F30:
 * - A27: "Reagendar" depois da falta abria em branco (só a cliente) e sugeria
 *   um horário já passado.
 * - A28: o aviso do conflito citava só UM dos atendimentos que bloqueiam.
 * - A29: o rótulo 00:00 cortado no topo da grade; o cartão de 45 min sem o
 *   procedimento; o clique num vazio da coluna sem a profissional dela.
 * - A30: "HOJE — Sem atendimentos" ao lado de "HOJE 1 atendimento".
 * - A32: os próximos agendamentos da ficha diziam só "Criolipólise" na
 *   sessão de dois procedimentos.
 * - E a sobra da F29: a marca "Menor" também na "Minha agenda".
 *
 * Numa rede [e2e] própria, de unidade 24 h.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let slug = ''
let gestor: MembroDeTeste | null = null
let profissional: MembroDeTeste | null = null
let procedimento2 = ''
const nomeDoProc = `${PREFIXO} Criolipólise ${marca}`
const nomeDoProc2 = `${PREFIXO} Drenagem ${marca}`
const AMANHA = dayKeyTZ(addDaysTZ(new Date(), 1))
const DEPOIS = dayKeyTZ(addDaysTZ(new Date(), 2))
const ONTEM = dayKeyTZ(addDaysTZ(new Date(), -1))
const em = (dia: string, hhmm: string) => new Date(`${dia}T${hhmm}:00-03:00`).toISOString()

async function como(browser: Browser, quem: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: quem.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

async function agendar(o: { cliente: string; quando: string; min?: number; status?: string; prof?: string; proc?: string }) {
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: o.cliente, procedure_id: o.proc ?? rede!.procedureId,
    professional_id: o.prof ?? rede!.professionalId, scheduled_at: o.quando, duration_min: o.min ?? 30,
    price: 0, status: o.status ?? 'SCHEDULED', source: 'INTERNAL',
  }).select('id').single<{ id: string }>()
  expect(error, 'agendar').toBeNull()
  return data!.id
}

test.beforeAll(async () => {
  test.setTimeout(150_000)
  rede = await criarOutraRede(`aa7${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  // Unidade 24 h: a grade começa à meia-noite.
  const todoDia = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(d => [d, [{ de: '00:00', ate: '24:00' }]]))
  expect((await db().from('branches').update({ horario: { dias: todoDia } }).eq('id', rede.branchId)).error).toBeNull()
  expect((await db().from('procedures').update({ name: nomeDoProc, duration_min: 45 }).eq('id', rede.procedureId)).error).toBeNull()
  const p2 = await db().from('procedures').insert({ tenant_id: rede.tenantId, name: nomeDoProc2, category: 'e2e', duration_min: 50, price: 0 })
    .select('id').single<{ id: string }>()
  expect(p2.error).toBeNull()
  procedimento2 = p2.data!.id
  expect((await db().from('users').update({ provides_services: true, branch_id: rede.branchId }).eq('id', rede.professionalId)).error).toBeNull()
  gestor = await criarMembro(`aa7g${marca}`, {
    tenant: rede.tenantId, rotulo: 'Recepção',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'VIEW' }],
  })
  profissional = await criarMembro(`aa7p${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Profissional',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE', escopo: 'OWN' }],
  })
  expect((await db().from('users').update({ provides_services: true }).eq('id', profissional.userId)).error).toBeNull()
})

test.afterAll(async () => {
  const b = db()
  if (rede) {
    const { data: pls } = await b.from('treatment_plans').select('id').eq('branch_id', rede.branchId)
    const planos = (pls ?? []).map(p => p.id as string)
    if (planos.length) {
      const { data: ss } = await b.from('treatment_plan_sessions').select('id').in('plan_id', planos)
      const sessoes = (ss ?? []).map(s => s.id as string)
      if (sessoes.length) await b.from('treatment_plan_session_procedures').delete().in('session_id', sessoes)
      await b.from('treatment_plan_sessions').delete().in('plan_id', planos)
      await b.from('treatment_plans').delete().in('id', planos)
    }
    await b.from('appointments').delete().eq('branch_id', rede.branchId)
    await b.from('procedures').delete().eq('id', procedimento2)
  }
  await profissional?.limpar(); await gestor?.limpar(); await rede?.limpar()
})

test('A27: "Reagendar" depois da falta vem com o procedimento e a profissional, num horário que ainda vai acontecer', async ({ browser }) => {
  const cliente = await rede!.criarCliente('Falta')
  const falta = await agendar({ cliente, quando: em(ONTEM, '10:00'), min: 45, status: 'NO_SHOW' })
  await como(browser, gestor!, async p => {
    await p.goto(`/${slug}/agenda?date=${ONTEM}&cancelados=1`)
    await p.locator(`[data-agendamento="${falta}"]`).first().click()
    await p.getByRole('dialog', { name: 'Agendamento' }).getByRole('button', { name: 'Reagendar' }).click()
    const modal = p.getByRole('dialog', { name: 'Novo agendamento' })
    await expect(modal.locator('#ag-procedimento')).toHaveValue(rede!.procedureId)
    await expect(modal.locator('#ag-profissional')).toHaveValue(rede!.professionalId)
    // O horário sugerido é o próximo livre dela, a partir de agora — nunca um que já passou.
    await expect.poll(async () => new Date(await modal.locator('#ag-quando').inputValue()).getTime() > Date.now(),
      'o horário sugerido ainda vai acontecer').toBe(true)
  })
})

test('A28: o aviso do conflito cita TODOS os atendimentos que bloqueiam o horário', async ({ browser }) => {
  const cliente = await rede!.criarCliente('Conflito')
  await agendar({ cliente, quando: em(DEPOIS, '10:00'), min: 30 })
  await agendar({ cliente, quando: em(DEPOIS, '10:30'), min: 30 })
  await como(browser, gestor!, async p => {
    const r = await chamarAcao(p, 'actions/appointments.ts', 'avisosDoHorario', `/${slug}/agenda`,
      [rede!.branchId, rede!.professionalId, em(DEPOIS, '10:00'), null, 60])
    expect(r.texto).toContain('das 10:00 às 10:30')
    expect(r.texto).toContain('das 10:30 às 11:00')
  })
})

test('A29: o 00:00 inteiro no topo, o cartão de 45 min com o procedimento e o clique na coluna com a profissional', async ({ browser }) => {
  const cliente = await rede!.criarCliente('Grade')
  const de45 = await agendar({ cliente, quando: em(AMANHA, '03:00'), min: 45 })
  await como(browser, gestor!, async p => {
    await p.goto(`/${slug}/agenda?date=${AMANHA}`)
    const grade = p.locator('[data-grade-do-dia]')
    await expect(grade).toBeVisible()
    // O cartão de 45 min diz o procedimento.
    await expect(p.locator(`[data-agendamento="${de45}"]`)).toContainText(nomeDoProc)

    // O rótulo 00:00 não fica por baixo do cabeçalho fixo da grade.
    await grade.evaluate(el => { el.scrollTop = 0 })
    const cabecalho = await grade.locator(':scope > div').first().boundingBox()
    const rotulo = await grade.getByText('00:00', { exact: true }).boundingBox()
    expect(rotulo!.y, 'o 00:00 começa abaixo do cabeçalho').toBeGreaterThanOrEqual(cabecalho!.y + cabecalho!.height - 0.5)

    // O clique num vazio da coluna traz a profissional dela.
    const { data: prof } = await db().from('users').select('name').eq('id', rede!.professionalId).single()
    const coluna = p.locator(`[data-coluna-do-profissional="${prof!.name}"]`)
    const caixa = (await coluna.boundingBox())!
    // 01:15, um vazio (o atendimento é às 03:00).
    await coluna.click({ position: { x: caixa.width / 2, y: 100 } })
    await expect(p.getByRole('dialog', { name: 'Novo agendamento' }).locator('#ag-profissional')).toHaveValue(rede!.professionalId)
  })
})

test('A30 e a sobra da F29: a "Minha agenda" não diz "Sem atendimentos" com o de hoje no topo, e marca a menor', async ({ browser }) => {
  const cliente = await rede!.criarCliente('Menor')
  const nasc = new Date(); nasc.setFullYear(nasc.getFullYear() - 16)
  expect((await db().from('clients').update({
    birth_date: nasc.toISOString().slice(0, 10), responsavel_nome: 'Marta Lima', responsavel_parentesco: 'Mãe',
  }).eq('id', cliente)).error).toBeNull()
  // Um de hoje que já passou e foi concluído: nada mais por vir hoje.
  await agendar({ cliente, quando: haMinutosHoje(90), min: 30, status: 'COMPLETED', prof: profissional!.userId })
  await como(browser, profissional!, async p => {
    await p.goto(`/${slug}/agenda`)
    await expect(p.getByRole('heading', { name: 'Minha agenda' })).toBeVisible()
    await expect(p.getByText('Sem atendimentos', { exact: true }), 'o destaque não contradiz o "Hoje 1"').toHaveCount(0)
    await expect(p.locator('[data-destaque-de-hoje]')).toContainText('Nenhum outro atendimento hoje')
    await expect(p.locator('[data-grade-minha-agenda] [data-menor]').first(), 'a marca da menor no bloco').toBeVisible()
    await expect(p.locator('[data-grade-minha-agenda] [data-menor]').first()).toHaveAttribute('title', /Marta Lima/)
  })
})

test('A32: os próximos agendamentos da ficha dizem os dois procedimentos da sessão do plano', async ({ browser }) => {
  const cliente = await rede!.criarCliente('Sessão')
  const sessao = await agendar({ cliente, quando: em(DEPOIS, '15:00'), min: 95 })
  const { data: pl, error } = await db().from('treatment_plans').insert({
    branch_id: rede!.branchId, professional_id: rede!.professionalId, client_id: cliente, status: 'ACCEPTED', name: `${PREFIXO} Plano ${marca}`,
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  const { data: s } = await db().from('treatment_plan_sessions').insert({ plan_id: pl!.id, sort_order: 0, appointment_id: sessao }).select('id').single<{ id: string }>()
  expect((await db().from('treatment_plan_session_procedures').insert([
    { session_id: s!.id, procedure_id: rede!.procedureId, price: 0, sort_order: 0 },
    { session_id: s!.id, procedure_id: procedimento2, price: 0, sort_order: 1 },
  ])).error).toBeNull()
  await como(browser, gestor!, async p => {
    await p.goto(`/${slug}/clients/${cliente}`)
    await expect(p.locator('[data-proximos-agendamentos]')).toContainText(`${nomeDoProc} + ${nomeDoProc2}`)
  })
})
