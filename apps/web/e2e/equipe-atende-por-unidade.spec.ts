import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao, chamarAcaoComFormulario } from './apoio/acao-direta'
import { haMinutosHoje } from './apoio/datas'

/**
 * Decisão 2 do Heitor sobre a 8ª simulação (2026-11-06): "Inves de atende
 * também em, o atende vira um checklist com todas as unidades, as que
 * estiverem marcadas ficam disponiveis". A Talita (da Água Verde) cobria o
 * Batel, e a dona teve de dar a ela a REDE inteira (A12): o acesso cresceu
 * junto. A desativação da Débora não oferecia a Talita para o repasse.
 *
 * Agora o "atende" é por unidade (`users.atende_em`): marcada numa unidade,
 * ela aparece ali como profissional (agenda, agendar, repasse, comissão). A
 * ABRANGÊNCIA não muda: no Batel ela alcança só os agendamentos DELA.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let batel = ''
let slugA = ''
let slugBatel = ''
let nomeA = ''
let nomeBatel = ''
let dona: MembroDeTeste | null = null
let talita: MembroDeTeste | null = null
let gerenteDoBatel: MembroDeTeste | null = null
let recepcaoDoBatel: MembroDeTeste | null = null
const nomeDaTalita = `${PREFIXO} Talita atu${marca}`

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

const atendeEm = async (id: string) =>
  ((await db().from('users').select('atende_em, provides_services, branch_id').eq('id', id)
    .single<{ atende_em: string[]; provides_services: boolean; branch_id: string | null }>()).data)

async function agendadoNoBatel(rotulo: string, professionalId: string, status = 'CONFIRMED') {
  const cliente = await rede!.criarCliente(rotulo)
  const { data, error } = await db().from('appointments').insert({
    branch_id: batel, client_id: cliente, procedure_id: rede!.procedureId, professional_id: professionalId,
    status, source: 'INTERNAL', duration_min: 30, price: 0, scheduled_at: haMinutosHoje(20),
  }).select('id').single<{ id: string }>()
  expect(error, 'agendar no Batel').toBeNull()
  return data!.id
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`atu${marca}`)
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  const a = (await db().from('branches').select('slug, name').eq('id', rede.branchId).single<{ slug: string; name: string }>()).data!
  slugA = a.slug; nomeA = a.name
  nomeBatel = `${PREFIXO} Batel ${marca}`
  const { data: b, error: eB } = await db().from('branches')
    .insert({ tenant_id: rede.tenantId, name: nomeBatel, slug: `e2e-batel-${marca}` })
    .select('id, slug').single<{ id: string; slug: string }>()
  expect(eB, 'criar o Batel').toBeNull()
  batel = b!.id; slugBatel = b!.slug

  dona = await criarMembro(`atd${marca}`, { tenant: rede.tenantId, donoDaRede: true, rotulo: 'Dona', permissoes: [] })
  talita = await criarMembro(`atu${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Talita',
    permissoes: [
      { modulo: 'agenda', nivel: 'MANAGE', escopo: 'OWN' },
      { modulo: 'medical_records', nivel: 'MANAGE', escopo: 'OWN' },
    ],
  })
  // Ela atende — e, de uma unidade, fica marcada só na dela (a migração do dado).
  expect((await db().from('users').update({ provides_services: true }).eq('id', talita.userId)).error).toBeNull()
  gerenteDoBatel = await criarMembro(`atg${marca}`, {
    tenant: rede.tenantId, branchId: batel, rotulo: 'Gerente do Batel',
    permissoes: [{ modulo: 'team', nivel: 'MANAGE' }, { modulo: 'agenda', nivel: 'MANAGE', escopo: 'ALL' }],
  })
  recepcaoDoBatel = await criarMembro(`atr${marca}`, {
    tenant: rede.tenantId, branchId: batel, rotulo: 'Recepcao do Batel',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE', escopo: 'ALL' }],
  })
})

test.afterAll(async () => {
  if (rede) {
    const { data: ags } = await db().from('appointments').select('id').eq('branch_id', batel)
    const ids = (ags ?? []).map(x => x.id as string)
    if (ids.length) {
      await db().from('appointment_history').delete().in('appointment_id', ids)
      await db().from('appointments').delete().in('id', ids)
    }
  }
  for (const m of [dona, talita, gerenteDoBatel, recepcaoDoBatel]) {
    if (m) await db().from('domain_events').delete().eq('entidade_id', m.userId)
  }
  await recepcaoDoBatel?.limpar(); await gerenteDoBatel?.limpar(); await talita?.limpar(); await dona?.limpar()
  await rede?.limpar()
})

test('quem já atendia fica marcado no que alcança: a de uma unidade, na dela; a da rede, em todas', async () => {
  const t = await atendeEm(talita!.userId)
  expect(t?.atende_em, 'a Talita (Água Verde) fica marcada só na Água Verde').toEqual([rede!.branchId])
  expect(t?.provides_services).toBe(true)
  // A profissional da rede, marcada depois das duas unidades existirem: as duas.
  expect((await db().from('users').update({ provides_services: true, branch_id: null }).eq('id', rede!.professionalId)).error).toBeNull()
  expect([...((await atendeEm(rede!.professionalId))?.atende_em ?? [])].sort()).toEqual([rede!.branchId, batel].sort())
})

test('o "Atende" é um checklist das unidades: a dona marca a Talita no Batel, ela entra no agendar dele e a abrangência fica a da Água Verde', async ({ browser }) => {
  await como(browser, dona!.estado, async p => {
    expect(await quemAtendeNa(p, batel), 'antes: a Talita não atende no Batel').not.toContain(nomeDaTalita)
    await p.goto('/admin/team')
    await p.getByTitle(`Editar ${nomeDaTalita}`).click()
    const modal = p.getByRole('dialog')
    const lista = modal.getByRole('group', { name: 'Atende clientes em' })
    await expect(lista.getByRole('checkbox', { name: nomeA })).toBeChecked()
    await expect(lista.getByRole('checkbox', { name: nomeBatel })).not.toBeChecked()
    await lista.getByRole('checkbox', { name: nomeBatel }).check()
    await modal.getByRole('button', { name: 'Salvar' }).click()
    await expect(modal).toHaveCount(0)
  })
  await expect.poll(async () => [...((await atendeEm(talita!.userId))?.atende_em ?? [])].sort(), { message: 'gravou as duas' })
    .toEqual([rede!.branchId, batel].sort())
  expect((await atendeEm(talita!.userId))?.branch_id, 'a abrangência continua a Água Verde').toBe(rede!.branchId)
  await como(browser, dona!.estado, async p => {
    expect(await quemAtendeNa(p, batel), 'agora atende no Batel').toContain(nomeDaTalita)
    expect(await quemAtendeNa(p, rede!.branchId), 'e continua na Água Verde').toContain(nomeDaTalita)
    // A lista mostra onde ela atende.
    await p.goto('/admin/team')
    const esc = (t: string) => t.replace(/[[\]]/g, '\\$&')
    await expect(p.getByRole('row', { name: new RegExp(esc(nomeDaTalita)) }).locator('[data-atende-em]'))
      .toHaveText(new RegExp(`^Atende em (${esc(nomeA)} e ${esc(nomeBatel)}|${esc(nomeBatel)} e ${esc(nomeA)})$`))
  })
  // A Equipe do Batel lista a Talita (de fora, atende aqui), sem deixar o Batel editá-la.
  await como(browser, gerenteDoBatel!.estado, async p => {
    await p.goto(`/${slugBatel}/team`)
    const linha = p.getByRole('row', { name: new RegExp(nomeDaTalita.replace(/[[\]]/g, '\\$&')) })
    await expect(linha).toContainText(`Da unidade ${nomeA}`)
    await expect(linha.getByTitle(/^Editar /)).toHaveCount(0)
  })
})

test('a Talita vê e inicia o atendimento DELA no Batel pela Água Verde, e não alcança o resto do Batel', async ({ browser }) => {
  expect((await db().from('users').update({ atende_em: [rede!.branchId, batel] }).eq('id', talita!.userId)).error).toBeNull()
  const dela   = await agendadoNoBatel(`Patricia atu${marca}`, talita!.userId)
  const daOutra = await agendadoNoBatel(`Bianca atu${marca}`, rede!.professionalId)
  await como(browser, talita!.estado, async p => {
    // A "Minha agenda" (Água Verde) traz o dela no Batel, com a unidade.
    await p.goto(`/${slugA}/agenda`)
    const cartao = p.locator('[data-outra-unidade]').filter({ hasText: `Patricia atu${marca}` })
    await expect(cartao).toBeVisible()
    await expect(cartao).toContainText(nomeBatel)
    // A tela do atendimento abre pelo portal dela.
    await p.goto(`/${slugA}/agenda/${dela}`)
    await expect(p.getByText(`Patricia atu${marca}`).first()).toBeVisible()
    await expect(p.getByRole('heading', { name: 'Página não encontrada' })).toHaveCount(0)
    // O de outra profissional no Batel não abre.
    await p.goto(`/${slugA}/agenda/${daOutra}`)
    await expect(p.getByText(`Bianca atu${marca}`)).toHaveCount(0)
    // E a agenda do Batel continua fora do alcance dela.
    await p.goto(`/${slugBatel}/agenda`)
    await expect(p).not.toHaveURL(new RegExp(`/${slugBatel}/agenda`))
    // Inicia o dela pelo id; o de outra é recusado.
    const ok = await chamarAcao(p, 'actions/appointments.ts', 'startAppointment', `/${slugA}/agenda/${dela}`, [dela, slugA, { inicioAdiantadoConfirmado: true }])
    expect(ok.texto, 'inicia o dela').not.toMatch(/não encontrado/)
    const nao = await chamarAcao(p, 'actions/appointments.ts', 'startAppointment', `/${slugA}/agenda/${dela}`, [daOutra, slugA, { inicioAdiantadoConfirmado: true }])
    expect(nao.texto, 'recusa o de outra').toMatch(/não encontrado|responsável/)
  })
  await expect.poll(async () => (await db().from('appointments').select('status').eq('id', dela).single<{ status: string }>()).data?.status).toBe('IN_PROGRESS')
  expect((await db().from('appointments').select('status').eq('id', daOutra).single<{ status: string }>()).data?.status).toBe('CONFIRMED')
})

test('a gerente de unidade fixa marca e desmarca só a unidade dela', async ({ browser }) => {
  // Uma profissional do Batel que a dona também marcou na Água Verde.
  const nome = `${PREFIXO} Bia atb${marca}`
  const bia = await criarMembro(`atb${marca}`, { tenant: rede!.tenantId, branchId: batel, rotulo: 'Bia', permissoes: [{ modulo: 'agenda', nivel: 'VIEW', escopo: 'OWN' }] })
  try {
    expect((await db().from('users').update({ atende_em: [rede!.branchId, batel] }).eq('id', bia.userId)).error).toBeNull()
    expect((await atendeEm(bia.userId))?.provides_services, 'atender em alguma = provides_services').toBe(true)
    await como(browser, gerenteDoBatel!.estado, async p => {
      // Desmarca o Batel e tenta marcar só a Água Verde: a Água Verde não é dela.
      const r = await chamarAcaoComFormulario(p, 'actions/team.ts', 'updateTeamMember', `/${slugBatel}/team`, [undefined], {
        userId: bia.userId, roleId: bia.roleId, scope: 'branch', branchId: batel, redirectPath: `/${slugBatel}/team`,
        _atendeEm: '1', atendeEm: '',
      })
      expect(r.status, r.texto.slice(0, 300)).toBe(200)
    })
    expect((await atendeEm(bia.userId))?.atende_em, 'só o Batel saiu; a Água Verde fica').toEqual([rede!.branchId])
    await como(browser, gerenteDoBatel!.estado, async p => {
      await p.goto(`/${slugBatel}/team`)
      await p.getByTitle(`Editar ${nome}`).click()
      const lista = p.getByRole('dialog').getByRole('group', { name: 'Atende clientes em' })
      await expect(lista.getByRole('checkbox', { name: nomeA }), 'a outra unidade aparece, travada').toBeDisabled()
      await expect(lista.getByRole('checkbox', { name: nomeA })).toBeChecked()
      await lista.getByRole('checkbox', { name: nomeBatel }).check()
      await p.getByRole('dialog').getByRole('button', { name: 'Salvar' }).click()
      await expect(p.getByRole('dialog')).toHaveCount(0)
    })
    await expect.poll(async () => [...((await atendeEm(bia.userId))?.atende_em ?? [])].sort()).toEqual([rede!.branchId, batel].sort())
  } finally {
    await bia.limpar()
  }
})

test('a unidade nova nasce sem ninguém marcado, e a Equipe dela diz', async ({ browser }) => {
  const { data: c, error } = await db().from('branches')
    .insert({ tenant_id: rede!.tenantId, name: `${PREFIXO} Centro ${marca}`, slug: `e2e-centro-${marca}` })
    .select('id, slug').single<{ id: string; slug: string }>()
  expect(error).toBeNull()
  await como(browser, dona!.estado, async p => {
    expect(await quemAtendeNa(p, c!.id), 'ninguém atende na unidade nova').toEqual([])
    await p.goto(`/${c!.slug}/team`)
    await expect(p.locator('[data-ninguem-atende]')).toContainText('Ninguém atende nesta unidade ainda')
  })
})
