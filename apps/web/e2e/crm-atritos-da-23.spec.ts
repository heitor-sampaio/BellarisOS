import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * Os atritos do CRM e do comercial na 23ª simulação (2026-11-17), numa rede
 * [e2e] própria com o "Funil de vendas" padrão VAZIO e as oportunidades no
 * "Corporal":
 *
 * - A6 (princípio 3): o funil criado nascia com Novo, Em andamento, Ganho e
 *   Perdido sem dizer que eram as etapas iniciais.
 * - A28 (princípio 3): o quadro e a aba Comercial abriam no padrão vazio.
 * - A34 (princípio 7): o funil escolhido não ficava — voltar pelo menu abria
 *   no padrão.
 * - A29 (princípio 4): "Comparecimento 0,0%" contava o agendamento de amanhã.
 */

test.setTimeout(180_000)

const marca = Date.now().toString(36)
const db = () => banco()
const nome = (r: string) => `${PREFIXO} ${r} ${marca}`
let rede: OutraRede
let dona: MembroDeTeste
let corporalNovo = ''
let facialNovo = ''

async function como(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado, viewport: { width: 1440, height: 900 } })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

async function lead(rotulo: string, etapa: string): Promise<string> {
  const { data, error } = await db().from('leads').insert({
    tenant_id: rede.tenantId, name: nome(rotulo), crm_stage_id: etapa,
    phone: `5548${String(Date.now()).slice(-4)}${String(Math.floor(Math.random() * 1e5)).padStart(5, '0')}`,
  }).select('id').single<{ id: string }>()
  expect(error, `criar a oportunidade ${rotulo}`).toBeNull()
  return data!.id
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`cr23a${marca}`)
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  dona = await criarMembro(`cr23d${marca}`, { tenant: rede.tenantId, donoDaRede: true, permissoes: [] })
  const funil = async (n: string, padrao: boolean, posicao: number) =>
    (await db().from('crm_funnels').insert({ tenant_id: rede.tenantId, name: n, is_default: padrao, position: posicao }).select('id').single<{ id: string }>()).data!.id
  const etapa = async (funilId: string, n: string, outcome: string, posicao: number) =>
    (await db().from('crm_stages').insert({ tenant_id: rede.tenantId, funnel_id: funilId, name: n, color: '#c34d6b', position: posicao, outcome }).select('id').single<{ id: string }>()).data!.id
  const vendas = await funil('Funil de vendas', true, 0)
  const corporal = await funil('Corporal', false, 1)
  const facial = await funil('Facial', false, 2)
  await etapa(vendas, 'Novo contato', 'OPEN', 0)
  await etapa(vendas, 'Fechado', 'WON', 1)
  corporalNovo = await etapa(corporal, 'Interessada', 'OPEN', 0)
  await etapa(corporal, 'Fechou', 'WON', 1)
  facialNovo = await etapa(facial, 'Quer avaliar', 'OPEN', 0)
  await lead('Corporal 1', corporalNovo)
  await lead('Corporal 2', corporalNovo)
})

test.afterAll(async () => {
  await dona?.limpar()
  await rede?.limpar()
})

test('A28: o quadro e a aba Comercial abrem no funil que tem oportunidade, não no padrão vazio', async ({ browser }) => {
  await como(browser, dona, async p => {
    await p.goto('/admin/oportunidades')
    await expect(p.getByText(nome('Corporal 1')).filter({ visible: true }).first()).toBeVisible()
    await p.goto('/admin/reports?period=month&tab=comercial')
    await expect(p.locator('.seg-desktop').getByRole('button', { name: 'Corporal', exact: true })).toHaveAttribute('aria-pressed', 'true')
  })
})

test('A34: o funil escolhido no seletor fica ao voltar pelo menu', async ({ browser }) => {
  const id = await lead('Facial 1', facialNovo)
  await como(browser, dona, async p => {
    await p.goto('/admin/oportunidades')
    await p.locator('.seg-desktop').getByRole('button', { name: 'Facial', exact: true }).click()
    await expect(p.locator(`[data-lead-id="${id}"]`)).toBeVisible()
    await p.goto('/admin/dashboard')
    await p.goto('/admin/oportunidades')
    await expect(p.locator(`[data-lead-id="${id}"]`)).toBeVisible()
    await expect(p.getByText(nome('Corporal 1'))).toHaveCount(0)
  })
})

test('A6: o funil criado diz que as etapas são as iniciais', async ({ browser }) => {
  const nomeDoFunil = `Noivas ${marca}`
  await como(browser, dona, async p => {
    await p.goto('/admin/oportunidades?configurar=funis')
    const janela = p.getByRole('dialog')
    await janela.getByPlaceholder('Nome do funil').fill(nomeDoFunil)
    await janela.getByRole('button', { name: 'Criar', exact: true }).click()
    await expect(janela.getByText(`ETAPAS DE ${nomeDoFunil.toUpperCase()}`)).toBeVisible({ timeout: 15_000 })
    await expect(janela.locator('[data-funil-novo]')).toContainText('Funil criado com as etapas iniciais (Novo, Em andamento, Ganho e Perdido)')
  })
})

test('A29: com só o agendamento comercial de amanhã, o comparecimento é "—", não 0%', async ({ browser }) => {
  const cliente = await rede.criarCliente('Amanhã A29')
  const amanha = new Date(Date.now() + 26 * 3600_000)
  expect((await db().from('appointments').insert({
    branch_id: rede.branchId, client_id: cliente, procedure_id: rede.procedureId, professional_id: rede.professionalId,
    status: 'SCHEDULED', source: 'COMMERCIAL', duration_min: 30, price: 0, scheduled_at: amanha.toISOString(),
  })).error).toBeNull()
  const de = new Date(Date.now() - 2 * 86_400_000).toISOString()
  const ate = new Date(Date.now() + 3 * 86_400_000).toISOString()
  const { data, error } = await db().rpc('metrics_comercial', {
    p_tenant: rede.tenantId, p_branch_ids: [rede.branchId], p_from: de, p_to: ate, p_owner: null,
  })
  expect(error).toBeNull()
  const c = data as { agendados: number; considerados: number }
  expect([Number(c.agendados), Number(c.considerados)], 'o de amanhã é agendado, não considerado').toEqual([1, 0])

  // A tela: o mês, se amanhã ainda é deste mês; senão, o banco já provou.
  if (amanha.getMonth() === new Date().getMonth()) {
    await como(browser, dona, async p => {
      await p.goto('/admin/reports?period=month&tab=comercial')
      const kpi = p.getByText('Comparecimento', { exact: true }).first().locator('xpath=ancestor::div[contains(@class,"card")][1]')
      await expect(kpi).toContainText('—')
      await expect(kpi).not.toContainText('0,0%')
    })
  }
})
