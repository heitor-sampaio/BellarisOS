import { test, expect, type Browser, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste, type Permissao } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao, chamarAcaoComFormulario } from './apoio/acao-direta'

/**
 * Bloco Equipe (EQ1a, EQ1b, EQ1c) e o PO1 do bloco Portais (plano de
 * adaptação; o Heitor, 2026-11-13: "permitir linkar a pessoa em mais de uma
 * unidade").
 *
 * A pessoa com as unidades A e B, numa rede com A, B e C:
 * - abre o portal de A e o de B, e o seletor do topo troca entre as duas, na
 *   MESMA tela (PO1);
 * - não abre C pela URL (volta à dela, com o aviso), nem o portal da rede;
 * - age em registro de B, não em registro de C (a action, não só a tela);
 * - não é "da rede": não grava a configuração da rede toda (H7, EQ1b);
 * - a sessão (RLS) lê A e B, não C;
 * - o login volta à ÚLTIMA unidade usada;
 * - na Equipe, dá só as unidades dela (nunca "A rede inteira", nunca C).
 * E o cadastro (EQ1c): "Unidades" com as marcadas e o "Atende" de UMA caixa,
 * que fechada vale nas unidades da pessoa.
 *
 * A prova é sempre o banco.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let pessoa: MembroDeTeste | null = null
let dona: MembroDeTeste | null = null
const un = { A: { id: '', slug: '', nome: '' }, B: { id: '', slug: '', nome: '' }, C: { id: '', slug: '', nome: '' } }
const criados: string[] = []

test.describe.configure({ timeout: 180_000 })
test.use({ storageState: { cookies: [], origins: [] } })

const PERMISSOES: Permissao[] = (['agenda', 'clients', 'settings', 'team', 'stock', 'crm'] as const)
  .map(modulo => ({ modulo, nivel: 'MANAGE' as const }))

async function como<T>(browser: Browser, quem: MembroDeTeste, fn: (p: Page) => Promise<T>): Promise<T> {
  const ctx = await browser.newContext({ storageState: quem.estado })
  try { return await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  test.setTimeout(240_000)
  rede = await criarOutraRede(`eqvu${marca}`)
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  const a = (await db().from('branches').select('id, slug, name').eq('id', rede.branchId).single<{ id: string; slug: string; name: string }>()).data!
  un.A = { id: a.id, slug: a.slug, nome: a.name }
  for (const letra of ['B', 'C'] as const) {
    const { data, error } = await db().from('branches')
      .insert({ tenant_id: rede.tenantId, name: `${PREFIXO} Unidade ${letra} ${marca}`, slug: `e2e-eqvu${letra.toLowerCase()}-${marca}` })
      .select('id, slug, name').single<{ id: string; slug: string; name: string }>()
    expect(error, `criar a unidade ${letra}`).toBeNull()
    un[letra] = { id: data!.id, slug: data!.slug, nome: data!.name }
  }
  pessoa = await criarMembro(`eqvup${marca}`, {
    tenant: rede.tenantId, branchId: un.A.id, outrasUnidades: [un.B.id], rotulo: 'Duas unidades', permissoes: PERMISSOES,
  })
  dona = await criarMembro(`eqvud${marca}`, { tenant: rede.tenantId, donoDaRede: true, rotulo: 'Dona', permissoes: [] })
})

test.afterAll(async () => {
  if (rede) {
    await db().from('tags').delete().eq('tenant_id', rede.tenantId)
    for (const id of criados) {
      const { data } = await db().from('users').select('auth_id').eq('id', id).maybeSingle<{ auth_id: string | null }>()
      await db().from('users').delete().eq('id', id)
      if (data?.auth_id) await db().auth.admin.deleteUser(data.auth_id)
    }
  }
  await pessoa?.limpar(); await dona?.limpar(); await rede?.limpar()
})

test('abre o portal das DUAS unidades dela e fica em cada uma (PO1)', async ({ browser }) => {
  await como(browser, pessoa!, async p => {
    await p.goto(`/${un.B.slug}/dashboard`)
    await expect(p, 'a unidade B é dela: o portal de B abre').toHaveURL(new RegExp(`/${un.B.slug}/dashboard`))
    await p.goto(`/${un.A.slug}/dashboard`)
    await expect(p).toHaveURL(new RegExp(`/${un.A.slug}/dashboard`))
  })
})

test('a unidade que NÃO é dela leva à dela, com o aviso; o portal da rede também', async ({ browser }) => {
  await como(browser, pessoa!, async p => {
    await p.goto(`/${un.C.slug}/agenda`)
    await expect(p).toHaveURL(new RegExp(`/(${un.A.slug}|${un.B.slug})/dashboard`))
    await expect(p.getByText('Essa unidade não está entre as suas. Você está na sua unidade.')).toBeVisible()
    await p.goto('/admin/dashboard')
    await expect(p, 'duas unidades não é a rede inteira (EQ1b)').toHaveURL(new RegExp(`/(${un.A.slug}|${un.B.slug})/dashboard`))
  })
})

test('o seletor do topo tem só as unidades dela e troca para a MESMA tela na outra (PO1)', async ({ browser }) => {
  await como(browser, pessoa!, async p => {
    await p.goto(`/${un.A.slug}/clients`)
    const seletor = p.locator('[data-seletor-de-unidade]')
    await expect(seletor).toContainText(`Unidade: ${un.A.nome}`)
    await seletor.getByRole('button').first().click()
    const opcoes = p.locator('[data-opcao-de-unidade]')
    await expect(opcoes).toHaveCount(2)
    await expect(opcoes.filter({ hasText: un.C.nome }), 'C não é dela').toHaveCount(0)
    await opcoes.filter({ hasText: un.B.nome }).click()
    await expect(p).toHaveURL(new RegExp(`/${un.B.slug}/clients`))
  })
})

test('a action alcança o registro de B e recusa o de C', async ({ browser }) => {
  const nomeB = `${PREFIXO} Unidade B editada ${marca}`
  const nomeC = `${PREFIXO} Unidade C editada ${marca}`
  await como(browser, pessoa!, async p => {
    const rota = `/${un.A.slug}/settings?tab=unidade`
    await chamarAcaoComFormulario(p, 'actions/branches.ts', 'updateBranch', rota, [un.B.id, undefined], { name: nomeB })
    await chamarAcaoComFormulario(p, 'actions/branches.ts', 'updateBranch', rota, [un.C.id, undefined], { name: nomeC })
  })
  const nomes = new Map(((await db().from('branches').select('id, name').in('id', [un.B.id, un.C.id])).data ?? []).map(b => [b.id as string, b.name as string]))
  expect(nomes.get(un.B.id), 'B é dela: a action grava').toBe(nomeB)
  expect(nomes.get(un.C.id), 'C não é dela: a action recusa').toBe(un.C.nome)
  un.B.nome = nomeB
})

test('não é da rede: não grava a configuração da rede toda (H7, EQ1b)', async ({ browser }) => {
  const tag = `${PREFIXO} Tag de quem tem duas ${marca}`
  await como(browser, pessoa!, async p => {
    await chamarAcao(p, 'actions/tags.ts', 'criarTag', `/${un.A.slug}/settings?tab=tags`, [tag])
  })
  expect((await db().from('tags').select('id').eq('tenant_id', rede!.tenantId).eq('nome', tag)).data?.length).toBe(0)
})

// Desde 19/11 a sessão só lê SINAIS (o Heitor, "vai na 2"; CLAUDE.md §4): ela
// não lê unidade nenhuma pela chave pública — A e B se alcançam pelo servidor
// (as telas e as actions acima). Até ali, a RLS dava A e B e escondia a C.
test('a sessão não lê unidade nenhuma pela chave pública — nem as dela', async () => {
  const sessao = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${pessoa!.accessToken}` } },
  })
  const { data, error } = await sessao.from('branches').select('id').eq('tenant_id', rede!.tenantId)
  expect(error).toBeNull()
  expect(new Set((data ?? []).map(b => b.id as string))).toEqual(new Set())
})

test('o login volta à ÚLTIMA unidade usada (PO1)', async ({ browser }) => {
  await como(browser, pessoa!, async p => {
    await p.goto(`/${un.B.slug}/agenda`)
    await expect(p).toHaveURL(new RegExp(`/${un.B.slug}/agenda`))
    // O seletor do topo anota a unidade em que ela está (o cookie), depois de hidratar.
    await expect.poll(async () => (await p.context().cookies()).find(c => c.name === 'bellaris-unidade')?.value).toBe(un.B.slug)
    await p.goto('/login')
    await expect(p, 'a última usada foi B').toHaveURL(new RegExp(`/${un.B.slug}/dashboard`))
  })
})

test('na Equipe, dá só as unidades dela: nem "A rede inteira", nem C', async ({ browser }) => {
  const email = (s: string) => `e2e-eqvu-${s}-${marca}@bellaris.invalid`
  await como(browser, pessoa!, async p => {
    const rota = `/${un.A.slug}/team`
    const base = { name: `${PREFIXO} Nova ${marca}`, roleId: pessoa!.roleId, password: `Senha-${marca}-e2e`, redirectPath: rota }
    await chamarAcaoComFormulario(p, 'actions/team.ts', 'createTeamMember', rota, [undefined], { ...base, email: email('rede'), scope: 'network' })
    await chamarAcaoComFormulario(p, 'actions/team.ts', 'createTeamMember', rota, [undefined], {
      ...base, email: email('bc'), scope: 'branch', _unidades: '1', unidades: `${un.B.id},${un.C.id}`,
    })
  })
  const { data } = await db().from('users').select('id, email, branch_id, outras_unidades').eq('tenant_id', rede!.tenantId).in('email', [email('rede'), email('bc')])
  for (const u of data ?? []) criados.push(u.id as string)
  expect((data ?? []).find(u => u.email === email('rede')), '"A rede inteira" é só de quem a tem').toBeUndefined()
  const bc = (data ?? []).find(u => u.email === email('bc'))
  expect(bc, 'B entra').toBeTruthy()
  expect(bc!.branch_id).toBe(un.B.id)
  expect(bc!.outras_unidades, 'C não é dela: fica de fora').toEqual([])
})

test('o cadastro: "Unidades" com as marcadas e o "Atende" de uma caixa, que vale nas unidades dela (EQ1a, EQ1c)', async ({ browser }) => {
  const email = `e2e-eqvu-tela-${marca}@bellaris.invalid`
  await como(browser, dona!, async p => {
    await p.goto('/admin/team')
    await p.getByRole('button', { name: 'Adicionar membro' }).click()
    const janela = p.getByRole('dialog')
    await janela.getByLabel('Nome completo').fill(`${PREFIXO} Pela tela ${marca}`)
    await janela.getByLabel('E-mail').fill(email)
    await janela.getByLabel('Cargo').selectOption({ label: `${PREFIXO} Duas unidades eqvup${marca}` })
    const unidades = janela.locator('[data-unidades-do-membro]')
    await unidades.getByRole('button', { name: 'Escolher as unidades' }).click()
    await unidades.getByLabel(un.A.nome).check()
    await unidades.getByLabel(un.B.nome).check()
    await janela.getByLabel(/Atende clientes/).check()
    // Fechado por padrão: vale nas unidades dela.
    await expect(janela.locator('[data-escolher-onde-atende]')).toBeVisible()
    await expect(janela.locator('[data-atende-nas-unidades]')).toHaveCount(0)
    await janela.getByLabel('Senha temporária').fill(`Senha-${marca}-e2e`)
    await janela.getByRole('button', { name: 'Criar membro' }).click()
    await expect(janela).toHaveCount(0)
  })
  const { data: u } = await db().from('users').select('id, branch_id, outras_unidades, atende_em, provides_services')
    .eq('tenant_id', rede!.tenantId).eq('email', email).single<{ id: string; branch_id: string; outras_unidades: string[]; atende_em: string[]; provides_services: boolean }>()
  criados.push(u!.id)
  expect(new Set([u!.branch_id, ...u!.outras_unidades]), 'as duas unidades marcadas').toEqual(new Set([un.A.id, un.B.id]))
  expect(new Set(u!.atende_em), 'o "Atende" fechado vale nas unidades dela').toEqual(new Set([un.A.id, un.B.id]))
  expect(u!.provides_services).toBe(true)
})

test('PLAT-02/03: na Equipe da unidade, o cargo acima do dela vem desligado; quem tem outra unidade fora do alcance não se desativa, e o cargo fica travado', async ({ browser }) => {
  // PLAT-02 (plataforma.md, H7 opção b; CLAUDE.md §11: "Ninguém dá um cargo
  // com mais acesso que o próprio"): a Equipe da rede já desligava; a da
  // unidade oferecia o cargo e a action recusava no fim.
  // PLAT-03 (EQ1): o cargo e o desativar valem em TODAS as unidades da pessoa;
  // a de A e C, vista por quem tem A e B, aparece na lista de A — sem o
  // desativar, com o cargo travado, e a action diz o motivo (era "Membro não
  // encontrado.").
  const acima = await criarMembro(`eqvua${marca}`, {
    tenant: rede!.tenantId, branchId: un.A.id, rotulo: 'Com o Financeiro',
    permissoes: [{ modulo: 'financial', nivel: 'MANAGE' }],
  })
  const deAeC = await criarMembro(`eqvuc${marca}`, {
    tenant: rede!.tenantId, branchId: un.A.id, outrasUnidades: [un.C.id], rotulo: 'A e C', permissoes: PERMISSOES,
  })
  const nomeDeAeC = (await db().from('users').select('name').eq('id', deAeC.userId).single<{ name: string }>()).data!.name
  try {
    await como(browser, pessoa!, async p => {
      const rota = `/${un.A.slug}/team`
      await p.goto(rota)
      await p.getByRole('button', { name: 'Adicionar membro' }).click()
      await expect(p.locator(`#tm-role option[value="${acima.roleId}"]`), 'o cargo com o Financeiro vem desligado').toBeDisabled()
      await expect(p.locator(`#tm-role option[value="${pessoa!.roleId}"]`), 'o cargo dela se dá').toBeEnabled()
      await p.goto(rota)

      const linha = p.locator('tr').filter({ has: p.getByLabel(`Editar ${nomeDeAeC}`) })
      await expect(linha).toBeVisible()
      await expect(linha.getByRole('button', { name: /Desativar/ }), 'sem o desativar').toHaveCount(0)
      await linha.getByLabel(`Editar ${nomeDeAeC}`).click()
      await expect(p.locator(`#tme-role-${deAeC.userId}`), 'o cargo fica travado').toBeDisabled()

      const r = await chamarAcao(p, 'actions/team.ts', 'deactivateTeamMember', rota, [deAeC.userId, rota])
      expect(r.texto, 'a recusa diz o motivo').toContain('desativar e reativar é de quem alcança todas as unidades dela')
      expect(r.texto).not.toContain('Membro não encontrado.')
    })
    const { data } = await db().from('users').select('is_active').eq('id', deAeC.userId).single<{ is_active: boolean }>()
    expect(data!.is_active, 'segue ativa').toBe(true)
  } finally {
    await acima.limpar(); await deAeC.limpar()
  }
})

test('EQ-05: quem tem a rede inteira aparece na Equipe da unidade com o editar; o cargo e a abrangência ficam, o desativar não aparece', async ({ browser }) => {
  // D14 da 40ª simulação (EQ-05, decisão do Claude, 27/11): editar pede
  // ALGUMA unidade do membro, e quem tem "A rede inteira" está em todas — quem
  // tem A e B achava a linha dele sem ação nenhuma. Trocar o cargo, a
  // abrangência, desativar e reativar pedem TODAS: duas unidades não são a rede.
  const daRede = await criarMembro(`eqvur${marca}`, {
    tenant: rede!.tenantId, branchId: null, rotulo: 'Da rede', permissoes: [{ modulo: 'agenda', nivel: 'VIEW' }],
    // A Equipe da unidade mostra quem é da rede e ATENDE nela.
    atendeEm: [un.A.id, un.B.id],
  })
  const nomeDaRede = (await db().from('users').select('name').eq('id', daRede.userId).single<{ name: string }>()).data!.name
  try {
    await como(browser, pessoa!, async p => {
      const rota = `/${un.A.slug}/team`
      await p.goto(rota)
      const linha = p.locator('tr').filter({ has: p.getByLabel(`Editar ${nomeDaRede}`) })
      await expect(linha, 'a linha tem o editar').toBeVisible()
      await expect(linha.getByRole('button', { name: /Desativar/ }), 'sem o desativar').toHaveCount(0)
      await linha.getByLabel(`Editar ${nomeDaRede}`).click()
      await expect(p.locator(`#tme-role-${daRede.userId}`), 'o cargo fica travado').toBeDisabled()
      await expect(p.getByRole('dialog').locator('[data-unidades-do-membro]'), 'a abrangência não se escolhe').toHaveCount(0)

      // Pela action: o registro grava; o cargo e a abrangência pedidos não.
      const r = await chamarAcaoComFormulario(p, 'actions/team.ts', 'updateTeamMember', rota, [undefined], {
        userId: daRede.userId, roleId: daRede.roleId, scope: 'branch', _unidades: '1', unidades: un.A.id,
        registro_conselho: `CRM ${marca}`, redirectPath: rota,
      })
      expect(r.status, r.texto.slice(0, 300)).toBe(200)
      const outroCargo = await chamarAcaoComFormulario(p, 'actions/team.ts', 'updateTeamMember', rota, [undefined], {
        userId: daRede.userId, roleId: pessoa!.roleId, redirectPath: rota,
      })
      expect(outroCargo.texto, 'trocar o cargo pede todas as unidades').toContain('o cargo dela só muda quem alcança todas as unidades dela')
      const d = await chamarAcao(p, 'actions/team.ts', 'deactivateTeamMember', rota, [daRede.userId, rota])
      expect(d.texto, 'desativar pede todas as unidades').toContain('desativar e reativar é de quem alcança todas as unidades dela')
    })
    const { data } = await db().from('users').select('branch_id, role_id, is_active, registro_conselho')
      .eq('id', daRede.userId).single<{ branch_id: string | null; role_id: string; is_active: boolean; registro_conselho: string | null }>()
    expect(data!.registro_conselho, 'a edição gravou').toBe(`CRM ${marca}`)
    expect(data!.branch_id, 'segue com a rede inteira').toBeNull()
    expect(data!.role_id, 'o cargo ficou').toBe(daRede.roleId)
    expect(data!.is_active, 'segue ativa').toBe(true)
  } finally {
    await daRede.limpar()
  }
})
