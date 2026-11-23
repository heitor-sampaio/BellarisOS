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
 * ela aparece ali como profissional (agenda, agendar, repasse, comissão).
 *
 * E só nas unidades DELA (o Heitor, 2026-11-23: "não faz o menor sentido a
 * ana ter marcado atende na sul e se a sul nao esta entre as unidades dela.
 * uma pessoa só pode atender nas unidades que faz parte, isso é obvio"): saiu
 * o caminho de quem atendia fora da abrangência e chegava aos agendamentos
 * DELA de lá (AG-30). Para a Talita cobrir o Batel, o Batel entra nas
 * unidades dela.
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
    // Sem o "só os meus" (SM2/UM2, o Heitor, 2026-11-23): a Minha agenda e as Minhas comissões
    // são as vistas pessoais de quem atende sem a Agenda e sem o Financeiro; iniciar é do Atendimento.
    permissoes: [
      { modulo: 'atendimento', nivel: 'MANAGE' },
      { modulo: 'medical_records', nivel: 'MANAGE' },
    ],
  })
  // Ela atende — e, de uma unidade, fica marcada só na dela (a migração do dado).
  expect((await db().from('users').update({ provides_services: true }).eq('id', talita.userId)).error).toBeNull()
  gerenteDoBatel = await criarMembro(`atg${marca}`, {
    tenant: rede.tenantId, branchId: batel, rotulo: 'Gerente do Batel',
    permissoes: [{ modulo: 'team', nivel: 'MANAGE' }, { modulo: 'agenda', nivel: 'MANAGE' }],
  })
  recepcaoDoBatel = await criarMembro(`atr${marca}`, {
    tenant: rede.tenantId, branchId: batel, rotulo: 'Recepcao do Batel',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE' }],
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

// Revisto em 23/11 (o Heitor: "uma pessoa só pode atender nas unidades que
// faz parte"): era "a dona marca a Talita no Batel e a abrangência fica a da
// Água Verde". Agora o Batel entra nas unidades dela, e aí o "Atende" o oferece.
test('o "Atende" é um checklist das unidades DELA: com o Batel entre as unidades da Talita, a dona a marca lá e ela entra no agendar dele', async ({ browser }) => {
  await como(browser, dona!.estado, async p => {
    expect(await quemAtendeNa(p, batel), 'antes: a Talita não atende no Batel').not.toContain(nomeDaTalita)
  })
  // O Batel entra nas unidades dela; o "Atende" fica só na Água Verde (o
  // gatilho leva junto a lista que seguia as unidades: a segunda gravação a
  // deixa escolhida à mão).
  expect((await db().from('users').update({ outras_unidades: [batel] }).eq('id', talita!.userId)).error).toBeNull()
  expect((await db().from('users').update({ atende_em: [rede!.branchId] }).eq('id', talita!.userId)).error).toBeNull()
  try {
    await como(browser, dona!.estado, async p => {
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
    await expect.poll(async () => [...((await atendeEm(talita!.userId))?.atende_em ?? [])].sort(), { message: 'a dona marcou o Batel' })
      .toEqual([rede!.branchId, batel].sort())
    await como(browser, dona!.estado, async p => {
      expect(await quemAtendeNa(p, batel), 'agora atende no Batel').toContain(nomeDaTalita)
      expect(await quemAtendeNa(p, rede!.branchId), 'e continua na Água Verde').toContain(nomeDaTalita)
      // A lista mostra onde ela atende.
      await p.goto('/admin/team')
      const esc = (t: string) => t.replace(/[[\]]/g, '\\$&')
      await expect(p.getByRole('row', { name: new RegExp(esc(nomeDaTalita)) }).locator('[data-atende-em]'))
        .toHaveText(new RegExp(`^Atende em (${esc(nomeA)} e ${esc(nomeBatel)}|${esc(nomeBatel)} e ${esc(nomeA)})$`))
    })
  } finally {
    // Os casos seguintes contam com a Talita só da Água Verde.
    expect((await db().from('users').update({ outras_unidades: [] }).eq('id', talita!.userId)).error).toBeNull()
    expect((await db().from('users').update({ atende_em: [rede!.branchId] }).eq('id', talita!.userId)).error).toBeNull()
  }
})

// Revisto em 23/11 (o Heitor: "uma pessoa só pode atender nas unidades que
// faz parte"): era "a Talita vê e inicia o atendimento DELA no Batel pela
// Água Verde" (AG-30, saiu). Agora a Equipe não oferece nem grava o Batel no
// "Atende" de quem não tem o Batel, e o agendamento dela de lá fica fora.
test('a Talita, só da Água Verde, não atende no Batel: a Equipe não oferece nem grava, e o agendamento dela de lá fica fora do alcance', async ({ browser }) => {
  expect((await atendeEm(talita!.userId))?.atende_em).toEqual([rede!.branchId])
  await como(browser, dona!.estado, async p => {
    // A tela: com uma unidade só, o "Atende" é a caixa — sem a lista, sem o Batel.
    await p.goto('/admin/team')
    await p.getByTitle(`Editar ${nomeDaTalita}`).click()
    const modal = p.getByRole('dialog')
    await expect(modal.getByRole('group', { name: 'Atende clientes em' })).toHaveCount(0)
    await expect(modal.locator('[data-escolher-onde-atende]')).toHaveCount(0)
    await p.keyboard.press('Escape')
    // O servidor: o Batel no "Atende" pelo pedido direto é recusado.
    const r = await chamarAcaoComFormulario(p, 'actions/team.ts', 'updateTeamMember', '/admin/team', [undefined], {
      userId: talita!.userId, roleId: talita!.roleId, redirectPath: '/admin/team',
      _atendeEm: '1', atendeEm: `${rede!.branchId},${batel}`, providesServices: 'on',
    })
    expect(r.texto, r.texto.slice(0, 300)).toMatch(/só vale nas unidades da pessoa/)
    // E o "Marcar no Atende" da janela do Desativar, pelo mesmo núcleo.
    const m = await chamarAcao(p, 'actions/team.ts', 'marcarUnidadeNoAtende', '/admin/team', [talita!.userId, batel, '/admin/team'])
    expect(m.texto, m.texto.slice(0, 300)).toMatch(/só vale nas unidades da pessoa/)
  })
  expect((await atendeEm(talita!.userId))?.atende_em, 'o Batel não entrou').toEqual([rede!.branchId])

  // Um agendamento dela no Batel (dado de antes da regra): fora do alcance.
  const dela = await agendadoNoBatel(`Patricia atu${marca}`, talita!.userId)
  await como(browser, talita!.estado, async p => {
    await p.goto(`/${slugA}/agenda/${dela}`)
    await expect(p.getByText(`Patricia atu${marca}`)).toHaveCount(0)
    const nao = await chamarAcao(p, 'actions/appointments.ts', 'startAppointment', `/${slugA}/agenda/${dela}`, [dela, slugA, { inicioAdiantadoConfirmado: true }])
    expect(nao.texto, 'recusa o do Batel').toMatch(/não encontrado/)
  })
  expect((await db().from('appointments').select('status').eq('id', dela).single<{ status: string }>()).data?.status).toBe('CONFIRMED')
})

test('quem tem só uma unidade, com a Equipe em Gerenciar, marca e desmarca só a unidade dela', async ({ browser }) => {
  // Uma profissional do Batel e da Água Verde, marcada nas duas. Revisto em
  // 23/11 (o Heitor: "uma pessoa só pode atender nas unidades que faz parte"):
  // era só do Batel, marcada também na Água Verde.
  const nome = `${PREFIXO} Bia atb${marca}`
  const bia = await criarMembro(`atb${marca}`, {
    tenant: rede!.tenantId, branchId: batel, outrasUnidades: [rede!.branchId], rotulo: 'Bia', permissoes: [{ modulo: 'agenda', nivel: 'VIEW' }],
  })
  try {
    expect((await db().from('users').update({ atende_em: [rede!.branchId, batel] }).eq('id', bia.userId)).error).toBeNull()
    expect((await atendeEm(bia.userId))?.provides_services, 'atender em alguma = provides_services').toBe(true)
    await como(browser, gerenteDoBatel!.estado, async p => {
      // Desmarca tudo: a Água Verde não está ao alcance da gerente do Batel, e fica.
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

// Revista em 18/11 (EQ1, o Heitor: "Concord." a "A rede inteira (todas,
// inclusive as que vierem)"; gatilho `trg_atende_na_unidade_nova`): quem tem
// "A rede inteira" e atende em TODAS as unidades atende também na nova; quem é
// de unidade, ou escolheu à mão em quais atende, fica como estava. Era "a
// unidade nova nasce sem ninguém marcado".
test('a unidade nova: quem é da rede e atende em todas entra nela; sem ninguém, a Equipe dela diz', async ({ browser }) => {
  const nomeDaProf = `${PREFIXO} Prof atu${marca}`
  const unidadeNova = async (nome: string, slug: string) => {
    const { data, error } = await db().from('branches')
      .insert({ tenant_id: rede!.tenantId, name: `${PREFIXO} ${nome} ${marca}`, slug: `${slug}-${marca}` })
      .select('id, slug').single<{ id: string; slug: string }>()
    expect(error).toBeNull()
    return data!
  }
  // A profissional da rede atende nas duas (o primeiro caso): entra na nova; a
  // Talita, da Água Verde, não.
  const centro = await unidadeNova('Centro', 'e2e-centro')
  await como(browser, dona!.estado, async p => {
    expect(await quemAtendeNa(p, centro.id), 'quem é da rede e atende em todas entra na nova; a Talita, não').toEqual([nomeDaProf])
  })

  // Escolhida à mão (só a Água Verde), a profissional da rede fica de fora da
  // próxima: a unidade nasce sem ninguém, e a tela diz.
  expect((await db().from('users').update({ atende_em: [rede!.branchId] }).eq('id', rede!.professionalId)).error).toBeNull()
  const portao = await unidadeNova('Portão', 'e2e-portao')
  try {
    await como(browser, dona!.estado, async p => {
      expect(await quemAtendeNa(p, portao.id), 'ninguém atende na unidade nova').toEqual([])
      await p.goto(`/${portao.slug}/team`)
      await expect(p.locator('[data-ninguem-atende]')).toContainText('Ninguém atende nesta unidade ainda')
      // E o cartão da unidade, em Configurações → Unidades, também diz.
      await p.goto('/admin/settings?tab=unidades')
      await expect(p.locator('.card').filter({ hasText: `${PREFIXO} Portão ${marca}` }).locator('[data-quem-atende-na-unidade]'))
        .toContainText('Ninguém atende nesta unidade ainda')
    })
  } finally {
    // Os casos seguintes contam com ela atendendo onde atendia.
    expect((await db().from('users').update({ atende_em: [rede!.branchId, batel, centro.id] }).eq('id', rede!.professionalId)).error).toBeNull()
  }
})

// Revisto em 23/11 (o Heitor: "uma pessoa só pode atender nas unidades que faz
// parte"): o Batel entra nas unidades da Talita para ela atender lá — pela
// Equipe, que expira o contexto dela (era só o "Atende", gravado no banco).
test('a comissão: "Minhas comissões" da Talita, pela Água Verde, cobre também o Batel em que ela atende', async ({ browser }) => {
  await como(browser, dona!.estado, async p => {
    const r = await chamarAcaoComFormulario(p, 'actions/team.ts', 'updateTeamMember', '/admin/team', [undefined], {
      userId: talita!.userId, roleId: talita!.roleId, redirectPath: '/admin/team',
      _unidades: '1', unidades: `${rede!.branchId},${batel}`,
      _atendeEm: '1', atendeEm: `${rede!.branchId},${batel}`, providesServices: 'on',
    })
    expect(r.texto, r.texto.slice(0, 300)).not.toMatch(/só vale nas unidades da pessoa/)
  })
  await expect.poll(async () => [...((await atendeEm(talita!.userId))?.atende_em ?? [])].sort()).toEqual([rede!.branchId, batel].sort())
  await como(browser, talita!.estado, async p => {
    await p.goto(`/${slugA}/financeiro/comissoes`)
    await expect(p.getByRole('heading', { name: 'Minhas comissões' })).toBeVisible()
    await expect(p.locator('option', { hasText: nomeBatel }), 'o Batel entra no recorte dela').toHaveCount(1)
  })
})
