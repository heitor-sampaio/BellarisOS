import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * Bloco Configurações do plano de adaptação (docs/revisao.md, CF1 e CF2 — o
 * Heitor, 2026-11-13: "Concordo"), numa rede [e2e] própria:
 *
 * - CF1 (princípio 7: nada sai, muda a organização): as abas em grupos — A rede
 *   (Geral, Unidades, Assinatura) · Equipe e acesso (Cargos, Suporte) ·
 *   Atendimento (Fichas, Documentos) · Clientes (Tags, Fidelidade, Importações,
 *   LGPD) · Dinheiro (Comissões e taxas) · Conexões (Integrações) · Avançado
 *   (Ações em lote). Cada aba continua pedindo o módulo dela, e o grupo sem
 *   nenhuma aba visível some. No portal da unidade, a aba Unidade fica no
 *   grupo "A rede", ao lado de Geral.
 * - CF2: "Eventos" sai de Configurações e vai para as Automações, como "O que
 *   já aconteceu", com o módulo das Automações. O caminho antigo leva ao novo.
 *   A busca universal acompanha.
 */

test.setTimeout(180_000)

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede
let slug = ''
let dona: MembroDeTeste
let soClientes: MembroDeTeste
let soAutomacoes: MembroDeTeste
let soConfiguracoes: MembroDeTeste

async function como(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado, viewport: { width: 1440, height: 900 } })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.use({ storageState: { cookies: [], origins: [] } })

test.beforeAll(async () => {
  rede = await criarOutraRede(`cfgg${marca}`)
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  dona = await criarMembro(`cfggd${marca}`, { tenant: rede.tenantId, donoDaRede: true, permissoes: [] })
  soClientes = await criarMembro(`cfggc${marca}`, { tenant: rede.tenantId, rotulo: 'Só clientes', permissoes: [{ modulo: 'clients', nivel: 'MANAGE' }] })
  soAutomacoes = await criarMembro(`cfgga${marca}`, { tenant: rede.tenantId, rotulo: 'Só automações', permissoes: [{ modulo: 'automations', nivel: 'VIEW' }] })
  soConfiguracoes = await criarMembro(`cfggs${marca}`, { tenant: rede.tenantId, rotulo: 'Só configurações', permissoes: [{ modulo: 'settings', nivel: 'MANAGE' }] })
})

test.afterAll(async () => {
  await soConfiguracoes?.limpar(); await soAutomacoes?.limpar(); await soClientes?.limpar(); await dona?.limpar()
  await rede?.limpar()
})

const GRUPOS = [
  ['A rede', ['Geral', 'Unidades', 'Assinatura']],
  ['Equipe e acesso', ['Cargos', 'Suporte']],
  ['Atendimento', ['Fichas', 'Documentos']],
  ['Clientes', ['Tags', 'Fidelidade', 'Importações', 'LGPD']],
  ['Dinheiro', ['Comissões e taxas']],
  ['Conexões', ['Integrações']],
  ['Avançado', ['Ações em lote']],
] as const

/** Os grupos da tela, na ordem, com as abas de cada um. */
async function gruposDaTela(p: Page): Promise<[string, string[]][]> {
  const nav = p.locator('[data-grupos-de-abas]')
  await expect(nav).toBeVisible()
  const grupos = nav.locator('[data-grupo-de-abas]')
  const n = await grupos.count()
  const out: [string, string[]][] = []
  for (let i = 0; i < n; i++) {
    const g = grupos.nth(i)
    const nome = (await g.getAttribute('data-grupo-de-abas'))!
    const abas = (await g.locator('[data-aba]').allInnerTexts()).map(t => t.trim())
    out.push([nome, abas])
  }
  return out
}

