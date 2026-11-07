import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { addDaysTZ, dayKeyTZ, weekdayTZ } from '../lib/datetime'

/**
 * Os defeitos de agenda da 8ª simulação (2026-11-06), da F33:
 * - D3: a semana da agenda da unidade não tinha domingo, e o contador da
 *   semana parava na meia-noite de sábado.
 * - D4: na semana da agenda da REDE, o das 23:55 de quinta caía na sexta (o
 *   dia em UTC).
 * - D5: o seletor de horários da sessão do pacote só olhava o INÍCIO — 10:00
 *   aparecia livre para 60 min com outro atendimento às 10:30, e o bloqueio
 *   nem entrava.
 * - D9: o Confirmar do agendar gravava antes de o aviso do horário chegar (o
 *   bloqueio passava "sem nenhum aviso").
 * - D15: a ocupação contava o tempo bloqueado como disponível, e a "Minha
 *   agenda" mostrava "Horário livre" dentro do bloqueio.
 *
 * Numa rede [e2e] própria, de unidade 24 h.
 */

const marca = Date.now().toString(36)
const db = () => banco()
const TODO_DIA = { dias: Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(d => [d, [{ de: '00:00', ate: '24:00' }]])) }
const PROC = `${PREFIXO} Limpeza ${marca}`

let rede: OutraRede | null = null
let slug = ''
let gestor: MembroDeTeste | null = null
let daRede: MembroDeTeste | null = null
let profissional: MembroDeTeste | null = null
let cliente = ''
let clienteDoPacote = ''

const em = (dia: string, hhmm: string) => new Date(`${dia}T${hhmm}:00-03:00`).toISOString()
const hoje = dayKeyTZ(new Date())
// A segunda-feira da semana que vem (Brasília) e os dias dela.
const SEGUNDA = dayKeyTZ(addDaysTZ(new Date(), ((8 - weekdayTZ(new Date())) % 7) || 7))
const diaDaSemana = (n: number) => dayKeyTZ(addDaysTZ(new Date(`${SEGUNDA}T12:00:00-03:00`), n))
// O dia dos testes de horário: a quarta da semana seguinte (fora da semana do D3).
const ALVO = diaDaSemana(9)
const semana: Record<string, string> = {}

async function como(browser: Browser, quem: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: quem.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

async function agendar(o: { quando: string; min?: number; prof?: string; cli?: string }) {
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: o.cli ?? cliente, procedure_id: rede!.procedureId,
    professional_id: o.prof ?? rede!.professionalId, scheduled_at: o.quando, duration_min: o.min ?? 30,
    price: 0, status: 'SCHEDULED', source: 'INTERNAL',
  }).select('id').single<{ id: string }>()
  expect(error, 'agendar').toBeNull()
  return data!.id
}

async function bloquear(prof: string, inicio: string, fim: string, motivo: string) {
  const { error } = await db().from('agenda_bloqueios').insert({
    tenant_id: rede!.tenantId, branch_id: rede!.branchId, professional_id: prof, inicio, fim, motivo, criado_por_nome: 'e2e',
  })
  expect(error, 'bloquear').toBeNull()
}

