import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * Atritos de configuração vistos na simulação de um dia de clínica (2026-10-20):
 * - a matriz de Cargos oferecia o Copilot a uma rede que não o tem no plano
 *   (o Copilot é a única função que "sem plano" NÃO libera);
 * - a SDR e a recepção, que só mexem em Tags e Importações, liam
 *   "Cargos, modelos de ficha e integrações" no topo das Configurações;
 * - liberar o prontuário na LGPD era um clique só, e nada fora da aba avisava
 *   que havia pedido esperando;
 * - a unidade nova pedia "Slug (URL)"; o pacote novo nascia com 5 sessões.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let dona: MembroDeTeste | null = null
let sdr: MembroDeTeste | null = null
let slug = ''
let pedido = ''

async function como(browser: Browser, quem: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: quem.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`pc${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  dona = await criarMembro(`pcd${marca}`, {
    tenant: rede.tenantId, rotulo: 'Dona',
    permissoes: [{ modulo: 'roles', nivel: 'MANAGE' }, { modulo: 'settings', nivel: 'MANAGE' }, { modulo: 'medical_records', nivel: 'MANAGE' }, { modulo: 'procedures', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'VIEW' }],
  })
  sdr = await criarMembro(`pcs${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'SDR', permissoes: [{ modulo: 'crm', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'MANAGE' }],
  })
  const cliente = await rede.criarCliente('LGPD')
  const { data, error } = await db().from('lgpd_requests').insert({
    tenant_id: rede.tenantId, client_id: cliente, type: 'export', status: 'completed', include_medical: true, medical_status: 'pending',
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  pedido = data!.id
})
test.afterAll(async () => {
  if (pedido) await db().from('lgpd_requests').delete().eq('id', pedido)
  await sdr?.limpar(); await dona?.limpar(); await rede?.limpar()
})

test('a matriz de Cargos não oferece o Copilot à rede que não o tem', async ({ browser }) => {
  await como(browser, dona!, async p => {
    await p.goto('/admin/settings?tab=permissions')
    await expect(p.getByText(/Agendamentos, check-in e atendimentos/).first(), 'a matriz carregou').toBeVisible()
    await expect(p.getByText(/A secretária virtual/), 'sem a linha do Copilot').toHaveCount(0)
  })
})

// D-2 dos atritos (decisão do Heitor, 2026-10-29): Campanhas e Automações
// ficam só no portal da rede — "a automação é da clínica" —, e a tela de
// Cargos passa a dizer isso na linha dos dois módulos, ligados ou não.
test('a matriz de Cargos avisa que Marketing e Automações valem só para quem é da rede', async ({ browser }) => {
  await como(browser, dona!, async p => {
    await p.goto('/admin/settings?tab=permissions')
    await expect(p.getByText(/Agendamentos, check-in e atendimentos/).first(), 'a matriz carregou').toBeVisible()
    for (const modulo of ['marketing', 'automations']) {
      await expect(p.locator(`[data-modulo="${modulo}"]`).first(), modulo).toContainText(/só para quem é da rede/)
    }
    // Controle: um módulo da unidade não leva o aviso.
    await expect(p.locator('[data-modulo="agenda"]').first()).not.toContainText(/só para quem é da rede/)
  })
})

test('o topo das Configurações diz o que a pessoa vê, não "cargos e integrações"', async ({ browser }) => {
  await como(browser, sdr!, async p => {
    await p.goto(`/${slug}/settings`)
    await expect(p.getByRole('heading', { name: 'Configurações' })).toBeVisible()
    await expect(p.getByText(/Cargos, modelos de ficha e integrações/)).toHaveCount(0)
    // No topo da tela (o subtítulo do título): desde o J-16 o item do menu também
    // se chama "Tags e importações", e o texto solto acha os dois.
    await expect(p.getByRole('main').getByText(/Tags e importações/)).toBeVisible()
  })
})

test('LGPD: a aba conta o pedido esperando, e liberar o prontuário pede confirmação', async ({ browser }) => {
  await como(browser, dona!, async p => {
    await p.goto('/admin/settings?tab=unidades')
    await expect(p.getByRole('link', { name: 'LGPD (1)' })).toBeVisible()
    await p.goto('/admin/settings?tab=lgpd')
    await expect(async () => {
      await p.getByRole('button', { name: 'Liberar' }).click({ timeout: 1000 })
      await expect(p.getByText(/vai para a cliente/)).toBeVisible({ timeout: 1000 })
    }).toPass()
    expect((await db().from('lgpd_requests').select('medical_status').eq('id', pedido).single()).data?.medical_status, 'um clique só não libera').toBe('pending')
    await expect(p.getByRole('button', { name: 'Confirmar liberação' })).toBeVisible()
  })
})

test('a unidade nova pede o "Endereço da unidade"; o pacote novo não nasce com 5 sessões', async ({ browser }) => {
  await como(browser, dona!, async p => {
    await p.goto('/admin/settings?tab=unidades')
    await expect(async () => {
      await p.getByRole('button', { name: 'Nova unidade' }).first().click({ timeout: 1000 })
      await expect(p.getByRole('dialog', { name: 'Nova unidade' })).toBeVisible({ timeout: 1000 })
    }).toPass()
    const janela = p.getByRole('dialog', { name: 'Nova unidade' })
    await expect(janela.getByText('Slug (URL)')).toHaveCount(0)
    await expect(janela.getByText('Endereço da unidade').first()).toBeVisible()
    await p.goto('/admin/pacotes')
    await expect(async () => {
      await p.getByRole('button', { name: 'Novo pacote' }).first().click({ timeout: 1000 })
      await expect(p.getByLabel('Sessões do procedimento 1')).toBeVisible({ timeout: 1000 })
    }).toPass()
    await expect(p.getByLabel('Sessões do procedimento 1'), 'sem número escolhido por nós').toHaveValue('')
  })
})
