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
 * - Ninguém marca dentro do bloqueio, nem a EQUIPE pela agenda (R07, o
 *   Heitor, 26/11, no chat, sobre a R07: "r07 se ta bloqueado não dá pra
 *   marcar"; era o encaixe avisado). A janela diz "Não vai ser agendado" e
 *   desliga o Confirmar; o servidor recusa. O fora do horário segue encaixe.
 * - Os livres (o app da cliente, o Copilot, o CRM — `computeAvailableSlots`)
 *   não oferecem o horário bloqueado.
 * - Quem gerencia a agenda bloqueia. Quem só vê, não; nem a "Minha agenda"
 *   (a vista pessoal, que só mostra — SM2, 2026-11-23; o "só os meus" saiu).
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
    // A "Minha agenda" é a vista pessoal (SM2, o Heitor, 2026-11-23): atende e
    // não tem a Agenda (era a Agenda em Gerenciar "só os meus", que saiu — SM1).
    permissoes: [{ modulo: 'agenda', nivel: 'NONE' }],
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

test('quem tem a Agenda em Gerenciar bloqueia o almoço da profissional pela agenda, e o bloqueio aparece na grade (unidade e rede)', async ({ browser }) => {
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

test('agendar dentro do bloqueio pela equipe é recusado: a janela desliga o Confirmar e o servidor recusa (R07)', async ({ browser }) => {
  // O Heitor, 26/11, no chat, sobre a R07: "r07 se ta bloqueado não dá pra marcar".
  const cliente = await rede!.criarCliente('Encaixe')
  await como(browser, recepcao!, async p => {
    // A janela do agendamento diz antes de confirmar, e o Confirmar desliga.
    await p.goto(`/${slug}/agenda?date=${DIA}`)
    const coluna = p.locator(`[data-coluna-do-profissional="${nomeDaProf}"]`)
    await expect(coluna).toBeVisible()
    const caixa = (await coluna.boundingBox())!
    await coluna.click({ position: { x: caixa.width / 2, y: 4.25 * 80 } })
    const modal = p.getByRole('dialog', { name: 'Novo agendamento' })
    await expect(modal.locator('[data-aviso-do-horario]')).toContainText(`Não vai ser agendado: ${nomeDaProf} está com o horário bloqueado das 12:00 às 13:00 (Almoço).`)
    await expect(modal.locator('[data-aviso-do-horario]')).not.toContainText('O encaixe é permitido')
    await expect(modal.getByRole('button', { name: 'Confirmar agendamento' })).toBeDisabled()
    await expect(modal.locator('[data-motivo-do-confirmar]')).toContainText('Escolha outro horário: este está bloqueado.')
    await modal.getByRole('button', { name: 'Cancelar' }).click()

    // E pela action, direto, o servidor recusa com a frase do bloqueio.
    const r = await chamarAcaoComFormulario(p, 'actions/appointments.ts', 'addAppointment', `/${slug}/agenda`, [undefined], {
      _branchId: rede!.branchId, _slug: slug, client_id: cliente, procedure_id: rede!.procedureId,
      professional_id: rede!.professionalId, scheduled_at: em('12:00'),
    })
    expect(r.texto).toContain(`${nomeDaProf} está com o horário bloqueado das 12:00 às 13:00 (Almoço). Escolha outro horário.`)
    expect(r.texto).not.toContain('"success":true')
  })
  const { data } = await db().from('appointments').select('id').eq('client_id', cliente)
  expect(data ?? [], 'o bloqueado não se marca').toHaveLength(0)
})

test('a sala bloqueada aparece na grade, e o agendar nela é recusado quando ela é escolhida (R07)', async ({ browser }) => {
  const cliente = await rede!.criarCliente('Sala bloqueada')
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
    expect(r.texto).toContain(`${NOME_DA_SALA} está bloqueada das 15:00 às 16:00 (Manutenção).`)
    expect(r.texto).not.toContain('O encaixe é permitido')

    // A sala bloqueada não se marca (o Heitor, 26/11, no chat, sobre a R07:
    // "r07 se ta bloqueado não dá pra marcar"), mesmo com quem atende livre.
    const g = await chamarAcaoComFormulario(p, 'actions/appointments.ts', 'addAppointment', `/${slug}/agenda`, [undefined], {
      _branchId: rede!.branchId, _slug: slug, client_id: cliente, procedure_id: rede!.procedureId,
      professional_id: rede!.professionalId, scheduled_at: em('15:30'), room_id: sala,
    })
    expect(g.texto).toContain(`${NOME_DA_SALA} está bloqueada das 15:00 às 16:00 (Manutenção). Escolha outro horário.`)
  })
  const { data } = await db().from('appointments').select('id').eq('client_id', cliente)
  expect(data ?? [], 'a sala bloqueada não se marca').toHaveLength(0)
})

test('a "Minha agenda" (a vista pessoal) mostra o bloqueio dela e não bloqueia — e quem só vê também não', async ({ browser }) => {
  // Sem o "só os meus" (SM1/SM2, o Heitor, 2026-11-23): bloquear é da Agenda
  // em Gerenciar; a vista pessoal só MOSTRA.
  expect((await db().from('agenda_bloqueios').insert({
    tenant_id: rede!.tenantId, branch_id: rede!.branchId, professional_id: propria!.userId, motivo: 'Consulta médica',
    inicio: em('09:00'), fim: em('10:00'), criado_por_nome: 'e2e',
  })).error).toBeNull()
  await como(browser, propria!, async p => {
    await p.goto(`/${slug}/agenda?date=${DIA}`)
    await expect(p.getByRole('heading', { name: 'Minha agenda' })).toBeVisible()
    await expect(p.locator('[data-grade-minha-agenda] [data-rotulo-do-bloqueio]')).toContainText('Consulta médica')
    await expect(p.getByRole('button', { name: 'Bloquear horário' })).toHaveCount(0)

    // Pela action também não: nem o próprio horário, nem uma sala.
    await chamarAcao(p, 'actions/agenda-bloqueios.ts', 'bloquearHorario', `/${slug}/agenda`, [{
      branchId: rede!.branchId, professionalId: propria!.userId, inicio: em('17:00'), fim: em('18:00'), motivo: 'Tentativa',
    }]).catch(() => null)
    await chamarAcao(p, 'actions/agenda-bloqueios.ts', 'bloquearHorario', `/${slug}/agenda`, [{
      branchId: rede!.branchId, roomId: sala, inicio: em('17:00'), fim: em('18:00'), motivo: 'Tentativa',
    }]).catch(() => null)
  })
  expect(await bloqueiosDe({ professional_id: propria!.userId })).toEqual([expect.objectContaining({ motivo: 'Consulta médica' })])
  expect((await bloqueiosDe({})).filter(b => b.motivo === 'Tentativa'), 'a vista pessoal não grava').toEqual([])

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

// D5 da 39ª (AG-22; design.md, o celular): a 375 px a Semana colava os
// cabeçalhos ("QUAQUI"), cortava o domingo e escrevia o bloqueio uma letra por
// linha. A grade rola de lado, com a coluna de quem atende parada.
test('a Semana no celular: os dias não se colam, o domingo se alcança e o bloqueio se lê', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: recepcao!.estado, viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true })
  try {
    const p = await ctx.newPage()
    await p.goto(`/${slug}/agenda?date=${DIA}`)
    await p.getByRole('button', { name: 'Modo de visualização' }).click()
    await p.getByRole('menu').getByRole('button', { name: 'Semana', exact: true }).click()
    const qua = (await p.locator('th', { hasText: 'QUA' }).boundingBox())!
    const qui = (await p.locator('th', { hasText: 'QUI' }).boundingBox())!
    expect(qui.x, 'QUA e QUI não se colam').toBeGreaterThanOrEqual(qua.x + qua.width - 1)
    expect(qua.width, 'a coluna do dia tem largura para ler').toBeGreaterThanOrEqual(100)
    const etiqueta = p.locator(`[data-bloqueio-da-semana][data-profissional="${rede!.professionalId}"]`)
    await etiqueta.scrollIntoViewIfNeeded()
    expect((await etiqueta.boundingBox())!.width, 'o bloqueio não vira uma letra por linha').toBeGreaterThanOrEqual(90)
    const domingo = p.locator('th', { hasText: 'DOM' })
    await domingo.scrollIntoViewIfNeeded()
    const dom = (await domingo.boundingBox())!
    expect(dom.x + dom.width, 'o domingo cabe na tela depois de rolar').toBeLessThanOrEqual(376)
    // A coluna de quem atende fica parada: o nome segue à vista com o domingo.
    await expect(p.locator('td', { hasText: nomeDaProf }).first()).toBeInViewport()
  } finally { await ctx.close() }
})

