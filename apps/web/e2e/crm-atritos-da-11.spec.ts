import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * Os atritos do CRM da 11ª simulação (2026-11-10, a Tatiane, comercial da
 * [sim] Clínica Violeta), numa rede [e2e] própria:
 *
 * - A1: o "Agendar" do card trazia tudo em "Selecione…" — sem o procedimento
 *   de interesse (Bioestimulador).
 * - A2: `?aba=fichas` de quem não tem o Prontuário caía calado na Visão geral.
 * - A3: o menu "…" do card só tinha ganho e perdido; mover de etapa exigia
 *   arrastar (pesado no celular) ou abrir o editor.
 * - A4: depois do plano de R$ 8.400, o card seguia com R$ 2.600 (o preço do
 *   procedimento de interesse).
 */

test.setTimeout(180_000)

const marca = Date.now().toString(36)
const db = () => banco()
const nome = (r: string) => `${PREFIXO} ${r} ${marca}`
let rede: OutraRede
let tatiane: MembroDeTeste
let bio = ''
const etapa: Record<'novo' | 'avaliacao' | 'ganho' | 'perdido', string> = { novo: '', avaliacao: '', ganho: '', perdido: '' }

async function como(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<void>, viewport = { width: 1440, height: 900 }) {
  const ctx = await browser.newContext({ storageState: m.estado, viewport })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

async function lead(rotulo: string, campos: Record<string, unknown> = {}): Promise<string> {
  const { data, error } = await db().from('leads').insert({
    tenant_id: rede.tenantId, name: nome(rotulo), phone: `5548${String(Date.now()).slice(-4)}${String(Math.floor(Math.random() * 1e5)).padStart(5, '0')}`,
    crm_stage_id: etapa.novo, ...campos,
  }).select('id').single<{ id: string }>()
  expect(error, `criar o lead ${rotulo}`).toBeNull()
  return data!.id
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`cr11a${marca}`)
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  const { data: f } = await db().from('crm_funnels').insert({ tenant_id: rede.tenantId, name: 'Vendas', is_default: true, position: 0 }).select('id').single<{ id: string }>()
  const etapas = [['novo', 'Novo', 'OPEN'], ['avaliacao', 'Avaliação', 'OPEN'], ['ganho', 'Fechado', 'WON'], ['perdido', 'Perdido', 'LOST']] as const
  for (const [i, [k, n, o]] of etapas.entries()) {
    const { data } = await db().from('crm_stages').insert({ tenant_id: rede.tenantId, funnel_id: f!.id, name: n, color: '#c34d6b', position: i, outcome: o }).select('id').single<{ id: string }>()
    etapa[k] = data!.id
  }
  const { data: p, error } = await db().from('procedures')
    .insert({ tenant_id: rede.tenantId, name: nome('Bioestimulador'), category: 'Injetáveis', duration_min: 60, price: 2600 })
    .select('id').single<{ id: string }>()
  expect(error).toBeNull()
  bio = p!.id
  // A profissional atende na unidade (é ela que o Agendar oferece).
  expect((await db().from('users').update({ atende_em: [rede.branchId], provides_services: true }).eq('id', rede.professionalId)).error).toBeNull()
  tatiane = await criarMembro(`cr11t${marca}`, {
    tenant: rede.tenantId, rotulo: 'Comercial',
    permissoes: [{ modulo: 'crm', nivel: 'MANAGE', escopo: 'ALL' }, { modulo: 'clients', nivel: 'VIEW' }, { modulo: 'agenda', nivel: 'MANAGE', escopo: 'ALL' }],
  })
})

test.afterAll(async () => {
  await tatiane?.limpar()
  await rede?.limpar()
})

test('A1: o "Agendar" do card traz o procedimento de interesse escolhido, e diz de onde ele veio', async ({ browser }) => {
  const id = await lead('Beatriz Bio')
  expect((await db().from('lead_procedures').insert({ lead_id: id, procedure_id: bio })).error).toBeNull()
  await como(browser, tatiane, async p => {
    await p.goto(`/admin/oportunidades?lead=${id}`)
    const card = p.getByRole('dialog').filter({ hasText: 'Editar lead' })
    await card.getByRole('button', { name: 'Agendar', exact: true }).click()
    const janela = p.getByRole('dialog').filter({ hasText: 'Novo agendamento' })
    await expect(janela).toBeVisible()
    await expect(janela.getByLabel('Procedimento')).toHaveValue(bio, { timeout: 15_000 })
    await expect(janela.locator('[data-procedimento-sugerido="interesse"]')).toContainText('procedimento de interesse')
  })
})

test('A2: o Prontuário pela URL, para quem não o abre, diz que o cargo não abre a aba', async ({ browser }) => {
  const cliente = await rede.criarCliente('Helena A2')
  await como(browser, tatiane, async p => {
    await p.goto(`/admin/clients/${cliente}?aba=fichas`)
    await expect(p.locator('[data-aba-sem-acesso="fichas"]')).toContainText('Seu cargo não abre a aba Prontuário')
    await expect(p.getByRole('tab', { name: 'Visão geral' })).toHaveAttribute('aria-selected', 'true')
  })
})

test('A3: o menu "…" do card move para outra etapa aberta, no celular, sem arrastar', async ({ browser }) => {
  const id = await lead('Larissa Etapa')
  await como(browser, tatiane, async p => {
    await p.goto('/admin/oportunidades')
    await p.locator(`[data-lead-id="${id}"]`).getByTitle('Ações do lead').click()
    const grupo = p.getByRole('group', { name: 'Mover para a etapa' })
    await expect(grupo.getByRole('menuitem')).toHaveText(['Avaliação'])
    await grupo.getByRole('menuitem', { name: 'Avaliação' }).click()
  }, { width: 412, height: 900 })
  await expect.poll(async () => (await db().from('leads').select('crm_stage_id').eq('id', id).single<{ crm_stage_id: string }>()).data?.crm_stage_id)
    .toBe(etapa.avaliacao)
})

test('A4: a cliente comprou um plano depois do lead — o card diz o VENDIDO, não o preço do interesse', async ({ browser }) => {
  const cliente = await rede.criarCliente('Beatriz Plano')
  const umMinutoAtras = new Date(Date.now() - 60_000).toISOString()
  const id = await lead('Beatriz Plano', { client_id: cliente, created_at: umMinutoAtras })
  expect((await db().from('lead_procedures').insert({ lead_id: id, procedure_id: bio })).error).toBeNull()
  const { data: plano, error } = await db().from('treatment_plans').insert({
    branch_id: rede.branchId, professional_id: rede.professionalId, client_id: cliente, status: 'ACCEPTED',
    name: nome('Plano Bio'), aceito_em: new Date().toISOString(),
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  for (const preco of [4200, 4200]) {
    const { data: s } = await db().from('treatment_plan_sessions').insert({ plan_id: plano!.id, sort_order: 0 }).select('id').single<{ id: string }>()
    expect((await db().from('treatment_plan_session_procedures').insert({ session_id: s!.id, procedure_id: bio, price: preco })).error).toBeNull()
  }
  await como(browser, tatiane, async p => {
    await p.goto('/admin/oportunidades')
    const sugestao = p.locator('[data-sugere-ganho]').filter({ hasText: 'Plano' })
    await expect(sugestao).toBeVisible()
    const card = p.locator('[data-valor-vendido]')
    await expect(card).toContainText('R$ 8.400,00')
    await expect(card).toContainText('vendido')
  })
})