test.beforeAll(async () => {
  test.setTimeout(180_000)
  rede = await criarOutraRede(`ad8${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  expect((await db().from('branches').update({ horario: TODO_DIA }).eq('id', rede.branchId)).error).toBeNull()
  expect((await db().from('procedures').update({ name: PROC, duration_min: 60, price: 200 }).eq('id', rede.procedureId)).error).toBeNull()
  expect((await db().from('users').update({ provides_services: true, branch_id: rede.branchId }).eq('id', rede.professionalId)).error).toBeNull()
  cliente = await rede.criarCliente('Agenda')
  clienteDoPacote = await rede.criarCliente('Pacote')
  gestor = await criarMembro(`ad8g${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Recepcao',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'procedures', nivel: 'VIEW' }],
  })
  daRede = await criarMembro(`ad8r${marca}`, {
    tenant: rede.tenantId, rotulo: 'Gerente da rede', permissoes: [{ modulo: 'agenda', nivel: 'VIEW' }],
  })
  profissional = await criarMembro(`ad8p${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Profissional',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE', escopo: 'OWN' }],
  })
  expect((await db().from('users').update({ provides_services: true }).eq('id', profissional.userId)).error).toBeNull()

  // A semana do D3/D4: segunda 10:00, quinta 23:55, sábado 22:00 e domingo 10:00.
  semana.segunda = await agendar({ quando: em(diaDaSemana(0), '10:00') })
  semana.quinta = await agendar({ quando: em(diaDaSemana(3), '23:55'), min: 5 })
  semana.sabado = await agendar({ quando: em(diaDaSemana(5), '22:00') })
  semana.domingo = await agendar({ quando: em(diaDaSemana(6), '10:00') })

  // O pacote da cliente (D5): duas sessões do procedimento de 60 min.
  const { data: pac, error: eP } = await db().rpc('pacote_salvar', {
    p_tenant: rede.tenantId, p_id: null, p_nome: `${PREFIXO} Pacote limpeza ${marca}`, p_preco: 400, p_validade: null, p_ativo: true,
    p_itens: [{ procedure_id: rede.procedureId, quantity: 2 }],
    p_comissao: { venda: { tipo: 'PERCENTAGE', valor: 0 }, execucao: { tipo: 'REGRA', valor: null } },
  })
  expect(eP, 'criar o pacote').toBeNull()
  const { error: eV } = await db().rpc('pacote_vender', {
    p_tenant: rede.tenantId, p_cliente: clienteDoPacote, p_pacote: pac, p_unidade: rede.branchId, p_ator: gestor.userId,
    p_lancamentos: [{ amount: 400, payment_method: 'PIX', is_paid: true }],
    p_sessoes: [{ procedure_id: rede.procedureId, preco: 200 }, { procedure_id: rede.procedureId, preco: 200 }],
  })
  expect(eV, 'vender o pacote').toBeNull()
})

test.afterAll(async () => {
  await profissional?.limpar(); await daRede?.limpar(); await gestor?.limpar(); await rede?.limpar()
})

test('D3: a semana da agenda da unidade tem os 7 dias, e o contador cobre a semana inteira', async ({ browser }) => {
  await como(browser, gestor!, async p => {
    await p.goto(`/${slug}/agenda?date=${SEGUNDA}`)
    await p.getByRole('button', { name: 'Semana', exact: true }).click()
    await expect(p.locator('th', { hasText: 'DOM' }), 'o domingo está na semana').toHaveCount(1)
    for (const [dia, id] of [[diaDaSemana(5), semana.sabado], [diaDaSemana(6), semana.domingo]] as const) {
      await expect(p.locator(`[data-dia="${dia}"] [data-agendamento="${id}"]`), `o de ${dia} aparece no dia dele`).toHaveCount(1)
    }
    await expect(p.getByText(/de ocupação/).first(), 'o contador conta os 4 da semana').toContainText('4 atendimentos')
  })
})

test('D4: na semana da agenda da rede, o das 23:55 de quinta fica na quinta', async ({ browser }) => {
  await como(browser, daRede!, async p => {
    await p.goto(`/admin/agenda?view=week&date=${SEGUNDA}`)
    await expect(p.locator(`[data-dia="${diaDaSemana(3)}"] [data-agendamento="${semana.quinta}"]`)).toHaveCount(1)
    await expect(p.locator(`[data-dia="${diaDaSemana(4)}"] [data-agendamento="${semana.quinta}"]`)).toHaveCount(0)
  })
})

test('D5: o seletor de horários da sessão do pacote testa a duração inteira contra os ocupados e os bloqueios', async ({ browser }) => {
  const outra = await rede!.criarCliente('Ocupa')
  await agendar({ quando: em(ALVO, '10:30'), cli: outra })
  await bloquear(rede!.professionalId, em(ALVO, '14:00'), em(ALVO, '15:00'), 'Curso')
  await como(browser, gestor!, async p => {
    await p.goto(`/${slug}/clients/${clienteDoPacote}`)
    await p.getByText('TRATAMENTO EM ANDAMENTO').first().click()
    await p.getByRole('button', { name: /Gerenciar/ }).first().click()
    await p.getByRole('button', { name: 'Agendar', exact: true }).first().click()
    const agendar = p.locator('[data-agendar-sessao]')
    await agendar.getByLabel('Profissional').selectOption(rede!.professionalId)
    await agendar.getByLabel('Data').fill(ALVO)
    const grade = agendar.locator('[data-grade-de-horarios]')
    await expect(grade.locator('[data-horario="11:00"]')).toBeEnabled()
    // 60 min às 10:00 batem no das 10:30; às 13:30 e às 14:30, no bloqueio.
    for (const h of ['10:00', '10:30', '13:30', '14:00', '14:30']) {
      await expect(grade.locator(`[data-horario="${h}"]`), `${h} não cabe`).toBeDisabled()
    }
    await expect(grade.locator('[data-horario="15:00"]')).toBeEnabled()
    await expect(grade.locator('[data-horario="14:00"]')).toHaveAttribute('title', /Bloqueado/)
  })
})

test('D9: o aviso do bloqueio aparece ANTES de o Confirmar gravar', async ({ browser }) => {
  await bloquear(rede!.professionalId, em(ALVO, '18:00'), em(ALVO, '20:00'), 'Ferias')
  await como(browser, gestor!, async p => {
    await p.goto(`/${slug}/agenda?date=${ALVO}&novo=1&cliente=${cliente}`)
    const modal = p.getByRole('dialog', { name: 'Novo agendamento' })
    await expect(modal.getByText(`${PREFIXO} Agenda`)).toBeVisible()
    await modal.locator('#ag-procedimento').selectOption(rede!.procedureId)
    await modal.locator('#ag-profissional').selectOption(rede!.professionalId)
    // O que a tela tinha à vista no instante do envio.
    await p.evaluate(() => {
      document.addEventListener('submit', () => {
        (window as unknown as { avisoNoEnvio: boolean }).avisoNoEnvio = !!document.querySelector('[data-aviso-do-horario]')
      }, true)
    })
    await modal.locator('#ag-quando').fill(`${ALVO}T18:30`)
    await modal.getByRole('button', { name: 'Confirmar agendamento' }).click()
    await expect(modal).toBeHidden()
    expect(await p.evaluate(() => (window as unknown as { avisoNoEnvio?: boolean }).avisoNoEnvio),
      'o aviso do bloqueio estava na tela quando o Confirmar gravou').toBe(true)
  })
  const { data } = await db().from('appointments').select('id').eq('client_id', cliente).eq('scheduled_at', em(ALVO, '18:30'))
  expect(data, 'o encaixe no bloqueado é permitido: gravou').toHaveLength(1)
})

test('D15: a ocupação desconta o tempo bloqueado, e a "Minha agenda" não oferece horário livre dentro dele', async ({ browser }) => {
  // Hoje, 6 h bloqueadas da profissional da unidade: a capacidade é 2 × 24 h − 6 h.
  await bloquear(rede!.professionalId, em(hoje, '00:00'), em(hoje, '06:00'), 'Exame')
  await como(browser, gestor!, async p => {
    await p.goto(`/${slug}/dashboard`)
    await expect(p.locator('[data-base-da-ocupacao]').last()).toContainText(`de ${(2 * 24 * 60 - 6 * 60).toLocaleString('pt-BR')} min abertos`)
  })

  // A "Minha agenda": 10:00 e 14:00, com o bloqueio das 11:00 às 13:00 no meio.
  await agendar({ quando: em(ALVO, '10:00'), prof: profissional!.userId })
  await agendar({ quando: em(ALVO, '14:00'), prof: profissional!.userId })
  await bloquear(profissional!.userId, em(ALVO, '11:00'), em(ALVO, '13:00'), 'Almoço longo')
  await como(browser, profissional!, async p => {
    await p.goto(`/${slug}/agenda?date=${ALVO}`)
    await expect(p.getByText('10:30 – 11:00')).toBeVisible()
    await expect(p.getByText('13:00 – 14:00')).toBeVisible()
    await expect(p.getByText('10:30 – 14:00'), 'o bloqueio não é horário livre').toHaveCount(0)
  })
})
