import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { clienteComSessao, criarMembro, type ClienteDeTeste, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcaoComFormulario } from './apoio/acao-direta'

/**
 * F17-3 (o Heitor, às decisões da F17: "a ser configurado pela clínica, mas, a
 * princípio, avaliação do atendimento e avaliação por procedimento também").
 *
 * - Configurações → Geral: "O que a cliente avalia" — o atendimento e cada
 *   procedimento (o PADRÃO), só o atendimento, ou só cada procedimento.
 * - Com os dois, a cliente dá a nota do ATENDIMENTO (vale para o atendimento e
 *   a profissional) e uma para CADA procedimento feito nele: na sessão de plano
 *   Botox + Preenchimento, Botox 5 e Preenchimento 4. O ranking por
 *   procedimento usa a nota do procedimento; o da profissional, a do
 *   atendimento.
 * - Só o atendimento: cada procedimento do atendimento recebe a nota dele.
 * - Só cada procedimento: a profissional fica com a média das notas.
 * - A avaliação de antes (`procedure_rating` + `client_rating`) continua
 *   valendo: a do atendimento e a do procedimento do agendamento.
 *
 * Rede `[e2e]` própria; a cliente tem login.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let dona: MembroDeTeste | null = null
let cliente: ClienteDeTeste | null = null
let slug = ''
let botox = ''
let preench = ''
const n = (v: unknown) => Number(v ?? 0)
const ontem = new Date(Date.now() - 86_400_000).toISOString()
const janela = () => ({ p_from: new Date(Date.now() - 3 * 86_400_000).toISOString(), p_to: new Date(Date.now() + 86_400_000).toISOString() })

async function como(browser: Browser, estado: string, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

/** Uma sessão de plano Botox + Preenchimento, concluída (o atendimento é "Botox"). */
async function sessaoDePlano() {
  const { data: tp, error: eTp } = await db().from('treatment_plans').insert({
    client_id: cliente!.clientId, branch_id: rede!.branchId, professional_id: rede!.professionalId, status: 'ACCEPTED', name: `${PREFIXO} Plano ${marca}`,
  }).select('id').single<{ id: string }>()
  expect(eTp, 'o plano').toBeNull()
  const { data: ap, error: eAp } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: cliente!.clientId, procedure_id: botox, professional_id: rede!.professionalId,
    status: 'COMPLETED', source: 'INTERNAL', duration_min: 60, price: 2000, scheduled_at: ontem, completed_at: ontem,
    treatment_plan_id: tp!.id,
  }).select('id').single<{ id: string }>()
  expect(eAp, 'o atendimento').toBeNull()
  const { data: ses, error: eSes } = await db().from('treatment_plan_sessions').insert({ plan_id: tp!.id, sort_order: 1, appointment_id: ap!.id }).select('id').single<{ id: string }>()
  expect(eSes, 'a sessão').toBeNull()
  expect((await db().from('treatment_plan_session_procedures').insert([
    { session_id: ses!.id, procedure_id: botox, price: 800, sort_order: 1 },
    { session_id: ses!.id, procedure_id: preench, price: 1200, sort_order: 2 },
  ])).error).toBeNull()
  return ap!.id
}

async function notas() {
  const p = { p_tenant: rede!.tenantId, p_branch_ids: [rede!.branchId], ...janela(), p_limit: 10 }
  const { data: procs, error: e1 } = await db().rpc('metrics_top_procedures', p)
  expect(e1).toBeNull()
  const { data: profs, error: e2 } = await db().rpc('metrics_top_professionals', p)
  expect(e2).toBeNull()
  const porProc = Object.fromEntries((procs as { procedure_id: string; avg_rating: number | null; rating_count: number }[])
    .map(x => [x.procedure_id === botox ? 'botox' : x.procedure_id === preench ? 'preench' : x.procedure_id, [x.avg_rating == null ? null : n(x.avg_rating), n(x.rating_count)]]))
  const prof = (profs as { professional_id: string; avg_rating: number | null; rating_count: number }[]).find(x => x.professional_id === rede!.professionalId)
  return { botox: porProc.botox, preench: porProc.preench, profissional: prof ? [prof.avg_rating == null ? null : n(prof.avg_rating), n(prof.rating_count)] : null }
}

