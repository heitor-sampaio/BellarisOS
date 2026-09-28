import { test, expect, type APIRequestContext } from '@playwright/test'
import { banco, filiaisAtivas, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'

/**
 * As rotas da extensão (`/api/ext/*`) com o TOKEN de verdade — até aqui só o
 * "sem credencial → 401" tinha teste (`api-sem-credencial.spec.ts`).
 *
 * A extensão roda fora do app: não tem cookie, fala por `Authorization:
 * Bearer`, e nenhuma tela a protege. Quem decide tudo é `requireExtAccess`
 * (módulo e escopo), `resolveExtBranch` (a unidade) e `createAppointmentCore`
 * (as peças do agendamento).
 *
 * Numa rede `[e2e]` com duas unidades: o comercial da rede escolhe a unidade;
 * a recepção da A é sempre a A, peça o que pedir.
 */

const marca = Date.now().toString(36)
const db = () => banco()

interface Fx {
  outra: OutraRede; unidadeA: string; cliente: string; apptB: string; dia: string
  comercial: MembroDeTeste; recepcaoA: MembroDeTeste; semAgenda: MembroDeTeste; soOsMeus: MembroDeTeste
  unidadeReal: string
}
let f: Fx | null = null
const criado: { outra?: OutraRede; unidadeA?: string; membros: MembroDeTeste[] } = { membros: [] }

test.beforeAll(async () => {
  const b = db()
  const outra = await criarOutraRede(`ext${marca}`)
  criado.outra = outra
  const { data: a, error } = await b.from('branches')
    .insert({ tenant_id: outra.tenantId, name: `${PREFIXO} Unidade A ${marca}`, slug: `e2e-exta-${marca}` })
    .select('id').single<{ id: string }>()
  expect(error).toBeNull()
  criado.unidadeA = a!.id
  const membro = async (chave: string, rotulo: string, opcoes: Omit<Parameters<typeof criarMembro>[1], 'rotulo' | 'tenant'>) => {
    const m = await criarMembro(`ext${chave}${marca}`, { ...opcoes, rotulo, tenant: outra.tenantId })
    criado.membros.push(m); return m
  }
  const cliente = await outra.criarCliente('extensão')
  const amanha = new Date(Date.now() + 86_400_000); amanha.setUTCHours(14, 0, 0, 0)
  const { data: appt, error: eA } = await b.from('appointments').insert({
    branch_id: outra.branchId, client_id: cliente, procedure_id: outra.procedureId, professional_id: outra.professionalId,
    scheduled_at: amanha.toISOString(), duration_min: 60, price: 100, status: 'SCHEDULED', source: 'INTERNAL',
  }).select('id').single<{ id: string }>()
  expect(eA).toBeNull()
  const reais = await filiaisAtivas()

  const agenda = [{ modulo: 'agenda' as const, nivel: 'MANAGE' as const }, { modulo: 'clients' as const, nivel: 'VIEW' as const }]
  f = {
    outra, unidadeA: a!.id, cliente, apptB: appt!.id,
    // A data do agendamento no fuso do negócio (a rota recorta o dia em -03:00).
    dia: new Date(amanha.getTime() - 3 * 3600_000).toISOString().slice(0, 10),
    comercial: await membro('com', 'Comercial', { permissoes: [...agenda, { modulo: 'team', nivel: 'MANAGE' }] }),
    recepcaoA: await membro('reca', 'Recepção A', { branchId: a!.id, permissoes: agenda }),
    semAgenda: await membro('sem', 'Sem agenda', { permissoes: [{ modulo: 'clients', nivel: 'VIEW' }] }),
    soOsMeus:  await membro('own', 'Só os meus', { permissoes: [{ modulo: 'agenda', nivel: 'MANAGE', escopo: 'OWN' }] }),
    unidadeReal: reais[0]!.id,
  }
})

test.afterAll(async () => {
  if (!criado.outra) return
  const b = db()
  const falhas: string[] = []
  const olhar = (o: string, r: { error: { message: string } | null }) => { if (r.error) falhas.push(`${o}: ${r.error.message}`) }
  // O cliente primeiro: leva os agendamentos (e o histórico deles, que aponta
  // para quem criou pela extensão) — sem isso o membro não sai.
  await criado.outra.limpar()
  for (const m of criado.membros) await m.limpar()
  if (criado.unidadeA) olhar('unidade A', await b.from('branches').delete().eq('id', criado.unidadeA))
  olhar('rede', await b.from('tenants').delete().eq('id', criado.outra.tenantId))
  expect(falhas).toEqual([])
})

/** Uma chamada da extensão: token no cabeçalho, nada de cookie. */
async function ext(request: APIRequestContext, quem: MembroDeTeste, metodo: 'GET' | 'POST', rota: string, corpo?: unknown) {
  const r = await request.fetch(rota, {
    method: metodo,
    headers: { authorization: `Bearer ${quem.accessToken}`, ...(corpo ? { 'content-type': 'application/json' } : {}) },
    data: corpo ? JSON.stringify(corpo) : undefined,
  })
  return { status: r.status(), corpo: await r.json().catch(() => ({})) as Record<string, unknown> }
}

test.describe.serial('rotas da extensão com o token', () => {
  test('CORS: a extensão recebe a própria origem de volta no preflight', async ({ request }) => {
    const r = await request.fetch('/api/ext/bootstrap', { method: 'OPTIONS', headers: { origin: 'chrome-extension://abcdef' } })
    expect(r.status()).toBe(204)
    expect(r.headers()['access-control-allow-origin']).toBe('chrome-extension://abcdef')
  })

  test('módulo e escopo: sem agenda, 403; com "só os meus", 403 explicado', async ({ request }) => {
    expect((await ext(request, f!.semAgenda, 'GET', '/api/ext/bootstrap')).status).toBe(403)
    const own = await ext(request, f!.soOsMeus, 'GET', `/api/ext/bootstrap?branchId=${f!.outra.branchId}`)
    expect(own.status).toBe(403)
    expect(String(own.corpo.error)).toContain('não usa a extensão')
  })

  test('comercial da rede: escolhe a unidade da rede; a de outra rede é recusada', async ({ request }) => {
    const unidades = await ext(request, f!.comercial, 'GET', '/api/ext/branches')
    expect(unidades.corpo.mode).toBe('network')
    expect((unidades.corpo.branches as { id: string }[]).map(u => u.id).sort()).toEqual([f!.unidadeA, f!.outra.branchId].sort())

    expect((await ext(request, f!.comercial, 'GET', '/api/ext/bootstrap')).status, 'sem unidade').toBe(400)
    const alheia = await ext(request, f!.comercial, 'GET', `/api/ext/bootstrap?branchId=${f!.unidadeReal}`)
    expect(alheia.status, 'unidade de outra rede').toBe(403)

    const boot = await ext(request, f!.comercial, 'GET', `/api/ext/bootstrap?branchId=${f!.outra.branchId}`)
    expect(boot.status).toBe(200)
    expect((boot.corpo.branch as { id: string }).id).toBe(f!.outra.branchId)

    const dia = await ext(request, f!.comercial, 'GET', `/api/ext/agenda?date=${f!.dia}&branchId=${f!.outra.branchId}`)
    expect((dia.corpo.appointments as { id: string }[]).map(x => x.id)).toContain(f!.apptB)
  })

  test('recepção da unidade: é sempre a A — pedir a B devolve a A', async ({ request }) => {
    const unidades = await ext(request, f!.recepcaoA, 'GET', '/api/ext/branches')
    expect(unidades.corpo).toMatchObject({ mode: 'branch', branches: [{ id: f!.unidadeA }] })
    const boot = await ext(request, f!.recepcaoA, 'GET', `/api/ext/bootstrap?branchId=${f!.outra.branchId}`)
    expect((boot.corpo.branch as { id: string }).id).toBe(f!.unidadeA)
    const dia = await ext(request, f!.recepcaoA, 'GET', `/api/ext/agenda?date=${f!.dia}&branchId=${f!.outra.branchId}`)
    expect((dia.corpo.appointments as { id: string }[]).map(x => x.id), 'a agenda da B não vem').not.toContain(f!.apptB)
  })

  test('criar agendamento: peça de outra rede é recusada; o certo nasce COMERCIAL', async ({ request }) => {
    const depois = new Date(Date.now() + 2 * 86_400_000); depois.setUTCHours(15, 0, 0, 0)
    const pedido = {
      branchId: f!.outra.branchId, clientId: f!.cliente, procedureId: f!.outra.procedureId,
      professionalId: f!.outra.professionalId, scheduledAt: depois.toISOString(),
    }
    // Profissional da rede de verdade: não é desta rede.
    const { data: alheio } = await db().from('users').select('id').neq('tenant_id', f!.outra.tenantId).eq('is_active', true).limit(1).single()
    const recusa = await ext(request, f!.comercial, 'POST', '/api/ext/appointments', { ...pedido, professionalId: alheio!.id })
    expect(recusa.status).toBe(409)
    expect(recusa.corpo.error).toBe('Profissional não encontrado.')

    const ok = await ext(request, f!.comercial, 'POST', '/api/ext/appointments', pedido)
    expect(ok.status).toBe(200)
    const { data: criado } = await db().from('appointments').select('branch_id, source').eq('id', ok.corpo.id as string).single()
    expect(criado).toEqual({ branch_id: f!.outra.branchId, source: 'COMMERCIAL' })

    // A recepção da A pedindo a B: nasce na A (a unidade do token vence o pedido).
    const daA = await ext(request, f!.recepcaoA, 'POST', '/api/ext/appointments', {
      ...pedido, scheduledAt: new Date(depois.getTime() + 3 * 3600_000).toISOString(),
    })
    expect(daA.status).toBe(200)
    const { data: naA } = await db().from('appointments').select('branch_id, source').eq('id', daA.corpo.id as string).single()
    expect(naA).toEqual({ branch_id: f!.unidadeA, source: 'INTERNAL' })
  })

  test('membro desativado: o token que já estava na mão para de valer', async ({ request, page }) => {
    expect((await ext(request, f!.recepcaoA, 'GET', '/api/ext/branches')).status).toBe(200)
    await page.context().addCookies([])   // a página é só o veículo da action
    const ctx = await page.context().browser()!.newContext({ storageState: f!.comercial.estado })
    try {
      const p = await ctx.newPage()
      await chamarAcao(p, 'actions/team.ts', 'deactivateTeamMember', '/admin/team', [f!.recepcaoA.userId, '/admin/team'])
    } finally { await ctx.close() }
    await expect.poll(async () => (await db().from('users').select('is_active').eq('id', f!.recepcaoA.userId).single()).data?.is_active).toBe(false)
    expect((await ext(request, f!.recepcaoA, 'GET', '/api/ext/branches')).status).toBe(401)
  })
})
