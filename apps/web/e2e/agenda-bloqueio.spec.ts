import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { chamarAcao, chamarAcaoComFormulario } from './apoio/acao-direta'
import { diaEmQueAUnidadeAbre } from './apoio/datas'

/**
 * Decisão 3 do Heitor (7ª simulação, 2026-11-05: "concordo"): o bloqueio
 * pontual da agenda — o almoço de hoje, a folga, as férias. A Lia e a Rita
 * procuraram em Agenda, Equipe e Configurações e não acharam onde.
 *
 * - "Bloquear horário" na agenda, por profissional ou por sala, com início,
 *   fim e motivo; aparece na grade; desfaz-se.
 * - Agendar dentro do bloqueio pela EQUIPE avisa e deixa encaixar
 *   (princípio 2), como o encaixe fora do horário.
 * - Os livres (o app da cliente, o Copilot, o CRM — `computeAvailableSlots`)
 *   não oferecem o horário bloqueado.
 * - Quem gerencia a agenda bloqueia; com "só os meus", só o próprio horário
 *   (sem sala). Quem só vê, não.
 *
 * Numa rede [e2e] própria.
 */

test.describe.configure({ mode: 'serial' })

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let slug = ''
let sala = ''
let nomeDaProf = ''
let recepcao: MembroDeTeste | null = null
let propria: MembroDeTeste | null = null
let soVe: MembroDeTeste | null = null
const DIA = diaEmQueAUnidadeAbre(3)
const em = (hhmm: string) => new Date(`${DIA}T${hhmm}:00-03:00`).toISOString()
const NOME_DA_SALA = `${PREFIXO} Sala Corporal ${marca}`

async function como(browser: Browser, quem: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: quem.estado, viewport: { width: 1280, height: 1000 } })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}
const bloqueiosDe = async (filtro: { professional_id?: string; room_id?: string }) => {
  let q = db().from('agenda_bloqueios').select('id, professional_id, room_id, inicio, fim, motivo').eq('tenant_id', rede!.tenantId)
  if (filtro.professional_id) q = q.eq('professional_id', filtro.professional_id)
  if (filtro.room_id) q = q.eq('room_id', filtro.room_id)
  const { data, error } = await q
  expect(error).toBeNull()
  return data ?? []
}
async function livres(p: Page) {
  const r = await chamarAcao(p, 'actions/crm-scheduling.ts', 'getCrmSlots', '/admin/inbox', [rede!.branchId, rede!.professionalId, DIA, 30])
  expect(r.status).toBe(200)
  return (r.texto.match(/"\d\d:\d\d"/g) ?? []).map(s => s.slice(1, -1))
}

test.beforeAll(async () => {
  test.setTimeout(150_000)
  rede = await criarOutraRede(`blq${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  const todoDia = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(d => [d, [{ de: '08:00', ate: '20:00' }]]))
  expect((await db().from('branches').update({ horario: { dias: todoDia } }).eq('id', rede.branchId)).error).toBeNull()
  expect((await db().from('users').update({ provides_services: true, branch_id: rede.branchId }).eq('id', rede.professionalId)).error).toBeNull()
  nomeDaProf = (await db().from('users').select('name').eq('id', rede.professionalId).single()).data!.name as string
  const s = await db().from('rooms').insert({ branch_id: rede.branchId, name: NOME_DA_SALA }).select('id').single<{ id: string }>()
  expect(s.error).toBeNull()
  sala = s.data!.id
  recepcao = await criarMembro(`blqr${marca}`, {
    tenant: rede.tenantId, rotulo: 'Recepção',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'VIEW' }, { modulo: 'crm', nivel: 'VIEW' }],
  })
  propria = await criarMembro(`blqp${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Profissional',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE', escopo: 'OWN' }],
  })
  expect((await db().from('users').update({ provides_services: true }).eq('id', propria.userId)).error).toBeNull()
  soVe = await criarMembro(`blqv${marca}`, { tenant: rede.tenantId, rotulo: 'Só vê', permissoes: [{ modulo: 'agenda', nivel: 'VIEW' }] })
})

test.afterAll(async () => {
  if (rede) {
    await db().from('appointments').delete().eq('branch_id', rede.branchId)
    await db().from('agenda_bloqueios').delete().eq('tenant_id', rede.tenantId)
  }
  await soVe?.limpar(); await propria?.limpar(); await recepcao?.limpar(); await rede?.limpar()
})

