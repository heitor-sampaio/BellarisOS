import { test, expect, type Browser, type Page, type Locator } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * O Bloco Tags do plano de adaptação (a revisão do Heitor, 2026-11-13 —
 * CLAUDE.md §1, "Tags"; a H16 em `docs/regras/crm-inbox.md`): "O sistema não
 * coloca tag nenhuma automaticamente em ninguém por nenhum motivo", e "não
 * existem tags de unidade". A cliente é da REDE.
 *
 * - T1: o agendamento não põe mais "Unidade: X" na cliente, e a "Unidade: X"
 *   que alguém gravou é uma tag como as outras (entra no vocabulário).
 *   Onde uma conta precisa de "a cliente nesta unidade", vale o FATO: a
 *   cliente atendida (agendamento não cancelado) naquela unidade — as novas
 *   clientes por unidade e o "Reativar" da unidade.
 * - CL1/CL2/CL3: a lista de Clientes não diz nem filtra a unidade, e o portal
 *   da unidade vê todas as clientes da rede.
 * - MK2: o público da campanha não tem o filtro "Unidades", e "Tags do CRM"
 *   se chama "Tags".
 * - AG2: o "Agendar" do card escolhe a unidade numa caixa simples — a tag não
 *   escolhe nada —, e com uma unidade só a caixa não aparece.
 */

test.setTimeout(180_000)

const marca = Date.now().toString(36)
const db = () => banco()
const nome = (r: string) => `${PREFIXO} ${r} ${marca}`
const DIA_ANTIGO = '2021-05-10'

let rede: OutraRede
let unica: OutraRede
let unidadeA = { id: '', slug: '', name: '' }
let unidadeB = { id: '', slug: '', name: '' }
let gestao: MembroDeTeste
let recepcaoA: MembroDeTeste
let comercialUnica: MembroDeTeste
let etapaNovo = ''
let etapaNovoUnica = ''

async function como(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado, viewport: { width: 1440, height: 900 } })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

/** A caixa da unidade da janela de agendar: o select do rótulo "Unidade". */
const caixaDaUnidade = (janela: Locator) =>
  janela.locator('label').filter({ has: janela.page().getByText('Unidade', { exact: true }) }).locator('select')

async function cliente(rotulo: string, campos: Record<string, unknown> = {}, r: OutraRede = rede): Promise<string> {
  const { data, error } = await db().from('clients').insert({
    tenant_id: r.tenantId, branch_id: r.branchId, name: nome(rotulo),
    phone: '5548' + String(Date.now() + Math.floor(Math.random() * 1e6)).slice(-9), ...campos,
  }).select('id').single<{ id: string }>()
  expect(error, `criar ${rotulo}`).toBeNull()
  return data!.id
}

async function agendamento(clientId: string, branchId: string, status: string, quando: string) {
  const { error } = await db().from('appointments').insert({
    branch_id: branchId, client_id: clientId, procedure_id: rede.procedureId, professional_id: rede.professionalId,
    status, source: 'INTERNAL', duration_min: 30, price: 0, scheduled_at: quando,
  })
  expect(error, 'criar o agendamento').toBeNull()
}

