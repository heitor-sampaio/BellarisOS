import { test, expect, type Browser, type Page } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { banco, PREFIXO, criarLoginDeTeste } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao, chamarAcaoComFormulario } from './apoio/acao-direta'

/**
 * Bloco Configurações do plano de adaptação (docs/revisao.md, CF3a–CF3c — o
 * Heitor, 2026-11-13: "queria um lugar para auditoria, acho que como dos
 * eventos, onde o admin pudesse ver tudo o que aconteceu"; "Pode ser no
 * menu"), numa rede [e2e] própria com três unidades:
 *
 * - CF3b: o registro (`auditoria`) — toda gravação que muda algo, pela sessão
 *   ou pelo servidor, com QUEM agiu (o membro; "via suporte"; "o sistema"); a
 *   abertura do prontuário e a entrada no sistema. Não se altera nem se apaga,
 *   a sessão não o lê, e o texto clínico nunca entra.
 * - CF3c: a Auditoria é SÓ da Admin da rede (o Heitor, 2026-11-16: "Auditoria
 *   é só admin"): não está na matriz de Cargos, a action não a grava, e a
 *   linha `audit` num cargo (como a regra antiga deixava dar) não abre nada —
 *   nem para quem tem "A rede inteira", nem para quem tem unidades.
 * - CF3a: a tela (menu, Gestão) e o CSV, paginados, com os filtros — e o
 *   "Abriu o prontuário" também no portal da unidade (a Admin vê tudo).
 */

test.setTimeout(240_000)
// Os testes da tela leem o que os do registro gravaram (a tag, as salas, a ficha aberta): uma rede, em série.
test.describe.configure({ mode: 'serial' })

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICO = process.env.SUPABASE_SERVICE_ROLE_KEY!
const SEM_ACESSO = 'Você não tem acesso a esta área'

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede
let slugA = ''
let unidadeB = ''
let unidadeC = ''
let dona: MembroDeTeste
let semAuditoria: MembroDeTeste
let daUnidade: MembroDeTeste
let nomeDaDona = ''
let clienteId = ''
let profAuth = ''
let profNome = ''
let staff = ''
let loginDoStaff = ''
let sessaoDeSuporte = ''
const NOME_DO_STAFF = `${PREFIXO} Atendente ${marca}`
const TAG = `${PREFIXO} Tag da auditoria ${marca}`

function comToken(accessToken: string): SupabaseClient {
  return createClient(URL_, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  })
}

async function como(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado, viewport: { width: 1440, height: 900 } })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

type Linha = {
  id: number; tabela: string; operacao: string; registro_id: string | null; branch_id: string | null; client_id: string | null
  colunas: string[]; antes: Record<string, unknown>; depois: Record<string, unknown>
  ator_user_id: string | null; ator_nome: string; ator_tipo: string; suporte_sessao_id: string | null
}
const linhasDaRede = async () => {
  const { data, error } = await db().from('auditoria').select('*').eq('tenant_id', rede.tenantId).order('id')
  expect(error, error?.message).toBeNull()
  return (data ?? []) as Linha[]
}

/** Grava pelo PostgREST com a chave de serviço, como o servidor — com os cabeçalhos dados. */
async function peloServidor(tabela: string, corpo: Record<string, unknown>, cabecalhos: Record<string, string> = {}) {
  const r = await fetch(`${URL_}/rest/v1/${tabela}?select=id`, {
    method: 'POST',
    headers: {
      apikey: SERVICO, Authorization: `Bearer ${SERVICO}`, 'content-type': 'application/json',
      Prefer: 'return=representation', ...cabecalhos,
    },
    body: JSON.stringify(corpo),
  })
  expect(r.status, await r.clone().text()).toBe(201)
  return ((await r.json()) as { id: string }[])[0]!.id
}

const sala = async (branchId: string, nome: string) => {
  const { data, error } = await db().from('rooms').insert({ branch_id: branchId, name: nome }).select('id').single<{ id: string }>()
  expect(error, error?.message).toBeNull()
  return data!.id
}

test.use({ storageState: { cookies: [], origins: [] } })

