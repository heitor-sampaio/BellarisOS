import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'

/**
 * A ABRANGÊNCIA do membro (§11): quem tem unidade fixa age só na dela.
 *
 * Uma rede `[e2e]` com duas unidades. A "recepção A" tem os módulos todos em
 * MANAGE, mas a unidade A; tudo que o teste tenta é na B, pelo id, direto na
 * action (`chamarAcao`) — que é como o navegador de quem quer furar faria.
 * Cada recusa tem controle: o membro DA REDE, com o mesmo cargo, faz a mesma
 * coisa e o banco muda. E a própria A continua funcionando na A.
 *
 * Até 2026-09-28 quase todas passavam: só a rede era conferida.
 */

const marca = Date.now().toString(36)
const db = () => banco()

const PERMISSOES = (['agenda', 'cashier', 'financial', 'stock', 'team', 'settings', 'medical_records', 'clients'] as const)
  .map(modulo => ({ modulo, nivel: 'MANAGE' as const }))

interface Fx {
  outra: OutraRede; unidadeA: { id: string; slug: string }; slugB: string
  recepcaoA: MembroDeTeste; rede: MembroDeTeste
  cliente: string; apptA: string; apptB: string; txAberto: string; txPago: string
  plano: string; nomePlano: string; planoA: string; mapa: string; mapaA: string; membroB: MembroDeTeste
}
let f: Fx | null = null
// O que já foi criado, para o afterAll limpar mesmo se o beforeAll quebrar no meio.
const criado: { outra?: OutraRede; unidadeA?: string; membros: MembroDeTeste[] } = { membros: [] }

test.beforeAll(async ({ browser }) => {
  const b = db()
  const ins = async (tabela: string, linha: Record<string, unknown>) => {
    const { data, error } = await b.from(tabela).insert(linha).select('id').single<{ id: string }>()
    expect(error, `criar ${tabela}`).toBeNull()
    return data!.id
  }
  const outra = await criarOutraRede(`abr${marca}`)
  criado.outra = outra
  const { data: unB } = await b.from('branches').select('slug').eq('id', outra.branchId).single()
  const slugA = `e2e-una-${marca}`
  const idA = await ins('branches', { tenant_id: outra.tenantId, name: `${PREFIXO} Unidade A ${marca}`, slug: slugA })
  criado.unidadeA = idA
  const membro = async (...args: Parameters<typeof criarMembro>) => {
    const m = await criarMembro(...args); criado.membros.push(m); return m
  }
  const cliente = await outra.criarCliente('abrangência')
  const amanha = new Date(Date.now() + 86_400_000); amanha.setUTCHours(13, 0, 0, 0)
  const agendamento = (branch: string) => ins('appointments', {
    branch_id: branch, client_id: cliente, procedure_id: outra.procedureId, professional_id: outra.professionalId,
    scheduled_at: amanha.toISOString(), duration_min: 60, price: 100, status: 'SCHEDULED', source: 'INTERNAL',
  })
  const lancamento = (pago: boolean) => ins('financial_transactions', {
    branch_id: outra.branchId, client_id: cliente, type: 'INCOME', category: 'Serviços',
    description: `${PREFIXO} abrangência ${pago ? 'pago' : 'aberto'}`, amount: 100, is_paid: pago,
    paid_at: pago ? new Date().toISOString() : null, payment_method: 'PIX', created_by: 'e2e',
  })
  const { planId } = await outra.criarPlanoProposto('abrangência')
  const { data: pl } = await b.from('treatment_plans').select('name').eq('id', planId).single()

  f = {
    outra, unidadeA: { id: idA, slug: slugA }, slugB: unB!.slug as string,
    recepcaoA: await membro(`abrA${marca}`, { tenant: outra.tenantId, branchId: idA, rotulo: 'Recepção A', permissoes: PERMISSOES }),
    rede:      await membro(`abrR${marca}`, { tenant: outra.tenantId, rotulo: 'Gestão da rede', permissoes: PERMISSOES }),
    cliente, apptA: await agendamento(idA), apptB: await agendamento(outra.branchId),
    txAberto: await lancamento(false), txPago: await lancamento(true),
    plano: planId, nomePlano: pl!.name as string,
    // Um plano e um mapa na A: as telas de checkout e de injetáveis precisam de
    // um registro para abrir — é nelas que as actions existem.
    planoA: await ins('treatment_plans', {
      branch_id: idA, client_id: cliente, professional_id: outra.professionalId, status: 'PROPOSED',
      name: `${PREFIXO} Plano A ${marca}`,
    }),
    mapaA: await ins('injectable_maps', {
      tenant_id: outra.tenantId, client_id: cliente, branch_id: idA,
      name: `${PREFIXO} Mapa A ${marca}`, view: 'front', points: [],
    }),
    mapa: await ins('injectable_maps', {
      tenant_id: outra.tenantId, client_id: cliente, branch_id: outra.branchId,
      name: `${PREFIXO} Mapa B ${marca}`, view: 'front', points: [],
    }),
    membroB: await membro(`abrB${marca}`, { tenant: outra.tenantId, branchId: outra.branchId, rotulo: 'Membro B', permissoes: [] }),
  }

  // Compila as telas que usam as actions, para o id delas estar no manifesto
  // quando a recepção A (que não abre /admin) for chamá-las.
  await como(browser, 'rede', async p => {
    for (const tela of [...Object.values(TELA).map(t => t(f!)), `branches/${f!.unidadeA.id}`]) {
      await p.goto(`/admin/${tela}`)
      await p.waitForLoadState('networkidle')
    }
  })
})