async function funil(r: OutraRede): Promise<string> {
  const { data: f, error } = await db().from('crm_funnels').insert({ tenant_id: r.tenantId, name: 'Vendas', is_default: true, position: 0 }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  const etapas = [['Novo', 'OPEN'], ['Fechado', 'WON'], ['Perdido', 'LOST']] as const
  let novo = ''
  for (const [i, [n, o]] of etapas.entries()) {
    const { data } = await db().from('crm_stages').insert({ tenant_id: r.tenantId, funnel_id: f!.id, name: n, color: '#c34d6b', position: i, outcome: o }).select('id').single<{ id: string }>()
    if (i === 0) novo = data!.id
  }
  return novo
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`tsu${marca}`)
  unica = await criarOutraRede(`tsx${marca}`)
  for (const r of [rede, unica]) {
    expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', r.tenantId)).error).toBeNull()
  }
  unidadeA = (await db().from('branches').select('id, slug, name').eq('id', rede.branchId).single<typeof unidadeA>()).data!
  const { data: b, error: eB } = await db().from('branches')
    .insert({ tenant_id: rede.tenantId, name: nome('Unidade B'), slug: `e2e-tsub-${marca}` })
    .select('id, slug, name').single<typeof unidadeB>()
  expect(eB).toBeNull()
  unidadeB = b!
  // A profissional atende nas duas (é o que o Agendar oferece).
  expect((await db().from('users').update({ atende_em: [unidadeA.id, unidadeB.id], provides_services: true }).eq('id', rede.professionalId)).error).toBeNull()
  expect((await db().from('users').update({ atende_em: [unica.branchId], provides_services: true }).eq('id', unica.professionalId)).error).toBeNull()
  etapaNovo = await funil(rede)
  etapaNovoUnica = await funil(unica)
  // As clientes das listas (CL1–CL3) nascem ANTES de qualquer tela abrir: a
  // lista é cacheada por rede, e o insert direto no banco não a expira.
  // Cadastradas na B, nunca vieram à A, sem tag nenhuma.
  await cliente('Bianca da B', { branch_id: unidadeB.id })
  await cliente('Camila da B', { branch_id: unidadeB.id })

  gestao = await criarMembro(`tsug${marca}`, {
    tenant: rede.tenantId, rotulo: 'Gestão',
    permissoes: [
      { modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'crm', nivel: 'MANAGE', escopo: 'ALL' },
      { modulo: 'agenda', nivel: 'MANAGE', escopo: 'ALL' }, { modulo: 'marketing', nivel: 'MANAGE' },
    ],
  })
  recepcaoA = await criarMembro(`tsur${marca}`, {
    tenant: rede.tenantId, branchId: unidadeA.id, rotulo: 'Recepção',
    permissoes: [{ modulo: 'clients', nivel: 'VIEW' }, { modulo: 'agenda', nivel: 'MANAGE', escopo: 'ALL' }],
  })
  comercialUnica = await criarMembro(`tsuc${marca}`, {
    tenant: unica.tenantId, rotulo: 'Comercial',
    permissoes: [{ modulo: 'crm', nivel: 'MANAGE', escopo: 'ALL' }, { modulo: 'clients', nivel: 'VIEW' }, { modulo: 'agenda', nivel: 'MANAGE', escopo: 'ALL' }],
  })
})

test.afterAll(async () => {
  for (const r of [rede, unica]) {
    if (!r) continue
    const { data } = await db().from('leads').select('id').eq('tenant_id', r.tenantId)
    const ids = (data ?? []).map(l => l.id as string)
    if (ids.length) { await db().from('lead_events').delete().in('lead_id', ids); await db().from('leads').delete().in('id', ids) }
  }
  await gestao?.limpar(); await recepcaoA?.limpar(); await comercialUnica?.limpar()
  await rede?.limpar(); await unica?.limpar()
})

test('T1: o agendamento não põe tag na cliente, e a "Unidade: X" gravada é uma tag comum', async () => {
  const helena = await cliente('Helena')
  await agendamento(helena, unidadeB.id, 'SCHEDULED', new Date(Date.now() + 3 * 86_400_000).toISOString())
  const { data } = await db().from('clients').select('tags').eq('id', helena).single<{ tags: string[] | null }>()
  expect(data!.tags ?? [], 'o sistema não põe tag nenhuma').toEqual([])

  const livre = `Unidade: livre ${marca}`
  expect((await db().from('clients').update({ tags: [livre] }).eq('id', helena)).error).toBeNull()
  const { data: vocab } = await db().from('tags').select('nome').eq('tenant_id', rede.tenantId).eq('nome', livre)
  expect(vocab ?? [], 'entra no vocabulário como qualquer outra').toHaveLength(1)
})