test('CF1: na rede, as abas em sete grupos, na ordem, e o Eventos não está mais lá', async ({ browser }) => {
  await como(browser, dona, async p => {
    await p.goto('/admin/settings')
    // A rede de uma unidade fala "clínica" no lugar de "rede" (F8): o grupo "A rede" vira "A clínica".
    const grupos = await gruposDaTela(p)
    expect(grupos.map(([g]) => g.replace('A clínica', 'A rede'))).toEqual(GRUPOS.map(([g]) => g))
    for (const [g, abas] of GRUPOS) {
      const achado = grupos.find(([n]) => n.replace('A clínica', 'A rede') === g)!
      expect(achado[1], `as abas do grupo ${g}`).toEqual([...abas])
    }
    expect(grupos.flatMap(([, a]) => a)).not.toContain('Eventos')

    // Cada aba continua abrindo pelo link de sempre.
    await p.locator('[data-aba="tags"]').click()
    await expect(p).toHaveURL(/tab=tags/)
    await expect(p.locator('[data-aba="tags"]')).toHaveAttribute('aria-current', 'page')
  })
})

test('CF1: o grupo sem nenhuma aba visível some — quem só tem Clientes vê só o grupo Clientes', async ({ browser }) => {
  await como(browser, soClientes, async p => {
    await p.goto('/admin/settings')
    const grupos = await gruposDaTela(p)
    expect(grupos).toEqual([['Clientes', ['Tags', 'Importações']]])
  })
})

test('CF1: no portal da unidade, a aba Unidade fica no grupo da rede, ao lado de Geral', async ({ browser }) => {
  await como(browser, dona, async p => {
    await p.goto(`/${slug}/settings`)
    const grupos = await gruposDaTela(p)
    const primeiro = grupos[0]!
    expect(primeiro[0].replace('A clínica', 'A rede')).toBe('A rede')
    expect(primeiro[1]).toEqual(['Unidade', 'Geral'])
    expect(grupos.flatMap(([, a]) => a)).not.toContain('Eventos')
  })
})

test('CF2: o caminho antigo do Eventos leva às Automações, "O que já aconteceu"', async ({ browser }) => {
  await como(browser, dona, async p => {
    await p.goto('/admin/settings?tab=eventos')
    await expect(p).toHaveURL(/\/admin\/automacoes\/eventos$/)
    await expect(p.getByRole('heading', { name: 'O que já aconteceu' })).toBeVisible()
    // Ao lado da lista das automações: as duas vistas se alcançam.
    const vistas = p.locator('[data-vistas-das-automacoes]')
    await vistas.getByRole('link', { name: 'Automações' }).click()
    await expect(p).toHaveURL(/\/admin\/automacoes$/)
    await p.locator('[data-vistas-das-automacoes]').getByRole('link', { name: 'O que já aconteceu' }).click()
    await expect(p).toHaveURL(/\/admin\/automacoes\/eventos$/)
  })
})

test('CF2: "O que já aconteceu" pede o módulo das Automações (não o das Configurações)', async ({ browser }) => {
  await como(browser, soAutomacoes, async p => {
    await p.goto('/admin/automacoes/eventos')
    await expect(p.getByRole('heading', { name: 'O que já aconteceu' })).toBeVisible()
  })
  await como(browser, soConfiguracoes, async p => {
    await p.goto('/admin/automacoes/eventos')
    await expect(p.getByText('Você não tem acesso a esta área')).toBeVisible()
  })
})

test('CF2: a busca universal leva ao "O que já aconteceu" das Automações, e não oferece mais Configurações → Eventos', async ({ browser }) => {
  await como(browser, dona, async p => {
    await p.goto('/admin/dashboard')
    const campo = p.getByRole('combobox', { name: 'Busca universal' })
    await campo.click()
    await campo.fill('eventos')
    const opcao = p.getByRole('option', { name: /Automações → O que já aconteceu/ })
    await expect(opcao).toBeVisible()
    await expect(p.getByRole('option', { name: /Configurações → Eventos/ })).toHaveCount(0)
    await opcao.click()
    await expect(p).toHaveURL(/\/admin\/automacoes\/eventos$/)
  })
  // Quem não tem as Automações não acha.
  await como(browser, soConfiguracoes, async p => {
    await p.goto('/admin/dashboard')
    const campo = p.getByRole('combobox', { name: 'Busca universal' })
    await campo.click()
    await campo.fill('eventos')
    await expect(p.getByRole('option', { name: /O que já aconteceu/ })).toHaveCount(0)
  })
})
