import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'
import { diaEmQueAUnidadeAbre } from './apoio/datas'
import { apagarAgendamentos } from './apoio/limpeza'

/**
 * H6 (decisão do Heitor, 5ª simulação, 2026-11-01): "os agendamentos e
 * oportunidades de quem é desativado, no momento da desativação, [dar] a
 * opção de repassar para outra pessoa, caso a caso ou todos de uma vez".
 *
 * Na simulação (A8) a Renata foi desativada com o Seu Valdir agendado com ela
 * (SCHEDULED, profissional inativa) e o Vítor saiu com 12 oportunidades —
 * nada avisou. Agora a janela do "Desativar" diz quantos são e oferece:
 * - todos para uma pessoa (o agendamento só vai para quem ATENDE na unidade e
 *   está livre no horário; o que conflita é avisado e fica para o caso a caso);
 * - um a um; ou deixar sem repasse.
 * A oportunidade vai para quem tem o CRM. O histórico registra o repasse.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let gestora: MembroDeTeste | null = null
let renata: MembroDeTeste | null = null
let renata2: MembroDeTeste | null = null
let tatiane: MembroDeTeste | null = null
let bianca: MembroDeTeste | null = null
let joana: MembroDeTeste | null = null
let etapaAberta = ''
let etapaGanha = ''
let clienteId = ''

const nome = (m: MembroDeTeste) => db().from('users').select('name').eq('id', m.userId).single<{ name: string }>().then(r => r.data!.name)
const ativo = async (m: MembroDeTeste) => (await db().from('users').select('is_active').eq('id', m.userId).single()).data?.is_active
const profDe = async (id: string) => (await db().from('appointments').select('professional_id').eq('id', id).single()).data?.professional_id
const donoDe = async (id: string) => (await db().from('leads').select('owner_id').eq('id', id).single()).data?.owner_id

async function agendar(prof: MembroDeTeste, hora: string, dias = 3): Promise<string> {
  const dia = diaEmQueAUnidadeAbre(dias)
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: clienteId, procedure_id: rede!.procedureId, professional_id: prof.userId,
    scheduled_at: new Date(`${dia}T${hora}:00-03:00`).toISOString(), duration_min: 60, price: 100, status: 'SCHEDULED',
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  return data!.id
}

async function oportunidade(dono: MembroDeTeste, rotulo: string, etapa = etapaAberta): Promise<string> {
  const { data, error } = await db().from('leads').insert({
    tenant_id: rede!.tenantId, name: `${PREFIXO} ${rotulo} ${marca}`, phone: '5548' + String(Date.now()).slice(-9),
    crm_stage_id: etapa, owner_id: dono.userId,
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  // Telefones distintos (o gatilho liga a oportunidade à pessoa pelo número).
  await new Promise(ok => setTimeout(ok, 5))
  return data!.id
}

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: gestora!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

async function abrirDesativar(p: Page, quem: MembroDeTeste) {
  await p.goto('/admin/team')
  const linha = p.locator('tr').filter({ hasText: await nome(quem) })
  await linha.getByRole('button', { name: 'Desativar membro' }).click()
  const janela = p.getByRole('dialog', { name: 'Desativar membro?' })
  await expect(janela.getByText('Conferindo', { exact: false })).toHaveCount(0)
  return janela
}

test.use({ storageState: { cookies: [], origins: [] } })

test.beforeAll(async () => {
  rede = await criarOutraRede(`dr${marca}`)
  clienteId = await rede.criarCliente('Seu Valdir')
  const { data: funil } = await db().from('crm_funnels')
    .insert({ tenant_id: rede.tenantId, name: 'Funil e2e', is_default: true, position: 0 }).select('id').single<{ id: string }>()
  const { data: es, error } = await db().from('crm_stages').insert([
    { tenant_id: rede.tenantId, funnel_id: funil!.id, name: 'Novo', color: '#c34d6b', position: 0, outcome: 'OPEN' },
    { tenant_id: rede.tenantId, funnel_id: funil!.id, name: 'Fechado', color: '#3f9b6f', position: 1, outcome: 'WON' },
  ]).select('id, name')
  expect(error).toBeNull()
  etapaAberta = es!.find(e => e.name === 'Novo')!.id as string
  etapaGanha = es!.find(e => e.name === 'Fechado')!.id as string

  gestora = await criarMembro(`drg${marca}`, {
    tenant: rede.tenantId, rotulo: 'Gestora',
    permissoes: [{ modulo: 'team', nivel: 'MANAGE' }, { modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'crm', nivel: 'MANAGE' }],
  })
  const daUnidade = { tenant: rede.tenantId, branchId: rede.branchId }
  renata  = await criarMembro(`drr${marca}`, { ...daUnidade, rotulo: 'Renata', permissoes: [{ modulo: 'agenda', nivel: 'MANAGE', escopo: 'OWN' }, { modulo: 'crm', nivel: 'MANAGE', escopo: 'OWN' }] })
  renata2 = await criarMembro(`drs${marca}`, { ...daUnidade, rotulo: 'Vitor', permissoes: [{ modulo: 'agenda', nivel: 'MANAGE', escopo: 'OWN' }, { modulo: 'crm', nivel: 'MANAGE', escopo: 'OWN' }] })
  tatiane = await criarMembro(`drt${marca}`, { ...daUnidade, rotulo: 'Tatiane', permissoes: [{ modulo: 'agenda', nivel: 'VIEW' }, { modulo: 'crm', nivel: 'VIEW' }] })
  bianca  = await criarMembro(`drb${marca}`, { ...daUnidade, rotulo: 'Bianca', permissoes: [{ modulo: 'agenda', nivel: 'VIEW' }] })
  joana   = await criarMembro(`drj${marca}`, { ...daUnidade, rotulo: 'Joana', permissoes: [{ modulo: 'agenda', nivel: 'VIEW' }] })
  for (const m of [renata, renata2, tatiane, bianca]) {
    expect((await db().from('users').update({ provides_services: true }).eq('id', m.userId)).error).toBeNull()
  }
})

test.afterAll(async () => {
  if (rede) {
    const { data } = await db().from('leads').select('id').eq('tenant_id', rede.tenantId)
    const ids = (data ?? []).map(l => l.id as string)
    if (ids.length) { await db().from('lead_events').delete().in('lead_id', ids); await db().from('leads').delete().in('id', ids) }
    const { data: ags } = await db().from('appointments').select('id').eq('branch_id', rede.branchId)
    expect(await apagarAgendamentos((ags ?? []).map(a => a.id as string))).toEqual([])
    await db().from('contacts').delete().eq('tenant_id', rede.tenantId)
  }
  for (const m of [renata, renata2, tatiane, bianca, joana, gestora]) {
    if (!m) continue
    await db().from('domain_events').delete().eq('entidade_id', m.userId)
    await m.limpar()
  }
  await rede?.limpar()
})

test.describe.serial('desativar oferece repassar o que fica com a pessoa', () => {
  test('todos de uma vez: o que conflita é avisado e vai no caso a caso; a oportunidade só para quem tem o CRM', async ({ browser }) => {
    const a1 = await agendar(renata!, '10:00')
    const a2 = await agendar(renata!, '14:00')
    await agendar(bianca!, '14:00')                 // a Bianca já está ocupada às 14:00
    const l1 = await oportunidade(renata!, 'Lead um')
    const l2 = await oportunidade(renata!, 'Lead dois')
    const ganha = await oportunidade(renata!, 'Lead ganho', etapaGanha) // fechada: não entra
    const [nT, nB, nJ] = [await nome(tatiane!), await nome(bianca!), await nome(joana!)]

    await como(browser, async p => {
      const janela = await abrirDesativar(p, renata!)
      await expect(janela.getByText('Agendamentos em aberto (2)')).toBeVisible()
      await expect(janela.getByText('Oportunidades abertas (2)')).toBeVisible()
      const linhaA1 = janela.locator(`[data-agendamento="${a1}"]`)
      const linhaA2 = janela.locator(`[data-agendamento="${a2}"]`)
      // Quem não atende não recebe agendamento; quem não tem o CRM, oportunidade.
      await expect(linhaA1.locator('option', { hasText: nJ })).toHaveCount(0)
      await expect(janela.locator(`[data-oportunidade="${l1}"] option`, { hasText: nB })).toHaveCount(0)
      await expect(janela.locator(`[data-oportunidade="${ganha}"]`)).toHaveCount(0)

      await janela.getByLabel('Repassar todos os agendamentos para').selectOption({ label: nB })
      await expect(linhaA1.locator('select')).toHaveValue(bianca!.userId)
      await expect(linhaA2).toContainText(`${nB} já tem atendimento nesse horário`)
      await expect(linhaA2.locator('select')).toHaveValue('')
      await linhaA2.locator('select').selectOption({ label: nT })

      await janela.getByLabel('Repassar todas as oportunidades para').selectOption({ label: nT })
      await janela.getByRole('button', { name: 'Desativar' }).click()
    })

    await expect.poll(() => ativo(renata!)).toBe(false)
    expect(await profDe(a1)).toBe(bianca!.userId)
    expect(await profDe(a2)).toBe(tatiane!.userId)
    expect(await donoDe(l1)).toBe(tatiane!.userId)
    expect(await donoDe(l2)).toBe(tatiane!.userId)
    expect(await donoDe(ganha), 'a fechada fica como está').toBe(renata!.userId)
    // O histórico registra o repasse.
    const { data: hist } = await db().from('appointment_history').select('action, description').eq('appointment_id', a1)
    expect(hist!.some(h => h.action === 'REASSIGNED' && /Repassad/.test(h.description as string))).toBe(true)
    const { data: ev } = await db().from('lead_events').select('type').eq('lead_id', l1)
    expect(ev!.some(e => e.type === 'OWNER_CHANGED')).toBe(true)
  })

  test('caso a caso, deixar sem repasse, a recusa pela action e o "(inativo)" no filtro', async ({ browser }) => {
    const a3 = await agendar(renata2!, '09:00', 4)
    const a4 = await agendar(renata2!, '11:00', 4)
    const l3 = await oportunidade(renata2!, 'Lead tres')
    const nT = await nome(tatiane!)

    await como(browser, async p => {
      // A action recusa quem não atende (a Joana): nada muda, nem a desativação.
      await p.goto('/admin/team')
      const r = await chamarAcao(p, 'actions/team.ts', 'deactivateTeamMember', '/admin/team',
        [renata2!.userId, '/admin/team', { agendamentos: [{ id: a3, para: joana!.userId }], oportunidades: [] }])
      expect(r.texto).toContain('não atende')
      expect(await ativo(renata2!)).toBe(true)
      expect(await profDe(a3)).toBe(renata2!.userId)

      const janela = await abrirDesativar(p, renata2!)
      await janela.locator(`[data-agendamento="${a3}"] select`).selectOption({ label: nT })
      await expect(janela.locator(`[data-agendamento="${a4}"] select`)).toHaveValue('')
      await janela.getByRole('button', { name: 'Desativar' }).click()
    })

    await expect.poll(() => ativo(renata2!)).toBe(false)
    expect(await profDe(a3)).toBe(tatiane!.userId)
    expect(await profDe(a4), 'sem repasse, fica').toBe(renata2!.userId)
    expect(await donoDe(l3), 'sem repasse, fica').toBe(renata2!.userId)

    // O filtro "Responsável" marca quem está inativo.
    const nV = await nome(renata2!)
    await como(browser, async p => {
      await p.goto('/admin/oportunidades')
      await p.getByRole('button', { name: /^Responsável/ }).click()
      await expect(p.locator('[data-painel-picker]')).toContainText(`${nV} (inativo)`)
    })
  })
})
