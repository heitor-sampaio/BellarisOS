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
  .map(modulo => ({ modulo, nivel: 'MANAGE' as const, escopo: 'ALL' as const }))

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

test('a sessão (RLS) lê as unidades A e B, não a C', async () => {
  const sessao = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${pessoa!.accessToken}` } },
  })
  const { data, error } = await sessao.from('branches').select('id').eq('tenant_id', rede!.tenantId)
  expect(error).toBeNull()
  expect(new Set((data ?? []).map(b => b.id as string))).toEqual(new Set([un.A.id, un.B.id]))
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
