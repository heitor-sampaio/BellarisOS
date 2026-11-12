import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao, chamarAcaoComFormulario } from './apoio/acao-direta'
import { haMinutosHoje } from './apoio/datas'

/**
 * F65 — as guardas de situação da agenda (C10–C13 e C15 do levantamento das
 * regras, 2026-11-11). O que valia pelo id, sem a tela:
 *
 * - C10 (D20): a agenda em VER confirmava, cancelava e marcava a falta pela
 *   `updateAppointmentStatus` (pedia só VIEW). Quem confirma, cancela e marca
 *   a falta é a agenda em Gerenciar.
 * - C11: "Iniciar" pelo status reabria o concluído, o cancelado e a falta (o
 *   update não tinha guarda) — e o banco deixava o concluído voltar a "em
 *   atendimento". Agora só inicia o Confirmado/Chegou, e o gatilho recusa
 *   qualquer saída do Concluído.
 * - C12: o "Cancelar" da janela fazia o update genérico — trocava a Falta
 *   por Cancelado. Passa pelo `cancelarCore`.
 * - C13 (H5 = a): só se conclui o que foi iniciado — `finishSession`,
 *   `concluir_atendimento` e o "Concluído" pelo status recusam Agendado,
 *   Confirmado e Chegou; e o "Concluído" pelo status não reescreve a hora da
 *   conclusão nem aceita a desistência como prova.
 * - C15: remarcar recusa o Em atendimento; a evolução não se escreve no
 *   cancelado; e a profissional inicia o DELA numa unidade em que atende (o
 *   status pedia a unidade ao alcance, não o agendamento).
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let slug = ''
let outraUnidade = ''
let vista: MembroDeTeste | null = null
let gerente: MembroDeTeste | null = null
let profissional: MembroDeTeste | null = null
let n = 0

async function agendado(status: string, opcoes: { professionalId?: string; branchId?: string; minutosAtras?: number } = {}) {
  const cliente = await rede!.criarCliente(`Gs${n++}`)
  const { data, error } = await db().from('appointments').insert({
    branch_id: opcoes.branchId ?? rede!.branchId, client_id: cliente, procedure_id: rede!.procedureId,
    professional_id: opcoes.professionalId ?? rede!.professionalId,
    status: status === 'COMPLETED' ? 'IN_PROGRESS' : status, source: 'INTERNAL', duration_min: 30, price: 0,
    scheduled_at: haMinutosHoje(opcoes.minutosAtras ?? 60),
  }).select('id').single<{ id: string }>()
  expect(error, 'agendar').toBeNull()
  // O concluído nasce pelo caminho de verdade (em atendimento → concluído).
  if (status === 'COMPLETED') {
    expect((await db().from('appointments').update({ status: 'COMPLETED', completed_at: '2026-01-01T12:00:00Z' }).eq('id', data!.id)).error).toBeNull()
  }
  return data!.id
}
const situacao = async (id: string) => (await db().from('appointments')
  .select('status, completed_at, scheduled_at').eq('id', id)
  .single<{ status: string; completed_at: string | null; scheduled_at: string }>()).data!

async function como(browser: Browser, quem: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: quem.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

function acoes(p: Page) {
  const rota = `/${slug}/agenda`
  return {
    status: (id: string, s: string, motivo: string | null = null) =>
      chamarAcao(p, 'actions/appointments.ts', 'updateAppointmentStatus', rota, [id, s, slug, motivo, { inicioAdiantadoConfirmado: true }]),
    finalizar: (id: string) => chamarAcaoComFormulario(p, 'actions/appointments.ts', 'finishSession', `/${slug}/agenda/${id}`,
      [null], { appointment_id: id, slug, products_used: '[]', notes: '', intercurrences: '' }),
    remarcar: (id: string, quando: string) => chamarAcaoComFormulario(p, 'actions/appointments.ts', 'rescheduleAppointment', rota,
      [undefined], { _appointmentId: id, scheduled_at: quando, professional_id: '', _slug: slug }),
    evolucao: (id: string) => chamarAcaoComFormulario(p, 'actions/appointments.ts', 'saveDraftNotes', `/${slug}/agenda/${id}`,
      [null], { appointment_id: id, notes: `evolução ${marca}`, intercurrences: '' }),
  }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`gs${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  const { data: b2, error } = await db().from('branches')
    .insert({ tenant_id: rede.tenantId, name: `[e2e] Segunda gs${marca}`, slug: `e2e-gs2-${marca}` }).select('id').single<{ id: string }>()
  expect(error, 'a segunda unidade').toBeNull()
  outraUnidade = b2!.id
  expect((await db().from('users').update({ atende_em: [rede.branchId] }).eq('id', rede.professionalId)).error).toBeNull()
  vista = await criarMembro(`gsv${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Só vê a agenda',
    permissoes: [{ modulo: 'agenda', nivel: 'VIEW', escopo: 'ALL' }, { modulo: 'clients', nivel: 'VIEW' }],
  })
  gerente = await criarMembro(`gsg${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Recepção',
    permissoes: [
      { modulo: 'agenda', nivel: 'MANAGE', escopo: 'ALL' }, { modulo: 'clients', nivel: 'VIEW' },
      { modulo: 'medical_records', nivel: 'MANAGE', escopo: 'ALL' },
    ],
  })
  profissional = await criarMembro(`gsp${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Profissional',
    permissoes: [{ modulo: 'agenda', nivel: 'VIEW', escopo: 'OWN' }, { modulo: 'medical_records', nivel: 'MANAGE', escopo: 'OWN' }],
  })
  expect((await db().from('users').update({ atende_em: [rede.branchId, outraUnidade] }).eq('id', profissional.userId)).error).toBeNull()
})
test.afterAll(async () => {
  if (rede) {
    const ids = ((await db().from('appointments').select('id').in('branch_id', [rede.branchId, outraUnidade].filter(Boolean))).data ?? []).map(a => a.id)
    if (ids.length) {
      await db().from('medical_record_entries').delete().in('appointment_id', ids)
      await db().from('appointment_history').delete().in('appointment_id', ids)
    }
  }
  await vista?.limpar(); await gerente?.limpar(); await profissional?.limpar(); await rede?.limpar()
})

test('C10: a agenda em Ver não confirma, não cancela nem marca a falta pelo id; em Gerenciar, sim', async ({ browser }) => {
  const confirmar = await agendado('SCHEDULED')
  const cancelar  = await agendado('SCHEDULED')
  const faltar    = await agendado('CONFIRMED')
  await como(browser, vista!, async p => {
    const a = acoes(p)
    await a.status(confirmar, 'CONFIRMED')
    await a.status(cancelar, 'CANCELLED', `${marca} motivo`)
    await a.status(faltar, 'NO_SHOW')
  })
  expect((await situacao(confirmar)).status, 'não confirmou').toBe('SCHEDULED')
  expect((await situacao(cancelar)).status, 'não cancelou').toBe('SCHEDULED')
  expect((await situacao(faltar)).status, 'não marcou a falta').toBe('CONFIRMED')
  // Controle: a recepção (Gerenciar) faz as três.
  await como(browser, gerente!, async p => {
    const a = acoes(p)
    await a.status(confirmar, 'CONFIRMED')
    await a.status(cancelar, 'CANCELLED', `${marca} motivo`)
    await a.status(faltar, 'NO_SHOW')
  })
  expect((await situacao(confirmar)).status).toBe('CONFIRMED')
  expect((await situacao(cancelar)).status).toBe('CANCELLED')
  expect((await situacao(faltar)).status).toBe('NO_SHOW')
})

test('C11: "Iniciar" pelo status não reabre o concluído, o cancelado nem a falta, e não pula o Agendado; o Confirmado inicia', async ({ browser }) => {
  const concluido = await agendado('COMPLETED')
  const cancelado = await agendado('CANCELLED')
  const falta     = await agendado('NO_SHOW')
  const agendadoS = await agendado('SCHEDULED')
  const confirmado = await agendado('CONFIRMED')
  await como(browser, gerente!, async p => {
    const a = acoes(p)
    const r = await a.status(concluido, 'IN_PROGRESS')
    expect(r.texto, 'a recusa diz por quê').toContain('confirmado ou ter chegado')
    await a.status(cancelado, 'IN_PROGRESS')
    await a.status(falta, 'IN_PROGRESS')
    await a.status(agendadoS, 'IN_PROGRESS')
    await a.status(confirmado, 'IN_PROGRESS')
  })
  expect((await situacao(concluido)).status, 'o concluído continua concluído').toBe('COMPLETED')
  expect((await situacao(cancelado)).status).toBe('CANCELLED')
  expect((await situacao(falta)).status).toBe('NO_SHOW')
  expect((await situacao(agendadoS)).status, 'o agendado não inicia sem a chegada').toBe('SCHEDULED')
  expect((await situacao(confirmado)).status, 'controle').toBe('IN_PROGRESS')
})

test('C11: o banco não deixa o concluído mudar de situação (nem para em atendimento)', async () => {
  const concluido = await agendado('COMPLETED')
  for (const s of ['IN_PROGRESS', 'SCHEDULED', 'CONFIRMED', 'ARRIVED']) {
    const r = await db().from('appointments').update({ status: s }).eq('id', concluido)
    expect(r.error?.message, s).toContain('Atendimento concluído')
  }
  expect((await situacao(concluido)).status).toBe('COMPLETED')
})

test('C12: o "Cancelar" da janela não troca a falta por cancelado (nem o cancelado por falta)', async ({ browser }) => {
  const falta     = await agendado('NO_SHOW')
  const cancelado = await agendado('CANCELLED')
  await como(browser, gerente!, async p => {
    const a = acoes(p)
    await a.status(falta, 'CANCELLED', `${marca} motivo`)
    await a.status(cancelado, 'NO_SHOW')
  })
  expect((await situacao(falta)).status).toBe('NO_SHOW')
  expect((await situacao(cancelado)).status).toBe('CANCELLED')
})

test('C13: só se conclui o que foi iniciado — Finalizar, a função e o "Concluído" recusam Confirmado e Chegou', async ({ browser }) => {
  const confirmado = await agendado('CONFIRMED')
  const chegou     = await agendado('ARRIVED')
  await como(browser, gerente!, async p => {
    const a = acoes(p)
    const r = await a.finalizar(confirmado)
    expect(r.texto, 'a recusa diz o caminho').toContain('Iniciar')
    await a.finalizar(chegou)
  })
  expect((await situacao(confirmado)).status).toBe('CONFIRMED')
  expect((await situacao(chegou)).status).toBe('ARRIVED')
  // A função do banco também recusa sozinha.
  const direto = await db().rpc('concluir_atendimento', {
    p_agendamento: chegou, p_tenant: rede!.tenantId, p_ator: null, p_ator_nome: null,
    p_dados: { notas: null, intercorrencias: null, comissoes: [], insumos: [] },
  })
  expect(direto.error?.message, 'concluir_atendimento direto').toContain('Iniciar')
  expect((await situacao(chegou)).status).toBe('ARRIVED')
})

test('C13: o "Concluído" pelo status não reescreve a hora da conclusão nem aceita a desistência como prova', async ({ browser }) => {
  const concluido = await agendado('COMPLETED')
  const desistiu  = await agendado('CANCELLED')
  // A entrada do prontuário de cada um (a desistência também grava uma).
  for (const id of [desistiu, concluido]) {
    const cliente = (await db().from('appointments').select('client_id').eq('id', id).single<{ client_id: string }>()).data!.client_id
    const { data: rec } = await db().from('medical_records').upsert({ client_id: cliente }, { onConflict: 'client_id' }).select('id').single<{ id: string }>()
    expect((await db().from('medical_record_entries').insert({ appointment_id: id, medical_record_id: rec!.id, professional_id: rede!.professionalId })).error).toBeNull()
  }
  await como(browser, gerente!, async p => {
    const a = acoes(p)
    await a.status(concluido, 'COMPLETED')
    await a.status(desistiu, 'COMPLETED')
  })
  expect((await situacao(concluido)).completed_at, 'a hora da conclusão ficou').toBe('2026-01-01T12:00:00+00:00')
  expect((await situacao(desistiu)).status, 'a desistência não vira concluído').toBe('CANCELLED')
})

test('C15: não remarca o Em atendimento, e a evolução não se escreve no cancelado', async ({ browser }) => {
  const emCurso   = await agendado('IN_PROGRESS')
  const cancelado = await agendado('CANCELLED')
  const antes = await situacao(emCurso)
  const outraHora = new Date(new Date(antes.scheduled_at).getTime() + 3 * 3600_000).toISOString()
  await como(browser, gerente!, async p => {
    const a = acoes(p)
    const r = await a.remarcar(emCurso, outraHora)
    expect(r.texto, 'a recusa diz por quê').toContain('em atendimento')
    await a.evolucao(cancelado)
  })
  expect((await situacao(emCurso)).scheduled_at, 'o horário ficou').toBe(antes.scheduled_at)
  const { data: entrada } = await db().from('medical_record_entries').select('notes').eq('appointment_id', cancelado).maybeSingle()
  expect(entrada?.notes ?? null, 'nada escrito no cancelado').toBeNull()
})

test('C15: a profissional "só os meus" inicia o DELA numa unidade em que atende, fora da dela', async ({ browser }) => {
  const dela = await agendado('CONFIRMED', { professionalId: profissional!.userId, branchId: outraUnidade, minutosAtras: 5 })
  await como(browser, profissional!, async p => {
    await acoes(p).status(dela, 'IN_PROGRESS')
  })
  expect((await situacao(dela)).status).toBe('IN_PROGRESS')
})
