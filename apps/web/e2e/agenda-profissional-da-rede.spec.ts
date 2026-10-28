import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, clienteComSessao, type MembroDeTeste, type ClienteDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'
import { diaEmQueAUnidadeAbre } from './apoio/datas'

/**
 * D1 da simulação de 2026-10-28 (rede de duas unidades): a profissional DA
 * REDE (`provides_services`, `branch_id` nulo) não aparecia em unidade
 * nenhuma — a agenda do Kobrasol dizia "Nenhum profissional cadastrado nesta
 * filial", e o Centro e o app da cliente só ofereciam a esteticista. A toxina
 * saiu com a comissão errada.
 *
 * Decisão do Heitor: quem atende e é da rede é profissional de TODAS as
 * unidades (a abrangência de rede alcança todas, §11) — na agenda, no agendar
 * (equipe e app da cliente), no horário dos profissionais e no dashboard da
 * unidade. Quem é de uma unidade continua só na dele.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let unidadeB = ''
let slugB = ''
let gestora: MembroDeTeste | null = null
let esteticistaDeA: MembroDeTeste | null = null
let cliente: ClienteDeTeste | null = null
let nomeDaRede = ''
let nomeDeA = ''
const AMANHA = diaEmQueAUnidadeAbre(1)

async function como(browser: Browser, estado: string, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

/** Os nomes de quem o agendar da equipe oferece na unidade (a action da janela de agendar). */
async function quemAtendeNa(p: Page, branchId: string): Promise<string[]> {
  const r = await chamarAcao(p, 'actions/appointments.ts', 'dadosParaAgendar', '/admin/agenda', [branchId])
  expect(r.status, r.texto.slice(0, 200)).toBe(200)
  const lista = /"professionals":([\s\S]*?)"rooms"/.exec(r.texto)?.[1] ?? ''
  expect(lista, `a resposta traz a lista: ${r.texto.slice(0, 400)}`).not.toBe('')
  return [...lista.matchAll(/"name":"([^"]+)"/g)].map(m => m[1]!)
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`pr${marca}`)
  const { data: b, error: eB } = await db().from('branches')
    .insert({ tenant_id: rede.tenantId, name: `${PREFIXO} Unidade B ${marca}`, slug: `e2e-unb-${marca}` })
    .select('id, slug').single<{ id: string; slug: string }>()
  expect(eB, 'criar a segunda unidade').toBeNull()
  unidadeB = b!.id; slugB = b!.slug

  // A profissional da rede: a do apoio, que já nasce sem unidade.
  nomeDaRede = `${PREFIXO} Prof pr${marca}`
  expect((await db().from('users').update({ provides_services: true, branch_id: null }).eq('id', rede.professionalId)).error).toBeNull()
  expect((await db().from('procedures').update({ visible_on_client_app: true, price: 100, duration_min: 30 }).eq('id', rede.procedureId)).error).toBeNull()

  esteticistaDeA = await criarMembro(`pra${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Esteticista de A',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE', escopo: 'OWN' }],
  })
  nomeDeA = `${PREFIXO} Esteticista de A pra${marca}`
  expect((await db().from('users').update({ provides_services: true }).eq('id', esteticistaDeA.userId)).error).toBeNull()

  gestora = await criarMembro(`prg${marca}`, {
    tenant: rede.tenantId, rotulo: 'Gestora',
    permissoes: [
      { modulo: 'agenda', nivel: 'MANAGE', escopo: 'ALL' },
      { modulo: 'team', nivel: 'MANAGE' },
      { modulo: 'clients', nivel: 'VIEW' },
    ],
  })
  cliente = await clienteComSessao(`prc${marca}`, { id: unidadeB, slug: slugB }, { tenant: rede.tenantId })
})

test.afterAll(async () => {
  if (rede) {
    await db().from('appointment_history').delete().in('appointment_id',
      ((await db().from('appointments').select('id').in('branch_id', [rede.branchId, unidadeB])).data ?? []).map(a => a.id))
    await db().from('appointments').delete().in('branch_id', [rede.branchId, unidadeB])
  }
  await cliente?.limpar()
  await esteticistaDeA?.limpar()
  await gestora?.limpar()
  if (unidadeB) await db().from('branches').delete().eq('id', unidadeB)
  await rede?.limpar()
})

test('a profissional da rede está no agendar das duas unidades; a de A, só em A', async ({ browser }) => {
  await como(browser, gestora!.estado, async p => {
    const emA = await quemAtendeNa(p, rede!.branchId)
    const emB = await quemAtendeNa(p, unidadeB)
    expect(emA, 'em A: a da rede e a da unidade').toEqual(expect.arrayContaining([nomeDaRede, nomeDeA]))
    expect(emB, 'em B: a da rede').toContain(nomeDaRede)
    expect(emB, 'em B: a de A não').not.toContain(nomeDeA)
  })
})

test('a agenda e o dashboard da unidade B mostram a profissional da rede', async ({ browser }) => {
  await como(browser, gestora!.estado, async p => {
    await p.goto(`/${slugB}/agenda`)
    await expect(p.getByText('Nenhum profissional cadastrado nesta filial.')).toHaveCount(0)
    await expect(p.getByText(nomeDaRede).first()).toBeVisible()
    await expect(p.getByText(nomeDeA)).toHaveCount(0)

    // A ocupação da unidade conta o horário dela: sem profissional, era "—".
    await p.goto(`/${slugB}/dashboard`)
    const ocupacao = p.locator('.card', { has: p.getByText('Taxa de ocupação') })
    await expect(ocupacao).toContainText(/\d+%/)
  })
})

test('a cliente de B vê e agenda a profissional da rede pelo app; a de A, não', async ({ browser }) => {
  await como(browser, cliente!.estado, async p => {
    await p.goto(`/${slugB}/cliente/agendamentos/novo`)
    await p.getByRole('button', { name: new RegExp(`Proc pr${marca}`) }).click()
    await expect(p.getByRole('button', { name: new RegExp(nomeDaRede.replace(/[[\]]/g, '\\$&')) })).toBeVisible()
    await expect(p.getByText(nomeDeA)).toHaveCount(0)

    const agendar = (professionalId: string, hora: string) => chamarAcao(p, 'actions/appointments.ts', 'createClientAppointment',
      `/${slugB}/cliente/agendamentos/novo`, [{
        branchId: unidadeB, procedureId: rede!.procedureId, professionalId,
        scheduledAt: new Date(`${AMANHA}T${hora}:00-03:00`).toISOString(), slug: slugB,
      }])
    const daRede = await agendar(rede!.professionalId, '10:00')
    expect(daRede.texto, 'a da rede agenda em B').toMatch(/"id":"[0-9a-f-]{36}"/)
    const deA = await agendar(esteticistaDeA!.userId, '11:00')
    expect(deA.texto, 'a de A não agenda em B').toMatch(/Profissional não disponível/)
  })
  const { data } = await db().from('appointments').select('professional_id').eq('client_id', cliente!.clientId)
  expect((data ?? []).map(a => a.professional_id)).toEqual([rede!.professionalId])
})

test('desativar e reativar a profissional da rede tira e põe de volta nas unidades, na hora', async ({ browser }) => {
  await como(browser, gestora!.estado, async p => {
    expect(await quemAtendeNa(p, unidadeB)).toContain(nomeDaRede)
    const fora = await chamarAcao(p, 'actions/team.ts', 'deactivateTeamMember', '/admin/team', [rede!.professionalId, '/admin/team'])
    expect(fora.status, fora.texto.slice(0, 200)).toBe(200)
    expect(await quemAtendeNa(p, unidadeB), 'desativada: some de B').not.toContain(nomeDaRede)
    const volta = await chamarAcao(p, 'actions/team.ts', 'reactivateTeamMember', '/admin/team', [rede!.professionalId, '/admin/team'])
    expect(volta.status, volta.texto.slice(0, 200)).toBe(200)
    expect(await quemAtendeNa(p, unidadeB), 'reativada: volta a B').toContain(nomeDaRede)
  })
})
