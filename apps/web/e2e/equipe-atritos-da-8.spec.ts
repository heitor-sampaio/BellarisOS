import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { diaEmQueAUnidadeAbre } from './apoio/datas'

/**
 * Os atritos da EQUIPE na 8ª simulação (2026-11-06), numa rede [e2e] de duas
 * unidades (a Água Verde e o Batel da Clínica Íris):
 * - A3: o cadastro não pedia a comissão, e o Desativar era um ícone que se
 *   confundia com os outros;
 * - A10: o Desativar não deixava cancelar o que não se repassa, e o
 *   agendamento vencido (a Ana, 23:55 de ontem) ficava com a Débora sem aviso;
 * - A11: "Ninguém livre que atenda nesta unidade" não dizia que havia quem
 *   atendesse em outra, nem como incluí-la;
 * - A13: o cargo novo salvou uma vez com a Agenda em Ver depois do clique em
 *   Gerenciar e do escopo (a conferir);
 * - A15: "Quem vendeu" trazia a Contadora no meio de quem atende.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let batel = ''
let slugA = ''
let nomeA = ''
let nomeBatel = ''
let dona: MembroDeTeste | null = null
let debora: MembroDeTeste | null = null
let talita: MembroDeTeste | null = null
let gerenteA: MembroDeTeste | null = null
let contadora: MembroDeTeste | null = null
let clienteId = ''

async function como(browser: Browser, estado: string, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}
const nome = async (m: MembroDeTeste) => (await db().from('users').select('name').eq('id', m.userId).single<{ name: string }>()).data!.name

async function agendar(prof: MembroDeTeste, quando: string, minutos = 60): Promise<string> {
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: clienteId, procedure_id: rede!.procedureId, professional_id: prof.userId,
    scheduled_at: quando, duration_min: minutos, price: 100, status: 'SCHEDULED',
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  return data!.id
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
  test.setTimeout(150_000)
  rede = await criarOutraRede(`ea8${marca}`)
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  const a = (await db().from('branches').select('slug, name').eq('id', rede.branchId).single<{ slug: string; name: string }>()).data!
  slugA = a.slug; nomeA = a.name
  nomeBatel = `${PREFIXO} Batel ea8${marca}`
  const { data: b, error } = await db().from('branches')
    .insert({ tenant_id: rede.tenantId, name: nomeBatel, slug: `e2e-batel-ea8${marca}` }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  batel = b!.id
  clienteId = await rede.criarCliente('Ana')
  dona = await criarMembro(`ea8d${marca}`, { tenant: rede.tenantId, donoDaRede: true, rotulo: 'Dona', permissoes: [] })
  debora = await criarMembro(`ea8b${marca}`, { tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Debora', permissoes: [{ modulo: 'agenda', nivel: 'VIEW', escopo: 'OWN' }] })
  talita = await criarMembro(`ea8t${marca}`, { tenant: rede.tenantId, branchId: batel, rotulo: 'Talita', permissoes: [{ modulo: 'agenda', nivel: 'VIEW', escopo: 'OWN' }] })
  gerenteA = await criarMembro(`ea8g${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Gerente',
    permissoes: [{ modulo: 'team', nivel: 'MANAGE' }, { modulo: 'financial', nivel: 'MANAGE', escopo: 'ALL' }],
  })
  contadora = await criarMembro(`ea8c${marca}`, { tenant: rede.tenantId, rotulo: 'Contadora', permissoes: [{ modulo: 'financial', nivel: 'VIEW', escopo: 'ALL' }] })
  // A Débora atende na Água Verde; a Talita, só no Batel. Ninguém mais atende.
  expect((await db().from('users').update({ atende_em: [rede.branchId] }).eq('id', debora.userId)).error).toBeNull()
  expect((await db().from('users').update({ atende_em: [batel] }).eq('id', talita.userId)).error).toBeNull()
})

test.afterAll(async () => {
  if (rede) {
    const { data: ags } = await db().from('appointments').select('id').eq('client_id', clienteId)
    const ids = (ags ?? []).map(x => x.id as string)
    if (ids.length) { await db().from('appointment_history').delete().in('appointment_id', ids); await db().from('appointments').delete().in('id', ids) }
  }
  for (const m of [dona, debora, talita, gerenteA, contadora]) if (m) await db().from('domain_events').delete().eq('entidade_id', m.userId)
  await contadora?.limpar(); await gerenteA?.limpar(); await talita?.limpar(); await debora?.limpar(); await dona?.limpar()
  await rede?.limpar()
})

test('A11: sem ninguém livre na unidade, o repasse diz quem atende em outra unidade e como marcar', async ({ browser }) => {
  const futuro = await agendar(debora!, new Date(`${diaEmQueAUnidadeAbre(3)}T10:00:00-03:00`).toISOString())
  try {
    await como(browser, dona!.estado, async p => {
      const janela = await abrirDesativar(p, debora!)
      const linha = janela.locator(`[data-agendamento="${futuro}"]`)
      await expect(linha).toContainText('Ninguém livre que atenda nesta unidade')
      await expect(linha).toContainText(`${await nome(talita!)} (${nomeBatel})`)
      await expect(linha).toContainText(`marque “${nomeA}” no “Atende clientes em”`)
    })
  } finally {
    await db().from('appointments').delete().eq('id', futuro)
  }
})

test('A10: o Desativar cancela o escolhido e diz o que fica com a pessoa — o vencido inclusive', async ({ browser }) => {
  const futuro = await agendar(debora!, new Date(`${diaEmQueAUnidadeAbre(4)}T11:00:00-03:00`).toISOString())
  // A Ana às 23:55 de ontem, que passou sem ninguém fechar. "Ontem" é o dia de
  // 25 h atrás: das 00:00 às 00:25, o 23:55 de 24 h atrás (meia hora) ainda
  // estava EM ANDAMENTO — não "já passou" (a completa de 09–10/11, às 00:00:14,
  // F47). Com 25 h, ele terminou há pelo menos 35 minutos.
  const ontem = new Date(Date.now() - 25 * 3_600_000)
  const dia = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(ontem)
  const vencido = await agendar(debora!, new Date(`${dia}T23:55:00-03:00`).toISOString(), 30)
  await como(browser, dona!.estado, async p => {
    const janela = await abrirDesativar(p, debora!)
    await expect(janela.locator(`[data-agendamento="${vencido}"]`), 'o vencido aparece').toContainText('já passou')
    await expect(janela.locator('[data-o-que-fica]')).toContainText(`continua no nome de ${await nome(debora!)}`)
    await janela.locator(`[data-agendamento="${futuro}"]`).getByRole('combobox').selectOption({ label: 'Cancelar este agendamento' })
    await janela.getByRole('button', { name: 'Desativar' }).click()
    await expect(janela).toBeHidden()
  })
  const f = (await db().from('appointments').select('status, cancellation_reason, professional_id').eq('id', futuro).single()).data!
  expect(f.status, 'o escolhido foi cancelado').toBe('CANCELLED')
  expect(f.cancellation_reason).toMatch(/desativ/i)
  const v = (await db().from('appointments').select('status, professional_id').eq('id', vencido).single()).data!
  expect(v, 'o vencido ficou com ela, como a tela disse').toEqual({ status: 'SCHEDULED', professional_id: debora!.userId })
  expect((await db().from('users').select('is_active').eq('id', debora!.userId).single()).data?.is_active).toBe(false)
})

test('A3: o cadastro da unidade pede a comissão, e o Desativar diz o que é', async ({ browser }) => {
  const email = `e2e-ea8n${marca}@bellaris.invalid`
  try {
    await como(browser, gerenteA!.estado, async p => {
      await p.goto(`/${slugA}/team`)
      await p.getByRole('button', { name: 'Adicionar membro' }).click()
      const modal = p.getByRole('dialog', { name: 'Novo membro' })
      await modal.getByLabel('Nome completo').fill(`${PREFIXO} Nova ea8${marca}`)
      await modal.getByLabel('E-mail').fill(email)
      await modal.getByLabel('Cargo').selectOption({ index: 1 })
      await modal.getByRole('checkbox', { name: nomeA }).check()
      await modal.getByLabel('Comissão padrão (%)').fill('30')
      await modal.getByLabel('Senha temporária').fill('senha-forte-123')
      await modal.getByRole('button', { name: 'Criar membro' }).click()
      await expect(modal).toBeHidden()
    })
    const novo = (await db().from('users').select('id, atende_em').eq('email', email).single<{ id: string; atende_em: string[] }>()).data!
    expect(novo.atende_em).toEqual([rede!.branchId])
    const { data: regra } = await db().from('commission_rules').select('type, value').eq('professional_id', novo.id).is('procedure_id', null).single()
    expect(regra).toEqual({ type: 'PERCENTAGE', value: 30 })
    await como(browser, dona!.estado, async p => {
      await p.goto('/admin/team')
      const linha = p.locator('tr').filter({ hasText: `${PREFIXO} Nova ea8${marca}` })
      await expect(linha.getByRole('button', { name: 'Desativar membro' }), 'o Desativar diz o que é').toHaveText(/Desativar/)
    })
  } finally {
    const { data: u } = await db().from('users').select('id, auth_id').eq('email', email).maybeSingle()
    if (u) {
      await db().from('commission_rules').delete().eq('professional_id', u.id)
      await db().from('domain_events').delete().eq('entidade_id', u.id)
      await db().from('users').delete().eq('id', u.id)
      await db().auth.admin.deleteUser(u.auth_id as string)
    }
  }
})

test('A13: o cargo novo grava a Agenda em Gerenciar "só a própria" — o clique em Gerenciar e depois o escopo', async ({ browser }) => {
  const rotulo = `${PREFIXO} Cargo ea8${marca}`
  try {
    await como(browser, dona!.estado, async p => {
      await p.goto('/admin/settings?tab=permissions')
      await p.getByRole('button', { name: 'Novo' }).click()
      await p.getByPlaceholder('Ex.: Recepção').fill(rotulo)
      await p.getByRole('button', { name: 'Criar' }).click()
      await expect(p.getByRole('heading', { name: new RegExp(`O que .*${rotulo.replace(/[[\]]/g, '\\$&')} acessa`) })).toBeVisible()
      const agenda = p.locator('[data-modulo="agenda"]')
      // Logo depois de criar, sem esperar nada: o caso da simulação.
      await agenda.getByRole('button', { name: 'Gerenciar' }).click()
      await agenda.getByRole('button', { name: 'Só a própria agenda' }).click()
      await p.getByRole('button', { name: 'Salvar acessos' }).click()
      await expect(p.getByText('Acessos salvos.')).toBeVisible()
    })
    const { data: cargo } = await db().from('tenant_roles').select('id').eq('tenant_id', rede!.tenantId).eq('label', rotulo).single<{ id: string }>()
    const { data: perm } = await db().from('role_permissions').select('level, scope').eq('role_id', cargo!.id).eq('module', 'agenda').single()
    expect(perm).toEqual({ level: 'MANAGE', scope: 'OWN' })
  } finally {
    const { data: cargo } = await db().from('tenant_roles').select('id').eq('tenant_id', rede!.tenantId).eq('label', rotulo).maybeSingle()
    if (cargo) {
      await db().from('role_report_tabs').delete().eq('role_id', cargo.id)
      await db().from('role_permissions').delete().eq('role_id', cargo.id)
      await db().from('domain_events').delete().eq('entidade_id', cargo.id)
      await db().from('tenant_roles').delete().eq('id', cargo.id)
    }
  }
})

test('A15: "Quem vendeu" traz quem atende e quem recebe primeiro — e quem não vende sai (A42 da 11ª)', async ({ browser }) => {
  // A Débora pode ter saído no A10: volta para atender.
  expect((await db().from('users').update({ is_active: true, atende_em: [rede!.branchId] }).eq('id', debora!.userId)).error).toBeNull()
  await como(browser, dona!.estado, async p => {
    await p.goto(`/${slugA}/clients/${clienteId}`)
    await p.getByRole('button', { name: 'Vender' }).first().click()
    const janela = p.getByRole('dialog', { name: 'Vender' })
    // A rede de teste não tem produto: a janela abre no Procedimento, que tem o mesmo campo.
    const grupos = janela.getByLabel('Quem vendeu').locator('optgroup')
    await expect(grupos.nth(0)).toHaveAttribute('label', 'Quem atende')
    await expect(grupos.nth(0)).toContainText(await nome(debora!))
    await expect(grupos.nth(1)).toHaveAttribute('label', 'Quem recebe')
    await expect(grupos.nth(1)).toContainText(await nome(dona!))
    // A42 da 11ª: quem não vende (a contadora, que só vê o financeiro) sai da lista — só fica quem
    // atende, recebe ou tem Vendas no cargo (era "ninguém sai", A15 da 8ª).
    await expect(janela.getByLabel('Quem vendeu').locator('option', { hasText: await nome(contadora!) })).toHaveCount(0)
  })
})
