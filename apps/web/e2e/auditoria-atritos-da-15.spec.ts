import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * A Auditoria na 15ª simulação (2026-11-15), numa rede própria. NADA deixa de
 * ser gravado; muda a LEITURA (princípios 7 e 3):
 *
 * - A27: as linhas de UMA gravação viram uma linha só, com as outras
 *   guardadas nela ("e mais N"): 19 "Criou a permissão do cargo" enchiam a
 *   lista a cada cargo salvo.
 * - A28: a frase lê o fato ("Desativou Téo Barros", não "Editou o membro da
 *   equipe (ativo)").
 *
 * Desde 2026-11-16 a Auditoria é só da Admin da rede ("Auditoria é só
 * admin"): o filtro "Abriu o prontuário" não sai de ninguém — a Admin vê
 * tudo, também no portal de uma unidade. A Auditoria saiu da matriz de
 * Cargos: o cargo salvo tem 18 permissões.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede
let dona: MembroDeTeste
let alvo: MembroDeTeste
const CARGO = `${PREFIXO} Balcão ${marca}`

async function como(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado, viewport: { width: 1440, height: 900 } })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

const MODULOS = ['agenda', 'clients', 'loyalty', 'medical_records', 'documents', 'procedures', 'stock', 'financial', 'cashier',
  'crm', 'marketing', 'reports', 'team', 'forms', 'roles', 'settings', 'automations', 'copilot']

test.beforeAll(async () => {
  rede = await criarOutraRede(`aud15${marca}`)
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  dona = await criarMembro(`aud15d${marca}`, { tenant: rede.tenantId, donoDaRede: true, rotulo: 'Dona', permissoes: [] })
  alvo = await criarMembro(`aud15a${marca}`, { tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Alvo', permissoes: [] })
})

test.afterAll(async () => {
  for (const m of [dona, alvo]) await m?.limpar()
  await rede?.limpar()
})

test('A27: as 18 permissões salvas numa gravação são uma linha, com as outras guardadas nela', async ({ browser }) => {
  const { data: cargo, error } = await db().from('tenant_roles')
    .insert({ tenant_id: rede.tenantId, key: `E2E_${marca.toUpperCase()}`, label: CARGO }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  // Um comando só, como o "Salvar acessos": uma gravação, 18 linhas na auditoria.
  expect((await db().from('role_permissions').insert(MODULOS.map(module => ({
    tenant_id: rede.tenantId, role_id: cargo!.id, module, level: 'NONE', scope: 'ALL',
  })))).error).toBeNull()
  const { count } = await db().from('auditoria').select('id', { count: 'exact', head: true })
    .eq('tenant_id', rede.tenantId).eq('tabela', 'role_permissions')
  expect(count, 'nada deixa de ser gravado').toBeGreaterThanOrEqual(18)

  await como(browser, dona, async p => {
    await p.goto('/admin/auditoria')
    // R39, o Heitor, 27/11: "'Mudou os acessos do cargo X (N permissões)' (a proposta)".
    const linha = p.locator('[data-linha-da-auditoria]', { hasText: `Mudou os acessos do cargo ${CARGO} (18 permissões)` })
    await expect(linha).toHaveCount(1)
    // Nenhuma outra frase fala deste cargo: as 18, uma a uma, ficam guardadas na linha, fechadas.
    await expect(p.locator('[data-frase-da-auditoria]', { hasText: `do cargo ${CARGO}` })).toHaveCount(1)
    // As 18, uma a uma, guardadas na linha.
    await linha.getByText(/e mais 17|Ver as 18/).click()
    await expect(linha.locator('[data-detalhe-da-auditoria]')).toHaveCount(18)
  })
})

test('A28: desativar diz o fato; o filtro "Abriu o prontuário" está nos dois portais (a Auditoria é só da Admin)', async ({ browser }) => {
  const nome = (await db().from('users').select('name').eq('id', alvo.userId).single<{ name: string }>()).data!.name
  expect((await db().from('users').update({ is_active: false }).eq('id', alvo.userId)).error).toBeNull()

  await como(browser, dona, async p => {
    await p.goto('/admin/auditoria')
    await expect(p.locator('[data-linha-da-auditoria]', { hasText: `Desativou ${nome}` })).toHaveCount(1)
    await expect(p.getByLabel('O que foi feito').locator('option', { hasText: 'Abriu o prontuário' })).toHaveCount(1)
  })
  const slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  // Era: quem tem unidades não via o filtro. A regra mudou em 2026-11-16: só a Admin lê, e vê tudo.
  await como(browser, dona, async p => {
    await p.goto(`/${slug}/auditoria`)
    await expect(p.locator('[data-linha-da-auditoria]', { hasText: `Desativou ${nome}` })).toHaveCount(1)
    await expect(p.getByLabel('O que foi feito').locator('option', { hasText: 'Abriu o prontuário' })).toHaveCount(1)
  })
})