test.beforeAll(async () => {
  rede = await criarOutraRede(`aud${marca}`)
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  slugA = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  for (const [letra, alvo] of [['B', 'b'], ['C', 'c']] as const) {
    const { data, error } = await db().from('branches')
      .insert({ tenant_id: rede.tenantId, name: `${PREFIXO} Unidade ${letra} ${marca}`, slug: `e2e-un-${alvo}-${marca}` })
      .select('id').single<{ id: string }>()
    expect(error, error?.message).toBeNull()
    if (letra === 'B') unidadeB = data!.id; else unidadeC = data!.id
  }
  dona = await criarMembro(`audd${marca}`, { tenant: rede.tenantId, donoDaRede: true, permissoes: [] })
  // "A rede inteira", e o cargo com a linha `audit` em Ver gravada direto (como
  // a regra antiga deixava dar): a linha não vale — a Auditoria é só da Admin.
  semAuditoria = await criarMembro(`auds${marca}`, {
    tenant: rede.tenantId, rotulo: 'Sem auditoria',
    permissoes: [{ modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'settings', nivel: 'MANAGE' }, { modulo: 'reports', nivel: 'VIEW' }, { modulo: 'audit', nivel: 'VIEW' }],
  })
  daUnidade = await criarMembro(`audu${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, outrasUnidades: [unidadeB], rotulo: 'Unidades A e B',
    permissoes: [{ modulo: 'audit', nivel: 'VIEW' }],
  })
  nomeDaDona = (await db().from('users').select('name').eq('id', dona.userId).single<{ name: string }>()).data!.name
  clienteId = await rede.criarCliente('Ana')
  const { data: prof } = await db().from('users').select('auth_id, name').eq('id', rede.professionalId).single<{ auth_id: string; name: string }>()
  profAuth = prof!.auth_id; profNome = prof!.name

  // Uma sessão de suporte ATIVA na rede, como o painel a deixa (o "entrar como" na conta da profissional).
  const email = `e2e-plataforma-aud${marca}@bellaris.invalid`
  loginDoStaff = await criarLoginDeTeste(db(), email, 'criar o login do atendente')
  const { data: st, error: eS } = await db().from('platform_staff')
    .insert({ auth_id: loginDoStaff, name: NOME_DO_STAFF, email, papel: 'SUPORTE' }).select('id').single<{ id: string }>()
  expect(eS, eS?.message).toBeNull()
  staff = st!.id
  const { data: g, error: eG } = await db().from('support_grants').insert({
    tenant_id: rede.tenantId, target_user_id: rede.professionalId, via: 'configuracoes',
    expires_at: new Date(Date.now() + 3_600_000).toISOString(),
  }).select('id').single<{ id: string }>()
  expect(eG, eG?.message).toBeNull()
  const { data: s, error: eSe } = await db().from('support_sessions').insert({
    grant_id: g!.id, tenant_id: rede.tenantId, target_user_id: rede.professionalId, target_auth_id: profAuth,
    staff_id: staff, motivo: 'teste da auditoria', includes_clinical: false, status: 'ativa',
    started_at: new Date(Date.now() - 60_000).toISOString(), expires_at: new Date(Date.now() + 3_600_000).toISOString(),
  }).select('id').single<{ id: string }>()
  expect(eSe, eSe?.message).toBeNull()
  sessaoDeSuporte = s!.id
})

test.afterAll(async () => {
  if (staff) {
    await db().from('support_access_log').delete().eq('session_id', sessaoDeSuporte)
    await db().from('support_sessions').delete().eq('staff_id', staff)
    await db().from('support_grants').delete().eq('tenant_id', rede.tenantId)
    await db().from('platform_staff').delete().eq('id', staff)
  }
  if (loginDoStaff) await db().auth.admin.deleteUser(loginDoStaff)
  await daUnidade?.limpar(); await semAuditoria?.limpar(); await dona?.limpar()
  await rede?.limpar()
})

test.describe('CF3b: o registro', () => {
  test('a gravação pelo servidor (a action) leva quem agiu, pelo nome', async ({ browser }) => {
    await como(browser, dona, async p => {
      await chamarAcao(p, 'actions/tags.ts', 'criarTag', '/admin/settings?tab=tags', [TAG])
    })
    const { data: tag } = await db().from('tags').select('id').eq('tenant_id', rede.tenantId).eq('nome', TAG).single<{ id: string }>()
    expect(tag, 'a tag foi criada').not.toBeNull()
    await expect.poll(async () => (await linhasDaRede()).filter(l => l.tabela === 'tags' && l.registro_id === tag!.id)
      .map(l => [l.operacao, l.ator_user_id, l.ator_nome, l.ator_tipo]), { timeout: 15_000 })
      .toEqual([['criou', dona.userId, nomeDaDona, 'membro']])
  })

  test('o que grava sem ninguém (cron, webhook, script) é "o sistema"', async () => {
    const id = await sala(unidadeC, `${PREFIXO} Sala do sistema ${marca}`)
    const l = (await linhasDaRede()).find(x => x.tabela === 'rooms' && x.registro_id === id)!
    expect([l.operacao, l.ator_tipo, l.ator_nome, l.branch_id]).toEqual(['criou', 'sistema', 'O sistema', unidadeC])
  })

  test('o suporte aparece "via suporte", com o nome do atendente', async () => {
    const id = await peloServidor('rooms', { branch_id: rede.branchId, name: `${PREFIXO} Sala do suporte ${marca}` },
      { 'x-bellaris-ator': profAuth, 'x-bellaris-suporte-sessao': sessaoDeSuporte })
    const l = (await linhasDaRede()).find(x => x.tabela === 'rooms' && x.registro_id === id)!
    expect([l.ator_tipo, l.ator_user_id, l.ator_nome, l.suporte_sessao_id])
      .toEqual(['suporte', rede.professionalId, `${profNome} (via suporte: ${NOME_DO_STAFF})`, sessaoDeSuporte])
  })

  // Desde a M1 (o Heitor, 18/11) a sessão não grava a ficha da cliente — só o
  // servidor. O agendamento a sessão ainda grava (appointments_update), e ele é
  // auditado: é por ele que se prova que o cabeçalho forjado não troca o ator.
  test('pela sessão, quem agiu é o dono do token — o cabeçalho forjado não vale', async () => {
    const { data: ag, error: eA } = await db().from('appointments').insert({
      branch_id: rede.branchId, client_id: clienteId, professional_id: rede.professionalId, procedure_id: rede.procedureId,
      scheduled_at: new Date(Date.now() + 86_400_000).toISOString(), duration_min: 30, price: 100, status: 'SCHEDULED',
    }).select('id').single<{ id: string }>()
    expect(eA, eA?.message).toBeNull()
    const r = await fetch(`${URL_}/rest/v1/appointments?id=eq.${ag!.id}&select=id`, {
      method: 'PATCH',
      headers: {
        apikey: ANON, Authorization: `Bearer ${dona.accessToken}`, 'content-type': 'application/json',
        Prefer: 'return=representation', 'x-bellaris-ator': profAuth, 'x-bellaris-suporte-sessao': sessaoDeSuporte,
      },
      body: JSON.stringify({ price: 120 }),
    })
    expect(r.status, await r.clone().text()).toBe(200)
    expect(((await r.json()) as unknown[]).length, 'a sessão da dona alterou o agendamento').toBe(1)
    const l = (await linhasDaRede()).filter(x => x.tabela === 'appointments' && x.registro_id === ag!.id && x.operacao === 'editou').at(-1)!
    expect([l.ator_user_id, l.ator_tipo, l.suporte_sessao_id, l.colunas]).toEqual([dona.userId, 'membro', null, ['price']])
    expect(l.client_id).toBe(clienteId)
  })

  test('o texto da ficha não vai ao registro — só que a coluna mudou', async () => {
    expect((await db().from('clients').update({ notes: `nota ${marca}` }).eq('id', clienteId)).error).toBeNull()
    const l = (await linhasDaRede()).filter(x => x.tabela === 'clients' && x.registro_id === clienteId && x.operacao === 'editou').at(-1)!
    expect(l.colunas).toEqual(['notes'])
    expect(l.client_id).toBe(clienteId)
    expect(JSON.stringify([l.antes, l.depois]), 'o texto da ficha não vai ao registro').not.toContain(`nota ${marca}`)
  })

  test('a evolução gravada entra como "criou", sem o texto clínico', async () => {
    const SEGREDO = `TEXTO-CLINICO-${marca}`
    const { data: pr, error: e1 } = await db().from('medical_records').insert({ client_id: clienteId }).select('id').single<{ id: string }>()
    expect(e1, e1?.message).toBeNull()
    const { data: ag, error: eA } = await db().from('appointments').insert({
      branch_id: rede.branchId, client_id: clienteId, professional_id: rede.professionalId, procedure_id: rede.procedureId,
      scheduled_at: new Date(Date.now() - 3_600_000).toISOString(), duration_min: 30, price: 100, status: 'COMPLETED',
    }).select('id').single<{ id: string }>()
    expect(eA, eA?.message).toBeNull()
    const { data: ev, error: e2 } = await db().from('medical_record_entries')
      .insert({ medical_record_id: pr!.id, appointment_id: ag!.id, professional_id: rede.professionalId, notes: SEGREDO, intercurrences: SEGREDO, queixas: SEGREDO })
      .select('id').single<{ id: string }>()
    expect(e2, e2?.message).toBeNull()
    const { error: e3 } = await db().from('medical_record_entries').update({ notes: `${SEGREDO} editado` }).eq('id', ev!.id)
    expect(e3, e3?.message).toBeNull()
    const linhas = await linhasDaRede()
    const daEvolucao = linhas.filter(l => l.tabela === 'medical_record_entries' && l.registro_id === ev!.id)
    expect(daEvolucao.map(l => [l.operacao, l.client_id])).toEqual([['criou', clienteId], ['editou', clienteId]])
    expect(daEvolucao[1]!.colunas).toEqual(['notes'])
    expect(JSON.stringify(linhas), 'nenhuma linha da auditoria carrega o texto clínico').not.toContain(SEGREDO)
  })

  test('abrir o prontuário da cliente (a aba dele, A30 da 15ª) registra que abriu', async ({ browser }) => {
    await como(browser, dona, async p => { await p.goto(`/admin/clients/${clienteId}?aba=fichas`) })
    await expect.poll(async () => (await linhasDaRede())
      .filter(l => l.tabela === 'prontuario_acessos' && l.client_id === clienteId)
      .map(l => [l.operacao, l.ator_user_id]), { timeout: 15_000 }).toContainEqual(['abriu', dona.userId])
  })

  test('a entrada no sistema fica registrada', async () => {
    // O criarMembro entra pela porta do app (/api/auth/session).
    const l = (await linhasDaRede()).filter(x => x.operacao === 'entrou')
    expect(l.map(x => x.ator_user_id)).toEqual(expect.arrayContaining([dona.userId, daUnidade.userId]))
    expect(l.find(x => x.ator_user_id === daUnidade.userId)!.branch_id).toBe(rede.branchId)
  })

  test('não se altera nem se apaga — nem pelo servidor', async () => {
    const [l] = await linhasDaRede()
    const up = await db().from('auditoria').update({ ator_nome: 'outra pessoa' }).eq('id', l!.id)
    expect(up.error?.message ?? '').toMatch(/não se altera/)
    const del = await db().from('auditoria').delete().eq('id', l!.id)
    expect(del.error?.message ?? '').toMatch(/não se altera/)
    expect((await db().from('auditoria').select('ator_nome').eq('id', l!.id).single<{ ator_nome: string }>()).data!.ator_nome).toBe(l!.ator_nome)
  })

  test('a sessão de um membro não lê a auditoria (nem a da própria rede) nem grava nela', async () => {
    expect((await linhasDaRede()).length, 'controle: o servidor lê').toBeGreaterThan(0)
    for (const m of [dona, semAuditoria, daUnidade]) {
      const s = comToken(m.accessToken)
      const { data } = await s.from('auditoria').select('id').eq('tenant_id', rede.tenantId)
      expect(data ?? [], 'a sessão não lê').toEqual([])
      const ins = await s.from('auditoria').insert({ tenant_id: rede.tenantId, tabela: 'x', operacao: 'criou', ator_nome: 'forjado', ator_tipo: 'membro' })
      expect(ins.error, 'a sessão não grava').not.toBeNull()
    }
    expect((await linhasDaRede()).some(l => l.ator_nome === 'forjado')).toBe(false)
  })
})

test.describe('CF3a: a tela', () => {
  test('a dona vê no menu (Gestão, ao lado de Relatórios), acha na busca e lê o quê em português, com quem e o link', async ({ browser }) => {
    await como(browser, dona, async p => {
      await p.goto('/admin/dashboard')
      const item = p.locator('nav a[href="/admin/auditoria"]')
      await expect(item).toHaveText(/Auditoria/)
      const campo = p.getByRole('combobox', { name: 'Busca universal' })
      await campo.click()
      await campo.fill('auditoria')
      await p.getByRole('option', { name: /^Auditoria/ }).click()
      await expect(p).toHaveURL(/\/admin\/auditoria/)
      await expect(p.getByRole('heading', { name: 'Auditoria' })).toBeVisible()
      const linhaDaTag = p.locator('[data-linha-da-auditoria]').filter({ hasText: TAG })
      await expect(linhaDaTag).toContainText(`Criou a tag ${TAG}`)
      await expect(linhaDaTag).toContainText(nomeDaDona)
      const doSuporte = p.locator('[data-linha-da-auditoria]').filter({ hasText: 'Sala do suporte' })
      await expect(doSuporte).toContainText(`via suporte: ${NOME_DO_STAFF}`)
      const ficha = p.locator('[data-linha-da-auditoria]').filter({ hasText: 'Abriu o prontuário' }).first()
      await expect(ficha).toContainText('Ana')
      await expect(ficha.getByRole('link')).toHaveAttribute('href', `/admin/clients/${clienteId}`)
    })
  })

  test('os filtros: pessoa, unidade, tipo e cliente', async ({ browser }) => {
    await como(browser, dona, async p => {
      await p.goto(`/admin/auditoria?pessoa=${dona.userId}`)
      await expect(p.locator('[data-linha-da-auditoria]').filter({ hasText: TAG })).toHaveCount(1)
      await expect(p.locator('[data-linha-da-auditoria]').filter({ hasText: 'Sala do sistema' })).toHaveCount(0)

      await p.goto(`/admin/auditoria?unidade=${unidadeC}`)
      await expect(p.locator('[data-linha-da-auditoria]').filter({ hasText: 'Sala do sistema' })).toHaveCount(1)
      await expect(p.locator('[data-linha-da-auditoria]').filter({ hasText: 'Sala do suporte' })).toHaveCount(0)

      await p.goto('/admin/auditoria?tipo=abriu')
      await expect(p.locator('[data-linha-da-auditoria]').first()).toContainText('Abriu o prontuário')
      await expect(p.locator('[data-linha-da-auditoria]').filter({ hasText: TAG })).toHaveCount(0)

      await p.goto(`/admin/auditoria?cliente=${encodeURIComponent('Ana')}`)
      await expect(p.locator('[data-linha-da-auditoria]').filter({ hasText: 'Ana' }).first()).toBeVisible()
      await expect(p.locator('[data-linha-da-auditoria]').filter({ hasText: TAG })).toHaveCount(0)
    })
  })

  // A regra mudou em 2026-11-16 ("Auditoria é só admin"): era "quem tem as
  // unidades A e B vê A e B, não a C". Quem tem unidades não abre a Auditoria.
  test('quem tem as unidades A e B (com a linha `audit` no cargo) não abre a Auditoria em portal nenhum, nem o CSV', async ({ browser }) => {
    await como(browser, daUnidade, async p => {
      await p.goto(`/${slugA}/dashboard`)
      await expect(p.locator('nav a[href$="/auditoria"]')).toHaveCount(0)
      await p.goto(`/${slugA}/auditoria`)
      await expect(p.getByText(SEM_ACESSO)).toBeVisible()
      await expect(p.locator('[data-linha-da-auditoria]')).toHaveCount(0)
      const csv = await p.request.get('/api/auditoria/csv', { maxRedirects: 0 })
      expect(csv.status()).toBe(403)
    })
  })

  test('a Admin da rede, no portal de uma unidade, lê as unidades e tem o filtro "Abriu o prontuário"', async ({ browser }) => {
    await sala(unidadeB, `${PREFIXO} Sala B ${marca}`)
    await sala(rede.branchId, `${PREFIXO} Sala A ${marca}`)
    await como(browser, dona, async p => {
      await p.goto(`/${slugA}/auditoria`)
      await expect(p.getByRole('heading', { name: 'Auditoria' })).toBeVisible()
      await expect(p.locator('[data-linha-da-auditoria]').filter({ hasText: 'Sala A' })).toHaveCount(1)
      await expect(p.locator('[data-linha-da-auditoria]').filter({ hasText: 'Sala B' })).toHaveCount(1)
      await expect(p.locator('select option[value="abriu"]')).toHaveCount(1)
      await p.goto(`/${slugA}/auditoria?tipo=abriu`)
      await expect(p.locator('[data-linha-da-auditoria]').first()).toContainText('Abriu o prontuário')
    })
  })

  test('o CSV da dona traz o que a tela traz', async ({ browser }) => {
    await como(browser, dona, async p => {
      const csv = await p.request.get('/api/auditoria/csv')
      expect(csv.status()).toBe(200)
      expect(csv.headers()['content-type']).toContain('text/csv')
      const texto = await csv.text()
      expect(texto.split('\n')[0]).toMatch(/Quando;Quem;O quê;Gravação;Unidade/)
      expect(texto).toContain(`Criou a tag ${TAG}`)
    })
  })

  test('a lista é paginada: 50 por página e o "Mais antigas"', async ({ browser }) => {
    // Uma gravação por sala: as linhas de UMA gravação viram uma só (A27 da 15ª).
    for (let i = 0; i < 55; i++) {
      const { error } = await db().from('rooms').insert({ branch_id: unidadeB, name: `${PREFIXO} Lote ${i} ${marca}` })
      expect(error, error?.message).toBeNull()
    }
    await como(browser, dona, async p => {
      await p.goto('/admin/auditoria')
      await expect(p.locator('[data-linha-da-auditoria]')).toHaveCount(50)
      await p.locator('[data-auditoria-mais]').click()
      await expect(p).toHaveURL(/antes=\d+/)
      await expect(p.locator('[data-linha-da-auditoria]').first()).toBeVisible()
      // A34 da 24ª: na página antiga, a volta às mais recentes também no topo.
      await p.locator('[data-auditoria-voltar]').click()
      await expect(p).not.toHaveURL(/antes=/)
      await expect(p.locator('[data-linha-da-auditoria]')).toHaveCount(50)
    })
  })
})

// Por último: o cargo criado e apagado pela action grava 36 linhas e empurraria
// as da CF3a para a segunda página (50 por página).
test.describe('CF3c: só a Admin da rede', () => {
  test('a Auditoria não está na matriz de Cargos, os modelos nascem sem ela e a action não a grava', async ({ browser }) => {
    // Só os cargos do próprio teste (gravados direto, pela regra antiga) têm a linha; nenhum modelo nasce com ela.
    const { data } = await db().from('role_permissions').select('id').eq('tenant_id', rede.tenantId).eq('module', 'audit')
      .not('role_id', 'in', `(${daUnidade.roleId},${semAuditoria.roleId})`)
    expect(data ?? [], 'nenhum modelo nasce com a Auditoria').toEqual([])
    const { data: cargo, error } = await db().from('tenant_roles')
      .insert({ tenant_id: rede.tenantId, key: `AUD_${marca}`.toUpperCase(), label: `${PREFIXO} Cargo aud ${marca}`, is_system: false })
      .select('id').single<{ id: string }>()
    expect(error, error?.message).toBeNull()
    try {
      await como(browser, dona, async p => {
        await p.goto('/admin/settings?tab=permissions')
        await expect(p.locator('[data-modulo="reports"]').first()).toBeVisible()
        await expect(p.locator('[data-modulo="audit"]')).toHaveCount(0)
        // A action, chamada direto com a Auditoria em Ver: grava o resto, a Auditoria não.
        const r = await chamarAcaoComFormulario(p, 'actions/permissions.ts', 'saveRolePermissions',
          '/admin/settings?tab=permissions', [undefined], { roleId: cargo!.id, 'level:clients': 'VIEW', 'level:audit': 'VIEW' })
        expect(r.texto, 'chegou à action').not.toContain('Server action not found')
      })
      const { data: linhas } = await db().from('role_permissions').select('module, level').eq('role_id', cargo!.id)
      expect(linhas ?? []).toEqual(expect.arrayContaining([{ module: 'clients', level: 'VIEW' }]))
      expect((linhas ?? []).filter(l => l.module === 'audit'), 'a Auditoria não se grava em cargo').toEqual([])
    } finally {
      await db().from('role_permissions').delete().eq('role_id', cargo!.id)
      await db().from('tenant_roles').delete().eq('id', cargo!.id)
    }
  })

  test('quem não é a Admin da rede (mesmo com a linha `audit` no cargo) não a vê no menu, não abre a tela, não acha na busca e não baixa o CSV', async ({ browser }) => {
    await como(browser, semAuditoria, async p => {
      await p.goto('/admin/dashboard')
      await expect(p.locator('nav a[href="/admin/auditoria"]')).toHaveCount(0)
      const campo = p.getByRole('combobox', { name: 'Busca universal' })
      await campo.click()
      await campo.fill('auditoria')
      await expect(p.getByRole('option', { name: /^Auditoria/ })).toHaveCount(0)
      await p.goto('/admin/auditoria')
      await expect(p.getByText(SEM_ACESSO)).toBeVisible()
      const csv = await p.request.get('/api/auditoria/csv', { maxRedirects: 0 })
      expect(csv.status()).toBe(403)
    })
  })
})