test.afterAll(async () => {
  if (!criado.outra) return
  const b = db()
  const falhas: string[] = []
  const olhar = (o: string, r: { error: { message: string } | null }) => { if (r.error) falhas.push(`${o}: ${r.error.message}`) }
  const unidades = [criado.unidadeA, criado.outra.branchId].filter((x): x is string => !!x)
  // O estorno do controle nasce sem cliente: sai pela unidade.
  const { data: txs } = await b.from('financial_transactions').select('id').in('branch_id', unidades)
  const ids = (txs ?? []).map(t => t.id as string)
  if (ids.length) olhar('eventos dos lançamentos', await b.from('domain_events').delete().in('entidade_id', ids))
  olhar('mapas', await b.from('injectable_maps').delete().eq('tenant_id', criado.outra.tenantId))
  for (const m of criado.membros) await m.limpar()
  // Os agendamentos da A são do cliente da B: saem com ele, antes da unidade A.
  const { data: daA } = await b.from('appointments').select('id').in('branch_id', unidades)
  if (daA?.length) olhar('histórico', await b.from('appointment_history').delete().in('appointment_id', daA.map(a => a.id)))
  if (ids.length) olhar('lançamentos', await b.from('financial_transactions').delete().in('id', ids))
  await criado.outra.limpar()   // clientes → agendamentos, lançamentos do cliente, planos
  if (criado.unidadeA) olhar('unidade A', await b.from('branches').delete().eq('id', criado.unidadeA))
  // A rede só sai depois da unidade A — o limpar() dela tentou antes, com a A no caminho.
  olhar('rede', await b.from('tenants').delete().eq('id', criado.outra.tenantId))
  expect(falhas).toEqual([])
})

async function como<T>(browser: Browser, quem: 'recepcaoA' | 'rede', fn: (p: Page) => Promise<T>) {
  const ctx = await browser.newContext({ storageState: f ? f[quem].estado : undefined })
  try { return await fn(await ctx.newPage()) } finally { await ctx.close() }
}

/**
 * A tela onde cada action EXISTE — o Next só aceita a action postada na rota
 * de uma página que a usa ("Server action not found" nas outras). O registro
 * aberto é sempre um da A: a tela abre para os dois, e o alvo da action é que
 * é da B.
 */
const TELA: Record<string, (x: Fx) => string> = {
  updateAppointmentStatus:      () => 'agenda',
  checkinAppointment:           x => `agenda/${x.apptA}`,
  reassignProfessional:         x => `agenda/${x.apptA}`,
  getCheckoutPlan:              x => `agenda/${x.apptA}`,
  getSchedulingDaySlots:        x => `checkout/${x.planoA}`,
  cancelCheckout:               x => `checkout/${x.planoA}`,
  markTransactionPaid:          () => 'financeiro',
  reverseTransaction:           () => 'financeiro',
  listarPlanejamentos:          () => 'planejamentos',
  getPlanejamentoInjetavel:     x => `injetaveis/${x.mapaA}`,
  renomearPlanejamentoInjetavel: x => `injetaveis/${x.mapaA}`,
  deactivateTeamMember:         () => 'team',
}