test('quem tem a Agenda em Ver abre o bloqueio só para ler, e fecha pelo "Fechar" (princípio 7)', async ({ browser }) => {
  await como(browser, soVe!, async p => {
    await p.goto(`/${slug}/agenda?date=${DIA}`)
    await p.locator(`[data-coluna-do-profissional="${nomeDaProf}"] [data-rotulo-do-bloqueio]`).first().click()
    const janela = p.getByRole('dialog', { name: 'Horário bloqueado' })
    await expect(janela).toContainText('Almoço')
    await expect(janela.getByRole('button', { name: 'Desfazer bloqueio' }), 'quem só vê não desfaz').toHaveCount(0)
    await janela.locator('[data-bloqueio-so-de-leitura]').getByRole('button', { name: 'Fechar' }).click()
    await expect(janela).toBeHidden()
  })
})

test('o "Bloquear horário" diz, antes de gravar, os atendimentos que continuam no período (AG-20)', async ({ browser }) => {
  const cliente = await rede!.criarCliente('Continua')
  const marcado = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: cliente, procedure_id: rede!.procedureId, professional_id: rede!.professionalId,
    // Às 06:00, um atendimento já marcado antes do bloqueio: ele continua.
    status: 'SCHEDULED', source: 'INTERNAL', duration_min: 30, price: 0, scheduled_at: em('06:00'),
  }).select('id').single<{ id: string }>()
  expect(marcado.error).toBeNull()
  try {
    await como(browser, recepcao!, async p => {
      await p.goto(`/${slug}/agenda?date=${DIA}`)
      await p.getByRole('button', { name: 'Bloquear horário' }).click()
      const janela = p.getByRole('dialog', { name: 'Bloquear horário' })
      await janela.getByLabel('Profissional').selectOption(rede!.professionalId)
      await janela.getByLabel('Início').fill(`${DIA}T06:00`)
      await janela.getByLabel('Fim').fill(`${DIA}T07:00`)
      await expect(janela.locator('[data-marcados-no-bloqueio]'))
        .toHaveText('Já há 1 atendimento marcado perto desse período: ele continua na agenda. Remarque se precisar.')
      // Fora do período, nada a dizer.
      await janela.getByLabel('Início').fill(`${DIA}T04:00`)
      await janela.getByLabel('Fim').fill(`${DIA}T05:00`)
      await expect(janela.locator('[data-marcados-no-bloqueio]')).toHaveCount(0)
      await janela.getByRole('button', { name: 'Cancelar' }).click()
    })
    expect((await bloqueiosDe({ professional_id: rede!.professionalId })).map(b => b.motivo), 'contar não grava').toEqual(['Almoço'])
  } finally {
    await db().from('appointments').delete().eq('id', marcado.data!.id)
  }
})