test('CL3: o portal da unidade vê todas as clientes da rede, sem a busca "fora da unidade"', async ({ browser }) => {
  await como(browser, recepcaoA, async p => {
    await p.goto(`/${unidadeA.slug}/clients`)
    const lista = p.locator('.clients-master-list')
    await expect(lista).toContainText(nome('Bianca da B'))
    await lista.getByPlaceholder('Buscar por nome ou telefone…').fill('Bianca da B')
    await expect(lista).toContainText(nome('Bianca da B'))
    await expect(p.locator('[data-da-clinica-fora-da-unidade]')).toHaveCount(0)
  })
})

test('CL1/CL2: a lista da rede não diz nem filtra a unidade', async ({ browser }) => {
  await como(browser, gestao, async p => {
    await p.goto('/admin/clients')
    const lista = p.locator('.clients-master-list')
    const linha = lista.getByRole('button', { name: new RegExp(nome('Camila da B').replace(/[[\]]/g, '\\$&')) })
    await expect(linha).toBeVisible()
    await expect(linha, 'CL1: a cliente é da rede').not.toContainText(unidadeB.name)
    await expect(lista.getByRole('button', { name: 'Unidade', exact: true }), 'CL2: sem o filtro de unidade').toHaveCount(0)
    await p.goto(`/admin/clients?unidade=${unidadeB.slug}`)
    await expect(p.locator('[data-contador-de-clientes]'), 'CL2: o contador é o da rede').not.toContainText(' na ')
  })
})

test('T1/A26: as novas clientes de uma unidade são as atendidas nela, não as da tag', async () => {
  const desde = { cliente_desde: DIA_ANTIGO }
  // A tag diz A, mas ela só foi atendida na B.
  const carla = await cliente('Carla tag A', { ...desde, tags: [`Unidade: ${unidadeA.name}`] })
  await agendamento(carla, unidadeB.id, 'SCHEDULED', new Date(Date.now() + 5 * 86_400_000).toISOString())
  // Na A, só um agendamento CANCELADO: não foi atendida.
  const dora = await cliente('Dora cancelou', desde)
  await agendamento(dora, unidadeA.id, 'CANCELLED', new Date(Date.now() + 6 * 86_400_000).toISOString())
  // Atendida na A.
  const eva = await cliente('Eva da A', desde)
  await agendamento(eva, unidadeA.id, 'COMPLETED', '2021-06-01T13:00:00Z')

  const de = '2021-05-10T03:00:00.000Z', ate = '2021-05-11T02:59:59.999Z'
  const { data, error } = await db().rpc('metrics_by_branch', { p_tenant: rede.tenantId, p_from: de, p_to: ate })
  expect(error).toBeNull()
  const novas = (id: string) => Number((data as { branch_id: string; new_clients: number }[]).find(r => r.branch_id === id)?.new_clients)
  expect(novas(unidadeA.id), 'na A: a Eva').toBe(1)
  expect(novas(unidadeB.id), 'na B: a Carla').toBe(1)

  for (const [ids, esperado] of [[[unidadeA.id], 1], [[unidadeB.id], 1], [null, 3]] as const) {
    const core = await db().rpc('metrics_core', { p_tenant: rede.tenantId, p_branch_ids: ids, p_from: de, p_to: ate })
    expect(core.error).toBeNull()
    expect(Number((core.data as { new_clients: number }[])[0]!.new_clients), `metrics_core ${JSON.stringify(ids)}`).toBe(esperado)
    const serie = await db().rpc('metrics_new_clients_series', { p_tenant: rede.tenantId, p_branch_ids: ids, p_from: de, p_to: ate, p_granularity: 'day' })
    expect(serie.error).toBeNull()
    expect((serie.data as { count: number }[]).reduce((s, r) => s + Number(r.count), 0), `série ${JSON.stringify(ids)}`).toBe(esperado)
  }
})

