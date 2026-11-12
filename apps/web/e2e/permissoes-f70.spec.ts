import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { criarMembro, sessaoPorEmail, type MembroDeTeste } from './apoio/sessao'
import { chamarAcao, chamarAcaoComFormulario } from './apoio/acao-direta'

/**
 * F70 — Permissões, do levantamento das regras.
 *
 * - C58: o "tudo" da Admin da rede vinha da claim `role` do TOKEN
 *   (`isNetworkAdmin = role === 'NETWORK_ADMIN'`). A Admin rebaixada seguia
 *   com tudo até o token renovar — e qualquer claim que dissesse
 *   NETWORK_ADMIN valia mais que o cargo gravado no banco. Agora o cargo de
 *   sistema é lido do banco (`tenant_roles.key` + `is_system`).
 * - C61: o `/setup` (o primeiro acesso da clínica) abria para a gerente de
 *   unidade fixa — e as actions recusavam no fim. Vai à unidade dela, com o
 *   aviso.
 * - C60: Relatórios em "Ver" sem nenhuma aba era aceito (um acesso que não
 *   abre nada), e a matriz se gravava em três passos soltos — agora numa
 *   transação (`salvar_matriz_do_cargo`).
 * - A14 da 13ª: `/<unidade>/financeiro?unidade=<outra>` abria esta unidade,
 *   calado. Agora tira o filtro e avisa.
 * - C62 (H7 = b): quem tem a Equipe em Gerenciar dava um cargo com mais
 *   acesso que o próprio (o Financeiro inteiro, sem tê-lo). Agora a action
 *   recusa e a tela mostra o cargo desligado.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let membro: MembroDeTeste | null = null
let gerente: MembroDeTeste | null = null
let slug = ''

async function como<T>(browser: Browser, estado: string, fn: (p: Page) => Promise<T>) {
  const ctx = await browser.newContext({ storageState: estado })
  try { return await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`f70perm${marca}`)
  membro = await criarMembro(`f70p${marca}`, {
    tenant: rede.tenantId, rotulo: 'Só vê procedimentos', permissoes: [{ modulo: 'procedures', nivel: 'VIEW' }],
  })
  gerente = await criarMembro(`f70g${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Gerente da unidade',
    permissoes: [{ modulo: 'settings', nivel: 'MANAGE' }, { modulo: 'financial', nivel: 'MANAGE' }],
  })
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
})

test.afterAll(async () => { await gerente?.limpar(); await membro?.limpar(); await rede?.limpar() })

test('C58: a claim NETWORK_ADMIN no token não vale mais que o cargo do banco', async ({ browser }) => {
  const b = db()
  const { data: u } = await b.from('users').select('auth_id, email').eq('id', membro!.userId).single<{ auth_id: string; email: string }>()
  // O token passa a dizer "Admin da rede" — o cargo no banco continua o que só vê.
  const { data: au } = await b.auth.admin.getUserById(u!.auth_id)
  const { error } = await b.auth.admin.updateUserById(u!.auth_id, {
    app_metadata: { ...(au.user?.app_metadata ?? {}), role: 'NETWORK_ADMIN' },
  })
  expect(error).toBeNull()
  await sessaoPorEmail(u!.auth_id, u!.email, membro!.estado)

  await como(browser, membro!.estado, p => chamarAcao(p, 'actions/procedures.ts', 'toggleProcedureStatus', '/admin/procedures',
    [rede!.procedureId, false]))
  const { data: proc } = await b.from('procedures').select('is_active').eq('id', rede!.procedureId).single<{ is_active: boolean }>()
  expect(proc!.is_active, 'o procedimento continua ativo: o cargo só vê').toBe(true)
})

test('C61: o /setup da gerente de unidade fixa leva à unidade dela, com o aviso', async ({ browser }) => {
  await como(browser, gerente!.estado, async p => {
    const r = await p.request.get('/setup', { maxRedirects: 0 })
    expect([303, 307, 308], 'redireciona').toContain(r.status())
    expect(r.headers().location ?? '').toContain(`/${slug}/dashboard?aviso=setup-da-rede`)
  })
})

test('A14: "?unidade=<outra>" no financeiro da unidade tira o filtro e avisa', async ({ browser }) => {
  await como(browser, gerente!.estado, async p => {
    const r = await p.request.get(`/${slug}/financeiro?period=month&unidade=outra-unidade-${marca}`, { maxRedirects: 0 })
    expect([303, 307, 308], 'redireciona').toContain(r.status())
    expect(r.headers().location ?? '').toContain(`/${slug}/financeiro?period=month&aviso=filtro-de-unidade`)
  })
})

test('C60: Relatórios em "Ver" sem aba é recusado; com aba, a matriz e as abas gravam juntas', async ({ browser }) => {
  const b = db()
  const dona = await criarMembro(`f70d${marca}`, { tenant: rede!.tenantId, donoDaRede: true, rotulo: 'Dona', permissoes: [] })
  await b.from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede!.tenantId)
  const { data: cargo } = await b.from('tenant_roles')
    .insert({ tenant_id: rede!.tenantId, key: `F70_${marca}`.toUpperCase(), label: `Cargo f70 ${marca}`, is_system: false })
    .select('id').single<{ id: string }>()
  try {
    await como(browser, dona.estado, async p => {
      const salvar = (campos: Record<string, string>) => chamarAcaoComFormulario(p, 'actions/permissions.ts', 'saveRolePermissions',
        '/admin/settings?tab=permissions', [undefined], { roleId: cargo!.id, ...campos })
      const sem = await salvar({ 'level:reports': 'VIEW', 'scope:reports': 'ALL', 'level:procedures': 'VIEW' })
      expect(sem.texto).toContain('Marque ao menos uma aba de Relatórios')
      const { count } = await b.from('role_permissions').select('id', { count: 'exact', head: true }).eq('role_id', cargo!.id)
      expect(count, 'nada se gravou').toBe(0)

      await salvar({ 'level:reports': 'VIEW', 'scope:reports': 'ALL', 'report:vendas': 'on', 'level:procedures': 'VIEW', inbox_caixas: 'minhas' })
      const { data: rel } = await b.from('role_permissions').select('level').eq('role_id', cargo!.id).eq('module', 'reports').single<{ level: string }>()
      expect(rel!.level).toBe('VIEW')
      const { data: abas } = await b.from('role_report_tabs').select('tab').eq('role_id', cargo!.id)
      expect((abas ?? []).map(a => a.tab)).toEqual(['vendas'])
      const { data: papel } = await b.from('tenant_roles').select('inbox_caixas').eq('id', cargo!.id).single<{ inbox_caixas: string }>()
      expect(papel!.inbox_caixas).toBe('minhas')
    })
  } finally {
    await b.from('role_report_tabs').delete().eq('role_id', cargo!.id)
    await b.from('role_permissions').delete().eq('role_id', cargo!.id)
    await b.from('tenant_roles').delete().eq('id', cargo!.id)
    await dona.limpar()
  }
})

test('C62: ninguém dá um cargo com mais acesso que o próprio', async ({ browser }) => {
  const b = db()
  const rh = await criarMembro(`f70rh${marca}`, {
    tenant: rede!.tenantId, rotulo: 'RH', permissoes: [{ modulo: 'team', nivel: 'MANAGE' }],
  })
  await b.from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede!.tenantId)
  const { data: cargo } = await b.from('tenant_roles')
    .insert({ tenant_id: rede!.tenantId, key: `F70FIN_${marca}`.toUpperCase(), label: `Financeiro f70 ${marca}`, is_system: false })
    .select('id').single<{ id: string }>()
  await b.from('role_permissions').insert({ tenant_id: rede!.tenantId, role_id: cargo!.id, module: 'financial', level: 'MANAGE', scope: 'ALL' })
  try {
    const { data: antes } = await b.from('users').select('role_id').eq('id', membro!.userId).single<{ role_id: string }>()
    await como(browser, rh.estado, async p => {
      const r = await chamarAcaoComFormulario(p, 'actions/team.ts', 'updateTeamMember', '/admin/team', [undefined],
        { userId: membro!.userId, roleId: cargo!.id, redirectPath: '/admin/team' })
      expect(r.texto).toContain('tem módulos que você não tem')
    })
    const { data: depois } = await b.from('users').select('role_id').eq('id', membro!.userId).single<{ role_id: string }>()
    expect(depois!.role_id, 'o cargo não mudou').toBe(antes!.role_id)
  } finally {
    await b.from('role_permissions').delete().eq('role_id', cargo!.id)
    await b.from('tenant_roles').delete().eq('id', cargo!.id)
    await rh.limpar()
  }
})

test('C59 (D19): a conta de uma Admin da rede só outra Admin autoriza ao suporte', async ({ browser }) => {
  const b = db()
  const dona = await criarMembro(`f70sa${marca}`, { tenant: rede!.tenantId, donoDaRede: true, rotulo: 'Dona', permissoes: [] })
  const gerenteDaRede = await criarMembro(`f70sg${marca}`, {
    tenant: rede!.tenantId, rotulo: 'Gerente da rede', permissoes: [{ modulo: 'settings', nivel: 'MANAGE' }],
  })
  await b.from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede!.tenantId)
  try {
    await como(browser, gerenteDaRede.estado, async p => {
      const r = await chamarAcao(p, 'actions/suporte-autorizacao.ts', 'autorizarSuporte', '/admin/settings?tab=suporte',
        [{ userId: dona.userId, horas: 24 }])
      expect(r.texto).toContain('só outra Admin da rede autoriza')
    })
    const { count } = await b.from('support_grants').select('id', { count: 'exact', head: true }).eq('target_user_id', dona.userId)
    expect(count, 'nenhuma autorização para a conta da Admin').toBe(0)
  } finally {
    await b.from('support_grants').delete().eq('target_user_id', dona.userId)
    await gerenteDaRede.limpar()
    await dona.limpar()
  }
})

test('C67 (H6 = a): desativar a unidade oferece mudar a equipe fixa dela para outra unidade', async ({ browser }) => {
  const b = db()
  const dona = await criarMembro(`f70ua${marca}`, { tenant: rede!.tenantId, donoDaRede: true, rotulo: 'Dona', permissoes: [] })
  const fixa = await criarMembro(`f70uf${marca}`, {
    tenant: rede!.tenantId, branchId: rede!.branchId, rotulo: 'Recepção', permissoes: [{ modulo: 'agenda', nivel: 'VIEW' }],
  })
  await b.from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede!.tenantId)
  const { data: outra } = await b.from('branches')
    .insert({ tenant_id: rede!.tenantId, name: `[e2e] Segunda ${marca}`, slug: `e2e-f70-seg-${marca}` })
    .select('id').single<{ id: string }>()
  try {
    await como(browser, dona.estado, async p => {
      const r = await chamarAcao(p, 'actions/branches.ts', 'moverEquipeDaUnidade', '/admin/settings?tab=unidades',
        [rede!.branchId, outra!.id])
      expect(r.status, r.texto.slice(0, 300)).toBe(200)
    })
    const { data: u } = await b.from('users').select('branch_id').eq('id', fixa.userId).single<{ branch_id: string }>()
    expect(u!.branch_id, 'a pessoa fixa passou para a outra unidade').toBe(outra!.id)
  } finally {
    await fixa.limpar()
    await dona.limpar()
    await b.from('branches').delete().eq('id', outra!.id)
  }
})

test('C73 (H8): as Importações são de quem é da rede — quem tem unidade fixa não importa', async ({ browser }) => {
  const b = db()
  const fixa = await criarMembro(`f70im${marca}`, {
    tenant: rede!.tenantId, branchId: rede!.branchId, rotulo: 'Recepção que importa', permissoes: [{ modulo: 'clients', nivel: 'MANAGE' }],
  })
  await b.from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede!.tenantId)
  try {
    await como(browser, fixa.estado, p => chamarAcao(p, 'actions/importacao.ts', 'importarContatos', '/admin/settings', [{
      destino: 'clientes', branchId: rede!.branchId, nomeArquivo: `f70-${marca}.csv`,
      mapeamento: ['name', 'phone'], linhas: [['F70 Importada', '48999990070']], oportunidade: null,
    }]))
    const { count } = await b.from('importacoes').select('id', { count: 'exact', head: true }).eq('criada_por', fixa.userId)
    expect(count, 'nenhuma importação começou').toBe(0)
  } finally {
    const { data: imps } = await b.from('importacoes').select('id').eq('criada_por', fixa.userId)
    for (const i of imps ?? []) {
      await b.from('importacao_linhas').delete().eq('importacao_id', i.id)
      await b.from('importacoes').delete().eq('id', i.id)
    }
    await b.from('clients').delete().eq('tenant_id', rede!.tenantId).eq('name', 'F70 Importada')
    await fixa.limpar()
  }
})

test('D9 da 13ª: a pergunta do CNPJ não apaga o Número nem desmarca o Domingo da unidade nova', async ({ browser }) => {
  // Criar a unidade passa por duas idas ao servidor (a pergunta e a resposta), com a lista recarregada: no dev, lento.
  test.setTimeout(150_000)
  const b = db()
  const dona = await criarMembro(`f70nu${marca}`, { tenant: rede!.tenantId, donoDaRede: true, rotulo: 'Dona', permissoes: [] })
  await b.from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede!.tenantId)
  const nome = `[e2e] Nova f70 ${marca}`
  try {
    await como(browser, dona.estado, async p => {
      await p.goto('/admin/settings?tab=unidades')
      await p.getByRole('button', { name: 'Nova unidade' }).first().click()
      const janela = p.getByRole('dialog', { name: 'Nova unidade' })
      await janela.locator('#br-name').fill(nome)
      await janela.locator('#br-address').fill('Rua das Flores')
      await janela.locator('#br-number').fill('321')
      await janela.getByLabel('Domingo abre').check()
      await janela.getByRole('button', { name: 'Criar unidade' }).click()
      await janela.getByRole('button', { name: 'Criar sem CNPJ' }).click()
      await expect(janela).toBeHidden({ timeout: 60_000 })
    })
    const { data: u } = await b.from('branches').select('address, horario').eq('tenant_id', rede!.tenantId).eq('name', nome)
      .single<{ address: string | null; horario: { dias: Record<string, unknown[]> } | null }>()
    expect(u!.address, 'o Número continua').toBe('Rua das Flores, 321')
    expect((u!.horario?.dias['0'] ?? []).length, 'o Domingo continua aberto').toBeGreaterThan(0)
  } finally {
    await b.from('branches').delete().eq('tenant_id', rede!.tenantId).eq('name', nome)
    await dona.limpar()
  }
})

test('A1 da 13ª: Cargos → Novo diz que o cargo novo começa sem acesso, sem a matriz de outro cargo', async ({ browser }) => {
  const b = db()
  const dona = await criarMembro(`f70cn${marca}`, { tenant: rede!.tenantId, donoDaRede: true, rotulo: 'Dona', permissoes: [] })
  await b.from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede!.tenantId)
  try {
    await como(browser, dona.estado, async p => {
      await p.goto('/admin/settings?tab=permissions')
      await expect(p.getByRole('button', { name: 'Salvar acessos' })).toBeVisible({ timeout: 20_000 })
      await p.getByRole('button', { name: 'Novo' }).click()
      await expect(p.getByText('Cargo novo: começa sem acesso nenhum')).toBeVisible()
      await expect(p.getByRole('button', { name: 'Salvar acessos' })).toBeHidden()
      await p.getByRole('button', { name: 'Cancelar' }).click()
      await expect(p.getByRole('button', { name: 'Salvar acessos' })).toBeVisible()
      // Criado, o painel passa ao cargo novo.
      await p.getByRole('button', { name: 'Novo' }).click()
      await p.getByPlaceholder('Ex.: Recepção').fill(`Novo f70 ${marca}`)
      await p.getByRole('button', { name: 'Criar', exact: true }).click()
      await expect(p.getByText(`Novo f70 ${marca}`).first()).toBeVisible({ timeout: 20_000 })
      await expect(p.getByText('Cargo novo: começa sem acesso nenhum')).toBeHidden()
      await expect(p.getByRole('heading', { name: new RegExp(`O que Novo f70 ${marca} acessa`) })).toBeVisible()
    })
  } finally {
    await b.from('tenant_roles').delete().eq('tenant_id', rede!.tenantId).eq('label', `Novo f70 ${marca}`)
    await dona.limpar()
  }
})

test('A2 da 13ª: Configurações → Geral, para a gerente de unidade fixa, é texto — sem campo que parece editável', async ({ browser }) => {
  await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede!.tenantId)
  // A gerente (unidade fixa, Configurações em Gerenciar) lê os dados da clínica: não os edita (H7).
  await como(browser, gerente!.estado, async p => {
    await p.goto(`/${slug}/settings?tab=general`)
    await expect(p.locator('[data-geral-so-leitura]')).toBeVisible({ timeout: 20_000 })
    await expect(p.locator('input[name="name"]')).toHaveCount(0)
  })
})

test('A3 da 13ª: a comissão de quem não vê as próprias diz por quê', async ({ browser }) => {
  const b = db()
  const dona = await criarMembro(`f70cd${marca}`, { tenant: rede!.tenantId, donoDaRede: true, rotulo: 'Dona', permissoes: [] })
  const vendedora = await criarMembro(`f70vd${marca}`, {
    tenant: rede!.tenantId, rotulo: 'Vendedora', permissoes: [{ modulo: 'crm', nivel: 'MANAGE' }],
  })
  await b.from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede!.tenantId)
  const { data: u } = await b.from('users').update({ comissao_venda_pct: 6 }).eq('id', vendedora.userId).select('name').single<{ name: string }>()
  try {
    await como(browser, dona.estado, async p => {
      await p.goto('/admin/team')
      await p.getByRole('button', { name: `Comissão de ${u!.name}` }).click()
      await expect(p.getByText(`${u!.name} não vê as próprias comissões`)).toBeVisible()
    })
  } finally {
    await vendedora.limpar()
    await dona.limpar()
  }
})