test('a recepção bloqueia o almoço da profissional pela agenda, e o bloqueio aparece na grade (unidade e rede)', async ({ browser }) => {
  await como(browser, recepcao!, async p => {
    await p.goto(`/${slug}/agenda?date=${DIA}`)
    await p.getByRole('button', { name: 'Bloquear horário' }).click()
    const janela = p.getByRole('dialog', { name: 'Bloquear horário' })
    await janela.getByLabel('Profissional').selectOption(rede!.professionalId)
    await janela.getByLabel('Início').fill(`${DIA}T12:00`)
    await janela.getByLabel('Fim').fill(`${DIA}T13:00`)
    await janela.getByLabel('Motivo').fill('Almoço')
    await janela.getByRole('button', { name: 'Bloquear', exact: true }).click()
    await expect(janela).toBeHidden()
    const coluna = p.locator(`[data-coluna-do-profissional="${nomeDaProf}"]`)
    await expect(coluna.locator('[data-rotulo-do-bloqueio]')).toContainText('Almoço')

    // A agenda da rede (a da dona da clínica de uma unidade) também mostra.
    await p.goto(`/admin/agenda?date=${DIA}`)
    await expect(p.locator(`[data-unidade="${rede!.branchId}"] [data-rotulo-do-bloqueio]`)).toContainText('Almoço')
  })
  expect(await bloqueiosDe({ professional_id: rede!.professionalId })).toEqual([
    expect.objectContaining({ motivo: 'Almoço', inicio: expect.stringContaining(''), room_id: null }),
  ])
})

test('os livres não oferecem o horário bloqueado (a conta do app, do Copilot e do CRM)', async ({ browser }) => {
  await como(browser, recepcao!, async p => {
    const h = await livres(p)
    expect(h).toContain('11:30')
    expect(h).toContain('13:00')
    expect(h).not.toContain('12:00')
    expect(h).not.toContain('12:30')
  })
})

test('agendar dentro do bloqueio pela equipe avisa e deixa encaixar (princípio 2)', async ({ browser }) => {
  const cliente = await rede!.criarCliente('Encaixe')
  await como(browser, recepcao!, async p => {
    // A janela do agendamento avisa antes de confirmar.
    await p.goto(`/${slug}/agenda?date=${DIA}`)
    const coluna = p.locator(`[data-coluna-do-profissional="${nomeDaProf}"]`)
    await expect(coluna).toBeVisible()
    const caixa = (await coluna.boundingBox())!
    await coluna.click({ position: { x: caixa.width / 2, y: 4.25 * 80 } })
    const modal = p.getByRole('dialog', { name: 'Novo agendamento' })
    await expect(modal.locator('[data-aviso-do-horario]')).toContainText(`Horário bloqueado para ${nomeDaProf} das 12:00 às 13:00 (Almoço). O encaixe é permitido.`)
    await modal.getByRole('button', { name: 'Cancelar' }).click()

    // E o encaixe grava.
    const r = await chamarAcaoComFormulario(p, 'actions/appointments.ts', 'addAppointment', `/${slug}/agenda`, [undefined], {
      _branchId: rede!.branchId, _slug: slug, client_id: cliente, procedure_id: rede!.procedureId,
      professional_id: rede!.professionalId, scheduled_at: em('12:00'),
    })
    expect(r.texto).toContain('"success":true')
  })
  const { data } = await db().from('appointments').select('id').eq('client_id', cliente)
  expect(data ?? [], 'o encaixe no bloqueio foi gravado').toHaveLength(1)
})

test('a sala bloqueada aparece na grade e o agendar avisa quando ela é escolhida', async ({ browser }) => {
  await como(browser, recepcao!, async p => {
    await p.goto(`/${slug}/agenda?date=${DIA}`)
    await p.getByRole('button', { name: 'Bloquear horário' }).click()
    const janela = p.getByRole('dialog', { name: 'Bloquear horário' })
    await janela.getByRole('button', { name: 'Sala', exact: true }).click()
    await janela.getByLabel('Sala', { exact: true }).selectOption(sala)
    await janela.getByLabel('Início').fill(`${DIA}T15:00`)
    await janela.getByLabel('Fim').fill(`${DIA}T16:00`)
    await janela.getByLabel('Motivo').fill('Manutenção')
    await janela.getByRole('button', { name: 'Bloquear', exact: true }).click()
    await expect(janela).toBeHidden()
    await expect(p.locator('[data-bloqueios-de-sala]')).toContainText(NOME_DA_SALA)
    await expect(p.locator('[data-bloqueios-de-sala]')).toContainText('Manutenção')

    const r = await chamarAcao(p, 'actions/appointments.ts', 'avisosDoHorario', `/${slug}/agenda`,
      [rede!.branchId, rede!.professionalId, em('15:30'), null, 30, sala])
    expect(r.texto).toContain(`${NOME_DA_SALA} está bloqueada das 15:00 às 16:00 (Manutenção). O encaixe é permitido.`)
  })
})

