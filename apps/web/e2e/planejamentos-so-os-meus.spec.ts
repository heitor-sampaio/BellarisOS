import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'

/**
 * Os planejamentos (planos de tratamento) com a agenda "só os meus".
 *
 * A frente H (2026-10-29) os recortou por `treatment_plans.professional_id`.
 * O Heitor reviu (2026-10-29): "o plano é da cliente, não da profissional".
 * Com a agenda OWN ela vê os planos de TODA cliente que atende — que tem um
 * agendamento com ela, qualquer um, inclusive futuro —, quem quer que tenha
 * montado o plano. É a regra do prontuário OWN (`recusaDoAnexo`,
 * `lib/injetaveis/alcance.ts`): quem cobre uma sessão precisa ver o que foi
 * feito e o que falta. O plano que ELA montou continua dela.
 *
 * Vale na lista Planejamentos, na aba da cliente e pelo id.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let ela: MembroDeTeste | null = null
let todos: MembroDeTeste | null = null
let slug = ''
let atendida = ''
let deOutra = ''
type Chave = 'daAtendida' | 'naoAtendida' | 'delaSemAgendamento'
const planos: Record<Chave, { id: string; nome: string }> = {} as never

async function como(m: MembroDeTeste, browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}
const ARQ = 'actions/treatment-plans.ts'

test.beforeAll(async () => {
  test.setTimeout(180_000)
  rede = await criarOutraRede(`pl${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  ela = await criarMembro(`plp${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Profissional',
    permissoes: [
      { modulo: 'agenda', nivel: 'MANAGE', escopo: 'OWN' },
      { modulo: 'medical_records', nivel: 'MANAGE', escopo: 'OWN' },
    ],
  })
  todos = await criarMembro(`pla${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Agenda de todos',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE', escopo: 'ALL' }],
  })
  atendida = await rede.criarCliente('Atendida por ela')
  deOutra = await rede.criarCliente('Só de outra')
  // A cliente "dela": um agendamento FUTURO com ela (ainda não atendida).
  const amanha = new Date(Date.now() + 86_400_000).toISOString()
  const { error: eAg } = await db().from('appointments').insert({
    branch_id: rede.branchId, client_id: atendida, procedure_id: rede.procedureId, professional_id: ela.userId,
    status: 'SCHEDULED', source: 'INTERNAL', duration_min: 30, price: 100, scheduled_at: amanha,
  })
  expect(eAg, 'agendamento com ela').toBeNull()

  const montar: [Chave, string, string][] = [
    ['daAtendida', atendida, rede.professionalId],      // montado por OUTRA, da cliente dela
    ['naoAtendida', deOutra, rede.professionalId],      // de outra, cliente que ela não atende
    ['delaSemAgendamento', deOutra, ela.userId],        // montado por ELA, sem agendamento com ela
  ]
  for (const [chave, cliente, prof] of montar) {
    const nome = `${PREFIXO} Plano ${chave} ${marca}`
    const { data, error } = await db().from('treatment_plans').insert({
      branch_id: rede.branchId, client_id: cliente, professional_id: prof, status: 'DRAFT', name: nome,
    }).select('id').single<{ id: string }>()
    expect(error, `plano ${chave}`).toBeNull()
    planos[chave] = { id: data!.id, nome }
  }
  // Uma sessão no plano da cliente dela, para `getTreatmentPlanSessions` ter o que devolver.
  const { data: sessao, error: eS } = await db().from('treatment_plan_sessions')
    .insert({ plan_id: planos.daAtendida.id, sort_order: 0 }).select('id').single<{ id: string }>()
  expect(eS, 'sessão do plano').toBeNull()
  const { error: eP } = await db().from('treatment_plan_session_procedures')
    .insert({ session_id: sessao!.id, procedure_id: rede.procedureId, price: 100, sort_order: 0 })
  expect(eP, 'procedimento da sessão').toBeNull()
})

test.afterAll(async () => {
  test.setTimeout(120_000)
  const falhas: string[] = []
  const ids = Object.values(planos).map(p => p.id)
  if (ids.length) {
    const sessoes = ((await db().from('treatment_plan_sessions').select('id').in('plan_id', ids)).data ?? []).map(s => s.id as string)
    if (sessoes.length) {
      const rp = await db().from('treatment_plan_session_procedures').delete().in('session_id', sessoes)
      if (rp.error) falhas.push(`procedimentos das sessões: ${rp.error.message}`)
      const rs = await db().from('treatment_plan_sessions').delete().in('id', sessoes)
      if (rs.error) falhas.push(`sessões: ${rs.error.message}`)
    }
    const r = await db().from('treatment_plans').delete().in('id', ids)
    if (r.error) falhas.push(`planos: ${r.error.message}`)
  }
  if (rede) {
    const r = await db().from('appointments').delete().eq('branch_id', rede.branchId)
    if (r.error) falhas.push(`agendamentos: ${r.error.message}`)
  }
  await ela?.limpar()
  await todos?.limpar()
  await rede?.limpar()
  expect(falhas).toEqual([])
})

test('a lista de Planejamentos, com a agenda "só os meus", mostra os planos das clientes que ela atende', async ({ browser }) => {
  await como(ela!, browser, async p => {
    await p.goto(`/${slug}/planejamentos`)
    await expect(p.getByText(planos.daAtendida.nome), 'o plano da cliente dela, montado por outra').toBeVisible()
    await expect(p.getByText(planos.delaSemAgendamento.nome), 'o plano que ela montou').toBeVisible()
    await expect(p.getByText(planos.naoAtendida.nome), 'cliente que ela não atende').toHaveCount(0)
  })
  await como(todos!, browser, async p => {
    await p.goto(`/${slug}/planejamentos`)
    for (const k of ['daAtendida', 'naoAtendida', 'delaSemAgendamento'] as const) {
      await expect(p.getByText(planos[k].nome)).toBeVisible()
    }
  })
})

test('a aba da cliente: os planos dela abrem, de quem quer que seja', async ({ browser }) => {
  const tela = `/${slug}/clients/${atendida}`
  await como(ela!, browser, async p => {
    await p.goto(tela)
    const r = await chamarAcao(p, ARQ, 'getPlanosDoCliente', tela, [atendida])
    expect(r.texto, 'chegou à action').not.toContain('Server action not found')
    expect(r.texto, 'o plano montado por outra').toContain(planos.daAtendida.id)
    const s = await chamarAcao(p, ARQ, 'getTreatmentPlanSessions', tela, [planos.daAtendida.id])
    expect(s.texto, 'as sessões abrem').toContain('"price":100')
    // A cliente que ela não atende: só o plano que ela mesma montou.
    const outra = await chamarAcao(p, ARQ, 'getPlanosDoCliente', tela, [deOutra])
    expect(outra.texto).toContain(planos.delaSemAgendamento.id)
    expect(outra.texto, 'o de outra, de cliente que não é dela').not.toContain(planos.naoAtendida.id)
  })
})

test('pelo id: o plano da cliente dela abre; o de cliente que ela não atende, não', async ({ browser }) => {
  const tela = `/${slug}/planejamentos/${planos.daAtendida.id}`
  await como(ela!, browser, async p => {
    await p.goto(tela)
    const meu = await chamarAcao(p, ARQ, 'getCabecalhoDoPlano', tela, [planos.daAtendida.id])
    expect(meu.texto, 'chegou à action').not.toContain('Server action not found')
    expect(meu.texto, 'o plano da cliente dela abre').toContain(planos.daAtendida.nome)
    for (const funcao of ['getCabecalhoDoPlano', 'getPlanoParaEditar']) {
      const r = await chamarAcao(p, ARQ, funcao, tela, [planos.naoAtendida.id])
      expect(r.texto, funcao).toContain('Plano não encontrado')
    }
    await chamarAcao(p, ARQ, 'renomearPlano', tela, [planos.naoAtendida.id, 'invasão'])
  })
  const { data } = await db().from('treatment_plans').select('name').eq('id', planos.naoAtendida.id).single<{ name: string }>()
  expect(data!.name, 'o de cliente que não é dela não foi renomeado').toBe(planos.naoAtendida.nome)

  // A página do plano de cliente que ela não atende, pela URL, não mostra o plano.
  await como(ela!, browser, async p => {
    await p.goto(`/${slug}/planejamentos/${planos.naoAtendida.id}`)
    await expect(p.getByText(planos.naoAtendida.nome)).toHaveCount(0)
  })
  // Controle: com a agenda de todos, abre.
  await como(todos!, browser, async p => {
    await p.goto(tela)
    const r = await chamarAcao(p, ARQ, 'getCabecalhoDoPlano', tela, [planos.naoAtendida.id])
    expect(r.texto).toContain(planos.naoAtendida.nome)
  })
})