async function avaliar(estado: string, browser: Browser, ap: string, notasDadas: Record<string, number>) {
  await como(browser, estado, async p => {
    await p.goto(`/${slug}/cliente/atendimentos/${ap}/confirmar`)
    for (const [grupo, nota] of Object.entries(notasDadas)) {
      await p.getByRole('group', { name: grupo, exact: true }).getByRole('button', { name: `${grupo}: ${nota} de 5 estrelas` }).click()
    }
    await p.getByRole('button', { name: 'Confirmar que realizei o atendimento' }).click()
    await expect(p).toHaveURL(/\/cliente\/historico/)
  })
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`av${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  botox = rede.procedureId
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  expect((await db().from('procedures').update({ name: `${PREFIXO} Botox ${marca}`, price: 800 }).eq('id', botox)).error).toBeNull()
  const { data: pr, error } = await db().from('procedures').insert({
    tenant_id: rede.tenantId, name: `${PREFIXO} Preenchimento ${marca}`, category: 'e2e', duration_min: 30, price: 1200,
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  preench = pr!.id
  dona = await criarMembro(`avd${marca}`, { tenant: rede.tenantId, donoDaRede: true, permissoes: [] })
  cliente = await clienteComSessao(`av${marca}`, { id: rede.branchId, slug }, { tenant: rede.tenantId })
})

test.afterAll(async () => {
  await cliente?.limpar(); await dona?.limpar(); await rede?.limpar()
})

test.describe.serial('a avaliação do atendimento e de cada procedimento', () => {
  test('Configurações → Geral: "O que a cliente avalia" nasce nos dois, e a clínica escolhe', async ({ browser }) => {
    expect((await db().from('tenants').select('avaliacao_o_que').eq('id', rede!.tenantId).single()).data?.avaliacao_o_que, 'o padrão').toBe('OS_DOIS')
    await como(browser, dona!.estado, async p => {
      await p.goto('/admin/settings?tab=general')
      const campo = p.getByLabel('O que a cliente avalia')
      await expect(campo).toHaveValue('OS_DOIS')
      await campo.selectOption('ATENDIMENTO')
      await p.getByRole('button', { name: 'Salvar' }).click()
      await expect(p.getByText('Salvo', { exact: true })).toBeVisible()
    })
    expect((await db().from('tenants').select('avaliacao_o_que').eq('id', rede!.tenantId).single()).data?.avaliacao_o_que).toBe('ATENDIMENTO')
    // Valor que não existe é recusado (a action).
    await como(browser, dona!.estado, async p => {
      await p.goto('/admin/settings?tab=general')
      const r = await chamarAcaoComFormulario(p, 'actions/rede.ts', 'atualizarDadosDaRede', '/admin/settings', [undefined], {
        name: `${PREFIXO} Outra rede ${marca}`, portal_prazo_alteracao_horas: '24', plano_validade_dias: '30', avaliacao_o_que: 'TUDO',
      })
      expect(r.texto).toContain('O que a cliente avalia')
    })
    expect((await db().from('tenants').update({ avaliacao_o_que: 'OS_DOIS' }).eq('id', rede!.tenantId)).error).toBeNull()
  })

  test('com os dois: a nota do atendimento (a profissional) e uma para cada procedimento da sessão (Botox 5, Preenchimento 4)', async ({ browser }) => {
    const ap = await sessaoDePlano()
    await como(browser, cliente!.estado, async p => {
      await p.goto(`/${slug}/cliente/atendimentos/${ap}/confirmar`)
      await expect(p.getByRole('group', { name: 'Atendimento', exact: true })).toBeVisible()
      await expect(p.getByRole('group', { name: `Procedimento: ${PREFIXO} Botox ${marca}` })).toBeVisible()
      await expect(p.getByRole('group', { name: `Procedimento: ${PREFIXO} Preenchimento ${marca}` })).toBeVisible()
    })
    await avaliar(cliente!.estado, browser, ap, { Atendimento: 3, [`Procedimento: ${PREFIXO} Botox ${marca}`]: 5, [`Procedimento: ${PREFIXO} Preenchimento ${marca}`]: 4 })
    expect((await db().from('appointments').select('client_rating, procedure_rating, client_confirmed_at').eq('id', ap).single()).data)
      .toMatchObject({ client_rating: 3, procedure_rating: null })
    const linhas = ((await db().from('avaliacoes_dos_procedimentos').select('procedure_id, nota').eq('appointment_id', ap)).data ?? [])
      .map(l => [l.procedure_id === botox ? 'botox' : 'preench', l.nota]).sort()
    expect(linhas).toEqual([['botox', 5], ['preench', 4]])
    expect(await notas(), 'o procedimento pela nota dele; a profissional pela do atendimento').toEqual({
      botox: [5, 1], preench: [4, 1], profissional: [3, 1],
    })

    // A equipe vê as notas na tela do atendimento.
    await como(browser, dona!.estado, async p => {
      await p.goto(`/admin/agenda/${ap}`)
      await expect(p.locator('[data-avaliacao-da-cliente]')).toContainText(`Atendimento 3/5 · ${PREFIXO} Botox ${marca} 5/5 · ${PREFIXO} Preenchimento ${marca} 4/5`)
    })
  })

  test('só o atendimento: a cliente dá uma nota, e cada procedimento do atendimento fica com ela', async ({ browser }) => {
    expect((await db().from('tenants').update({ avaliacao_o_que: 'ATENDIMENTO' }).eq('id', rede!.tenantId)).error).toBeNull()
    const ap = await sessaoDePlano()
    await como(browser, cliente!.estado, async p => {
      await p.goto(`/${slug}/cliente/atendimentos/${ap}/confirmar`)
      await expect(p.getByRole('group', { name: 'Atendimento', exact: true })).toBeVisible()
      await expect(p.getByRole('group', { name: `Procedimento: ${PREFIXO} Botox ${marca}` })).toHaveCount(0)
    })
    await avaliar(cliente!.estado, browser, ap, { Atendimento: 1 })
    expect(await notas(), 'cada procedimento recebe a nota do atendimento').toEqual({
      botox: [3, 2], preench: [2.5, 2], profissional: [2, 2],
    })
  })

  test('só cada procedimento: a profissional fica com a média das notas dos procedimentos', async ({ browser }) => {
    expect((await db().from('tenants').update({ avaliacao_o_que: 'PROCEDIMENTOS' }).eq('id', rede!.tenantId)).error).toBeNull()
    const ap = await sessaoDePlano()
    await como(browser, cliente!.estado, async p => {
      await p.goto(`/${slug}/cliente/atendimentos/${ap}/confirmar`)
      await expect(p.getByRole('group', { name: 'Atendimento', exact: true })).toHaveCount(0)
    })
    await avaliar(cliente!.estado, browser, ap, { [`Procedimento: ${PREFIXO} Botox ${marca}`]: 4, [`Procedimento: ${PREFIXO} Preenchimento ${marca}`]: 2 })
    expect((await db().from('appointments').select('client_rating').eq('id', ap).single()).data?.client_rating, 'sem nota do atendimento').toBeNull()
    // Botox 5, 1, 4 → 3,33; Preenchimento 4, 1, 2 → 2,33; a profissional 3, 1 e (4+2)/2 = 3 → 2,33.
    const r = await notas()
    expect([r.botox![0]!.toFixed(2), r.botox![1], r.preench![0]!.toFixed(2), r.profissional![0]!.toFixed(2), r.profissional![1]]).toEqual(['3.33', 3, '2.33', '2.33', 3])
    expect((await db().from('tenants').update({ avaliacao_o_que: 'OS_DOIS' }).eq('id', rede!.tenantId)).error).toBeNull()
  })

  test('a avaliação de antes continua valendo: a do atendimento e a do procedimento do agendamento', async () => {
    const { error } = await db().from('appointments').insert({
      branch_id: rede!.branchId, client_id: cliente!.clientId, procedure_id: preench, professional_id: rede!.professionalId,
      status: 'COMPLETED', source: 'INTERNAL', duration_min: 30, price: 1200, scheduled_at: ontem, completed_at: ontem,
      client_confirmed_at: ontem, procedure_rating: 5, client_rating: 5,
    })
    expect(error).toBeNull()
    const r = await notas()
    // Preenchimento: 4, 1, 2 e o 5 de antes → 3; a profissional: 3, 1, 3 e o 5 → 3.
    expect([r.preench, r.profissional]).toEqual([[3, 4], [3, 4]])
  })

  test('a action recusa nota de procedimento que não foi feito no atendimento, e avaliar de novo', async ({ browser }) => {
    const ap = await sessaoDePlano()
    const { data: outro } = await db().from('procedures').insert({
      tenant_id: rede!.tenantId, name: `${PREFIXO} Outro ${marca}`, category: 'e2e', duration_min: 30, price: 10,
    }).select('id').single<{ id: string }>()
    await como(browser, cliente!.estado, async p => {
      await p.goto(`/${slug}/cliente/atendimentos/${ap}/confirmar`)
      const { chamarAcao } = await import('./apoio/acao-direta')
      const r = await chamarAcao(p, 'actions/appointments.ts', 'confirmAndRateAppointment', `/${slug}/cliente/atendimentos/${ap}/confirmar`, [{
        appointmentId: ap, slug, professionalRating: 4, notasDosProcedimentos: [{ procedureId: outro!.id, nota: 1 }],
      }])
      expect(r.texto).toContain('não foi feito')
    })
    expect((await db().from('avaliacoes_dos_procedimentos').select('nota').eq('appointment_id', ap)).data ?? []).toEqual([])
    expect((await db().from('appointments').select('client_confirmed_at').eq('id', ap).single()).data?.client_confirmed_at, 'nada gravado').toBeNull()
  })
})
