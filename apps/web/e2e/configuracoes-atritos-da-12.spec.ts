import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcaoComFormulario } from './apoio/acao-direta'

/**
 * Os atritos de setup e configuração da 12ª simulação (2026-11-10/11, a Helena
 * da Margarida e a Cláudia da Acácia), numa rede [e2e] própria:
 *
 * - A2: no cargo novo, os alcances vinham pré-marcados ("Só a própria
 *   agenda", "Só as próprias comissões") com o módulo em "Sem acesso", e o
 *   Relatórios ligado vinha sem nenhuma aba — a Contadora foi salva assim por
 *   engano e só "veria Minhas comissões". Princípio 3: o alcance nasce SEM
 *   escolha (pede ao ligar o módulo; com o módulo em "Sem acesso" ele some), e
 *   o Relatórios em "Ver" pede as abas.
 * - A3: o modelo Recepcionista não via as próprias comissões, e a recepção
 *   que vende é o caso comum. Princípio 1: o MODELO da rede nova traz o
 *   Financeiro em "Ver, só as próprias" (cargos já gravados não mudam).
 */

test.setTimeout(180_000)

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede
let dona: MembroDeTeste

async function como(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado, viewport: { width: 1440, height: 900 } })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`cfg12${marca}`)
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  dona = await criarMembro(`cfg12d${marca}`, { tenant: rede.tenantId, donoDaRede: true, rotulo: 'Dona', permissoes: [] })
})

test.afterAll(async () => {
  await dona?.limpar()
  await rede?.limpar()
})

test('A2: o alcance do cargo novo nasce sem escolha, some sem o módulo, e o Relatórios em "Ver" pede as abas', async ({ browser }) => {
  const rotulo = `${PREFIXO} Contadora ${marca}`
  await como(browser, dona, async p => {
    await p.goto('/admin/settings?tab=permissions')
    await p.getByRole('button', { name: 'Novo' }).click()
    await p.getByPlaceholder('Ex.: Recepção').fill(rotulo)
    await p.getByRole('button', { name: 'Criar' }).click()
    await expect(p.getByRole('heading', { name: /O que .* acessa/ })).toContainText(rotulo)

    const financeiro = p.locator('[data-modulo="financial"]')
    // Sem acesso: o alcance não aparece (nem esmaecido, nem pré-marcado).
    await expect(financeiro.getByRole('button', { name: 'Só as próprias comissões' })).toHaveCount(0)
    await expect(financeiro.getByRole('button', { name: 'Financeiro completo' })).toHaveCount(0)

    // Ligado: o alcance aparece, sem nenhum dos dois marcado, e pede a escolha.
    await financeiro.getByRole('button', { name: 'Ver', exact: true }).click()
    await expect(financeiro.getByRole('button', { name: 'Só as próprias comissões' })).toHaveAttribute('aria-pressed', 'false')
    await expect(financeiro.getByRole('button', { name: 'Financeiro completo' })).toHaveAttribute('aria-pressed', 'false')
    await expect(financeiro.locator('[data-alcance-sem-escolha]')).toBeVisible()

    const relatorios = p.locator('[data-modulo="reports"]')
    await relatorios.getByRole('button', { name: 'Ver', exact: true }).click()

    // Salvar sem escolher: a tela pede, e nada é gravado.
    await p.getByRole('button', { name: 'Salvar acessos' }).click()
    const pedido = p.locator('[data-falta-escolher]')
    await expect(pedido).toContainText('Financeiro e comissões')
    await expect(pedido).toContainText('Relatórios')
    await expect(pedido).toContainText(/relatório/i)
    await expect(p.getByText('Acessos salvos.')).toHaveCount(0)

    await financeiro.getByRole('button', { name: 'Financeiro completo' }).click()
    await relatorios.getByRole('button', { name: /^A (rede inteira|clínica toda)$/ }).click()
    await relatorios.getByRole('button', { name: 'Financeiro', exact: true }).click()
    await p.getByRole('button', { name: 'Salvar acessos' }).click()
    await expect(p.getByText('Acessos salvos.')).toBeVisible()
  })
  const { data: cargo } = await db().from('tenant_roles').select('id').eq('tenant_id', rede.tenantId).eq('label', rotulo).single<{ id: string }>()
  const { data: fin } = await db().from('role_permissions').select('level, scope').eq('role_id', cargo!.id).eq('module', 'financial').single()
  expect(fin, 'o que a dona escolheu, não um padrão escondido').toEqual({ level: 'VIEW', scope: 'ALL' })
  const { data: abas } = await db().from('role_report_tabs').select('tab').eq('role_id', cargo!.id)
  expect((abas ?? []).length, 'o Relatórios foi salvo com a aba marcada').toBeGreaterThan(0)
})

test('A2: a action recusa o módulo ligado sem o alcance escolhido', async ({ browser }) => {
  const { data: cargo, error } = await db().from('tenant_roles')
    .insert({ tenant_id: rede.tenantId, key: `CFG12_${marca}`.toUpperCase(), label: `Cargo cfg12 ${marca}`, is_system: false })
    .select('id').single<{ id: string }>()
  expect(error).toBeNull()
  await como(browser, dona, async p => {
    await p.goto('/admin/settings?tab=permissions')
    const r = await chamarAcaoComFormulario(p, 'actions/permissions.ts', 'saveRolePermissions',
      '/admin/settings?tab=permissions', [undefined], { roleId: cargo!.id, 'level:agenda': 'MANAGE' })
    expect(r.texto, 'chegou à action').not.toContain('Server action not found')
    expect(r.texto).toContain('Escolha o que o cargo enxerga')
  })
  const { data: linhas } = await db().from('role_permissions').select('module').eq('role_id', cargo!.id)
  expect(linhas ?? [], 'nada gravado').toEqual([])
})

test('A3: o modelo Recepcionista da rede nova vê as próprias comissões (Financeiro em Ver, só as próprias)', async () => {
  const { data: cargo } = await db().from('tenant_roles').select('id')
    .eq('tenant_id', rede.tenantId).eq('key', 'RECEPTIONIST').single<{ id: string }>()
  expect(cargo, 'o modelo Recepcionista da rede nova').not.toBeNull()
  const { data, error } = await db().from('role_permissions').select('level, scope')
    .eq('role_id', cargo!.id).eq('module', 'financial').maybeSingle<{ level: string; scope: string }>()
  expect(error).toBeNull()
  expect(data).toEqual({ level: 'VIEW', scope: 'OWN' })
})