// AG-20 (D3 da 36ª): o aviso conta só o que se sobrepõe ao período. O das 06:00
// (30 min) terminava antes do bloqueio das 07:00 e entrava na conta, pela janela
// das 12 h antes.
test('o aviso do "Bloquear horário" não conta o atendimento que termina antes do período (AG-20)', async ({ browser }) => {
  const cliente = await rede!.criarCliente('Antes do bloqueio')
  const marcado = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: cliente, procedure_id: rede!.procedureId, professional_id: rede!.professionalId,
    status: 'SCHEDULED', source: 'INTERNAL', duration_min: 30, price: 0, scheduled_at: em('06:00'),
  }).select('id').single<{ id: string }>()
  expect(marcado.error).toBeNull()
  try {
    await como(browser, recepcao!, async p => {
      await p.goto(`/${slug}/agenda?date=${DIA}`)
      await p.getByRole('button', { name: 'Bloquear horário' }).click()
      const janela = p.getByRole('dialog', { name: 'Bloquear horário' })
      await janela.getByLabel('Profissional').selectOption(rede!.professionalId)
      // O controle: das 06:15 às 07:00 ele ainda ocupa — conta.
      await janela.getByLabel('Início').fill(`${DIA}T06:15`)
      await janela.getByLabel('Fim').fill(`${DIA}T07:00`)
      await expect(janela.locator('[data-marcados-no-bloqueio]')).toContainText('Já há 1 atendimento marcado')
      // Das 07:00 às 08:00 ele já terminou: nada a dizer.
      await janela.getByLabel('Início').fill(`${DIA}T07:00`)
      await janela.getByLabel('Fim').fill(`${DIA}T08:00`)
      await expect(janela.locator('[data-marcados-no-bloqueio]')).toHaveCount(0)
      await janela.getByRole('button', { name: 'Cancelar' }).click()
    })
  } finally {
    await db().from('appointments').delete().eq('id', marcado.data!.id)
  }
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