test('com "só os meus", a profissional bloqueia só o próprio horário (sem sala) — e quem só vê não bloqueia', async ({ browser }) => {
  await como(browser, propria!, async p => {
    await p.goto(`/${slug}/agenda?date=${DIA}`)
    await expect(p.getByRole('heading', { name: 'Minha agenda' })).toBeVisible()
    await p.getByRole('button', { name: 'Bloquear horário' }).click()
    const janela = p.getByRole('dialog', { name: 'Bloquear horário' })
    await expect(janela.getByLabel('Profissional'), 'não escolhe outra pessoa').toHaveCount(0)
    await expect(janela.getByRole('button', { name: 'Sala', exact: true })).toHaveCount(0)
    await janela.getByLabel('Início').fill(`${DIA}T09:00`)
    await janela.getByLabel('Fim').fill(`${DIA}T10:00`)
    await janela.getByLabel('Motivo').fill('Consulta médica')
    await janela.getByRole('button', { name: 'Bloquear', exact: true }).click()
    await expect(janela).toBeHidden()
    await expect(p.locator('[data-grade-minha-agenda] [data-rotulo-do-bloqueio]')).toContainText('Consulta médica')

    // Pela action, o horário de outra pessoa (ou uma sala) é recusado.
    const outra = await chamarAcao(p, 'actions/agenda-bloqueios.ts', 'bloquearHorario', `/${slug}/agenda`, [{
      branchId: rede!.branchId, professionalId: rede!.professionalId, inicio: em('17:00'), fim: em('18:00'), motivo: 'Tentativa',
    }])
    expect(outra.texto).toContain('Com a agenda “só os meus”, você bloqueia só o seu horário.')
    const daSala = await chamarAcao(p, 'actions/agenda-bloqueios.ts', 'bloquearHorario', `/${slug}/agenda`, [{
      branchId: rede!.branchId, roomId: sala, inicio: em('17:00'), fim: em('18:00'), motivo: 'Tentativa',
    }])
    expect(daSala.texto).toContain('Com a agenda “só os meus”, você bloqueia só o seu horário.')
  })
  expect(await bloqueiosDe({ professional_id: propria!.userId })).toEqual([expect.objectContaining({ motivo: 'Consulta médica' })])
  expect((await bloqueiosDe({})).filter(b => b.motivo === 'Tentativa')).toEqual([])

  await como(browser, soVe!, async p => {
    await p.goto(`/${slug}/agenda?date=${DIA}`)
    await expect(p.locator(`[data-coluna-do-profissional="${nomeDaProf}"] [data-rotulo-do-bloqueio]`), 'quem só vê, vê o bloqueio').toContainText('Almoço')
    await expect(p.getByRole('button', { name: 'Bloquear horário' })).toHaveCount(0)
    await chamarAcao(p, 'actions/agenda-bloqueios.ts', 'bloquearHorario', `/${slug}/agenda`, [{
      branchId: rede!.branchId, professionalId: rede!.professionalId, inicio: em('18:00'), fim: em('19:00'), motivo: 'Sem permissão',
    }]).catch(() => null)
  })
  expect((await bloqueiosDe({})).filter(b => b.motivo === 'Sem permissão'), 'quem só vê não grava').toEqual([])
})

test('a vista da SEMANA também desenha o bloqueio: a da unidade, a da rede e a "Minha agenda" (sobra da F30)', async ({ browser }) => {
  await como(browser, recepcao!, async p => {
    await p.goto(`/${slug}/agenda?date=${DIA}`)
    await p.getByRole('button', { name: 'Semana', exact: true }).click()
    const daProf = p.locator(`[data-bloqueio-da-semana][data-profissional="${rede!.professionalId}"]`)
    await expect(daProf).toContainText('Bloqueado das 12:00 às 13:00 · Almoço')
    await expect(p.locator('[data-bloqueio-da-semana][data-sala]')).toContainText(`${NOME_DA_SALA} · das 15:00 às 16:00 · Manutenção`)
    await daProf.click()
    await expect(p.getByRole('dialog', { name: 'Horário bloqueado' })).toContainText('Almoço')
    await p.keyboard.press('Escape')

    await p.goto(`/admin/agenda?date=${DIA}&view=week`)
    await expect(p.locator('[data-bloqueio-da-semana]').filter({ hasText: 'Almoço' })).toBeVisible()
  })
  await como(browser, propria!, async p => {
    await p.goto(`/${slug}/agenda?date=${DIA}`)
    await p.getByRole('button', { name: 'Semana', exact: true }).click()
    await expect(p.locator('[data-bloqueado-no-dia]')).toContainText('Bloqueado')
  })
})

test('desfazer o bloqueio devolve o horário aos livres', async ({ browser }) => {
  await como(browser, recepcao!, async p => {
    await p.goto(`/${slug}/agenda?date=${DIA}`)
    await p.locator(`[data-coluna-do-profissional="${nomeDaProf}"] [data-rotulo-do-bloqueio]`).first().click()
    const janela = p.getByRole('dialog', { name: 'Horário bloqueado' })
    await expect(janela).toContainText('Almoço')
    await janela.getByRole('button', { name: 'Desfazer bloqueio' }).click()
    await expect(janela).toBeHidden()
    await expect(p.locator(`[data-coluna-do-profissional="${nomeDaProf}"] [data-bloqueio]`)).toHaveCount(0)
    const h = await livres(p)
    expect(h).toContain('12:30')
  })
  expect(await bloqueiosDe({ professional_id: rede!.professionalId })).toEqual([])
})