test('T1: o "Reativar" da unidade é de quem foi atendida nela, não de quem tem a tag', async () => {
  const fabi = await cliente('Fabi só a tag', { cliente_desde: '2021-04-10', tags: [`Unidade: ${unidadeA.name}`] })
  const gil = await cliente('Gil veio na A', { cliente_desde: '2021-04-10' })
  await agendamento(gil, unidadeA.id, 'COMPLETED', '2021-06-02T13:00:00Z')
  const { data, error } = await db().rpc('metrics_clientes_para_reativar', {
    p_tenant: rede.tenantId, p_branch_id: unidadeA.id, p_desde: new Date(Date.now() - 90 * 86_400_000).toISOString(), p_limite: 200,
  })
  expect(error).toBeNull()
  const ids = (data as { lista: { id: string }[] }).lista.map(x => x.id)
  expect(ids).toContain(gil)
  expect(ids, 'a tag não faz ninguém ser da unidade').not.toContain(fabi)
})

test('MK2: o público da campanha não tem "Unidades", e as tags se chamam "Tags"', async ({ browser }) => {
  await como(browser, gestao, async p => {
    await p.goto('/admin/notificacoes/nova')
    await p.getByRole('button', { name: /Próximo/ }).click()
    await p.getByPlaceholder('ex: Aniversariantes de julho').fill(nome('Campanha'))
    await p.getByPlaceholder(/ex: Feliz aniversário/).fill('Oi')
    await p.getByPlaceholder(/ex: Como presente/).fill('Mensagem')
    await p.getByRole('button', { name: /Próximo/ }).click()
    await expect(p.getByText('Gênero', { exact: true })).toBeVisible()
    await expect(p.getByText('Tags', { exact: true })).toBeVisible()
    await expect(p.getByText('Tags do CRM')).toHaveCount(0)
    await expect(p.getByText('Unidades', { exact: true })).toHaveCount(0)
    await expect(p.getByText('Nenhuma selecionada = todas as unidades')).toHaveCount(0)
  })
})

test('AG2: o Agendar do card escolhe a unidade numa caixa simples — a tag não escolhe', async ({ browser }) => {
  const { data: l, error } = await db().from('leads').insert({
    tenant_id: rede.tenantId, name: nome('Lia tag B'), phone: '5548' + String(Date.now()).slice(-9),
    crm_stage_id: etapaNovo, tags: [`Unidade: ${unidadeB.name}`],
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  await como(browser, gestao, async p => {
    await p.goto(`/admin/oportunidades?lead=${l!.id}`)
    const card = p.getByRole('dialog').filter({ hasText: 'Editar oportunidade' })
    await card.getByRole('button', { name: 'Agendar', exact: true }).click()
    const janela = p.getByRole('dialog').filter({ hasText: 'Novo agendamento' })
    await expect(janela).toBeVisible()
    await expect(caixaDaUnidade(janela), 'nasce sem unidade: quem agenda escolhe').toHaveValue('')
    await caixaDaUnidade(janela).selectOption(unidadeB.id)
    await expect(caixaDaUnidade(janela)).toHaveValue(unidadeB.id)
  })
})

test('AG2: com uma unidade só, a caixa da unidade não aparece', async ({ browser }) => {
  const { data: l, error } = await db().from('leads').insert({
    tenant_id: unica.tenantId, name: nome('Lia única'), phone: '5548' + String(Date.now()).slice(-9), crm_stage_id: etapaNovoUnica,
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  await como(browser, comercialUnica, async p => {
    await p.goto(`/admin/oportunidades?lead=${l!.id}`)
    const card = p.getByRole('dialog').filter({ hasText: 'Editar oportunidade' })
    await card.getByRole('button', { name: 'Agendar', exact: true }).click()
    const janela = p.getByRole('dialog').filter({ hasText: 'Novo agendamento' })
    await expect(janela).toBeVisible()
    await expect(janela.getByLabel('Procedimento')).toBeVisible()
    await expect(caixaDaUnidade(janela)).toHaveCount(0)
  })
})