/** A action, chamada pela pessoa, postando na tela do portal dela. */
async function acao(p: Page, quem: 'recepcaoA' | 'rede', arquivo: string, funcao: string, args: unknown[]) {
  const tela = funcao === 'toggleBranchStatus'
    ? `/admin/branches/${f!.unidadeA.id}`
    : `/${quem === 'rede' ? 'admin' : f!.unidadeA.slug}/${TELA[funcao]!(f!)}`
  const r = await chamarAcao(p, `actions/${arquivo}.ts`, funcao, tela, args)
  // Recusa que não chegou à action não prova nada.
  expect(r.texto, `${funcao} chegou à action (${tela})`).not.toContain('Server action not found')
  return r
}

/** O valor que a action devolveu: a linha `1:` do payload (o resto é o render da página). */
function devolvido(texto: string): unknown {
  // Em dev, o mesmo id tem linhas de depuração (`1:D…`): vale a que é JSON.
  for (const l of texto.split('\n').filter(x => x.startsWith('1:'))) {
    try { return JSON.parse(l.slice(2)) } catch { /* linha de depuração */ }
  }
  return undefined
}

const linha = async (tabela: string, id: string) =>
  (await db().from(tabela).select('*').eq('id', id).single()).data as Record<string, unknown>

test.describe.serial('quem tem unidade fixa age só na dela', () => {
  test('agenda: não confirma, cancela, faz check-in nem troca o profissional da B; nem vê os horários dela', async ({ browser }) => {
    const antes = await linha('appointments', f!.apptB)
    const dia = String(antes.scheduled_at).slice(0, 10)
    await como(browser, 'recepcaoA', async p => {
      await acao(p, 'recepcaoA', 'appointments', 'updateAppointmentStatus', [f!.apptB, 'CANCELLED', f!.slugB, 'invasão'])
      await acao(p, 'recepcaoA', 'appointments', 'updateAppointmentStatus', [f!.apptB, 'COMPLETED', f!.slugB])
      await acao(p, 'recepcaoA', 'appointments', 'checkinAppointment', [f!.apptB, f!.slugB])
      await acao(p, 'recepcaoA', 'appointments', 'reassignProfessional', [f!.apptB, f!.recepcaoA.userId, f!.slugB])
      const horarios = await acao(p, 'recepcaoA', 'appointments', 'getSchedulingDaySlots', [f!.outra.branchId, f!.outra.professionalId, dia])
      expect(devolvido(horarios.texto), 'a agenda da B não aparece').toEqual({ slots: [] })
    })
    const depois = await linha('appointments', f!.apptB)
    expect(depois.status).toBe('SCHEDULED')
    expect(depois.professional_id).toBe(antes.professional_id)
    expect(depois.checked_in_at ?? null).toBe(antes.checked_in_at ?? null)

    // Na própria unidade, segue funcionando.
    await como(browser, 'recepcaoA', async p => {
      await acao(p, 'recepcaoA', 'appointments', 'updateAppointmentStatus', [f!.apptA, 'CONFIRMED', f!.unidadeA.slug])
    })
    expect((await linha('appointments', f!.apptA)).status, 'a A confirma o da A').toBe('CONFIRMED')

    // Controle: a rede faz na B.
    await como(browser, 'rede', async p => {
      const horarios = await acao(p, 'rede', 'appointments', 'getSchedulingDaySlots', [f!.outra.branchId, f!.outra.professionalId, dia])
      expect((devolvido(horarios.texto) as { slots: unknown[] }).slots, 'a rede vê a agenda da B').toHaveLength(1)
      await acao(p, 'rede', 'appointments', 'updateAppointmentStatus', [f!.apptB, 'CONFIRMED', f!.slugB])
    })
    expect((await linha('appointments', f!.apptB)).status, 'a rede confirma o da B').toBe('CONFIRMED')
  })

  test('financeiro: não dá baixa nem estorna lançamento da B', async ({ browser }) => {
    await como(browser, 'recepcaoA', async p => {
      await acao(p, 'recepcaoA', 'financial', 'markTransactionPaid', [f!.txAberto, f!.slugB])
      await acao(p, 'recepcaoA', 'financial', 'reverseTransaction', [f!.txPago, f!.slugB])
    })
    expect((await linha('financial_transactions', f!.txAberto)).is_paid).toBe(false)
    expect((await linha('financial_transactions', f!.txPago)).notes ?? null).not.toBe('Estornada')

    await como(browser, 'rede', async p => {
      await acao(p, 'rede', 'financial', 'markTransactionPaid', [f!.txAberto, f!.slugB])
      await acao(p, 'rede', 'financial', 'reverseTransaction', [f!.txPago, f!.slugB])
    })
    expect((await linha('financial_transactions', f!.txAberto)).is_paid, 'a rede dá baixa').toBe(true)
    expect((await linha('financial_transactions', f!.txPago)).notes, 'a rede estorna').toBe('Estornada')
  })

  test('plano: não abre, não lista e não cancela o plano da B', async ({ browser }) => {
    await como(browser, 'recepcaoA', async p => {
      const aberto = await acao(p, 'recepcaoA', 'treatment-plans', 'getCheckoutPlan', [f!.plano])
      expect(aberto.texto).toContain('Plano não encontrado')
      const lista = await acao(p, 'recepcaoA', 'treatment-plans', 'listarPlanejamentos', [{ branchId: f!.outra.branchId }])
      expect(lista.texto, 'a lista da A não traz o plano da B').not.toContain(f!.nomePlano)
      await acao(p, 'recepcaoA', 'treatment-plans', 'cancelCheckout', [f!.plano, 'invasão', f!.slugB])
    })
    expect((await linha('treatment_plans', f!.plano)).status).toBe('PROPOSED')

    await como(browser, 'rede', async p => {
      const lista = await acao(p, 'rede', 'treatment-plans', 'listarPlanejamentos', [{ branchId: f!.outra.branchId }])
      expect(lista.texto, 'a rede lista o plano da B').toContain(f!.nomePlano)
      await acao(p, 'rede', 'treatment-plans', 'cancelCheckout', [f!.plano, 'controle', f!.slugB])
    })
    expect((await linha('treatment_plans', f!.plano)).status, 'a rede cancela').not.toBe('PROPOSED')
  })

  test('injetáveis: não abre nem renomeia o mapa da B', async ({ browser }) => {
    await como(browser, 'recepcaoA', async p => {
      const aberto = await acao(p, 'recepcaoA', 'injectable-map', 'getPlanejamentoInjetavel', [f!.mapa])
      expect(aberto.texto).toContain('Planejamento não encontrado')
      await acao(p, 'recepcaoA', 'injectable-map', 'renomearPlanejamentoInjetavel', [f!.mapa, 'invasão'])
    })
    expect((await linha('injectable_maps', f!.mapa)).name).toBe(`${PREFIXO} Mapa B ${marca}`)

    await como(browser, 'rede', async p => {
      await acao(p, 'rede', 'injectable-map', 'renomearPlanejamentoInjetavel', [f!.mapa, `${PREFIXO} Mapa renomeado`])
    })
    expect((await linha('injectable_maps', f!.mapa)).name, 'a rede renomeia').toBe(`${PREFIXO} Mapa renomeado`)
  })

  test('equipe e unidade: não desativa gente da B nem a própria B', async ({ browser }) => {
    await como(browser, 'recepcaoA', async p => {
      await acao(p, 'recepcaoA', 'team', 'deactivateTeamMember', [f!.membroB.userId, `/${f!.unidadeA.slug}/team`])
      await acao(p, 'recepcaoA', 'branches', 'toggleBranchStatus', [f!.outra.branchId, false])
      await acao(p, 'recepcaoA', 'branches', 'toggleBranchStatus', [f!.unidadeA.id, false])
    })
    expect((await linha('users', f!.membroB.userId)).is_active).toBe(true)
    expect((await linha('branches', f!.outra.branchId)).is_active, 'a B segue ativa').toBe(true)
    expect((await linha('branches', f!.unidadeA.id)).is_active, 'desativar unidade é da rede, nem a própria').toBe(true)

    await como(browser, 'rede', async p => {
      await acao(p, 'rede', 'team', 'deactivateTeamMember', [f!.membroB.userId, '/admin/team'])
    })
    expect((await linha('users', f!.membroB.userId)).is_active, 'a rede desativa').toBe(false)
  })
})
