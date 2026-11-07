import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * Os atritos do catálogo de procedimentos da 8ª simulação (2026-11-06):
 * - A35: a gerente via Procedimentos só para ler, e nada dizia que o catálogo
 *   é da rede (é a regra — plataforma.md; só falta a tela dizer).
 * - A4: os modais de procedimento ficavam em dobro no DOM (o formulário de cada
 *   linha e o do "Novo procedimento", com \`name=price\` repetido), montados
 *   escondidos o tempo todo.
 * Numa rede [e2e] própria.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let slug = ''
let dona: MembroDeTeste | null = null
let gerente: MembroDeTeste | null = null
let consulta: MembroDeTeste | null = null

async function como(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  test.setTimeout(120_000)
  rede = await criarOutraRede(`pr8${marca}`)
  const b = db()
  expect((await b.from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  slug = (await b.from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  expect((await b.from('procedures').insert({ tenant_id: rede.tenantId, name: `${PREFIXO} Peeling ${marca}`, category: 'e2e', duration_min: 30, price: 250 })).error).toBeNull()
  dona = await criarMembro(`pr8d${marca}`, { tenant: rede.tenantId, donoDaRede: true, permissoes: [] })
  gerente = await criarMembro(`pr8g${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Gerente',
    permissoes: [{ modulo: 'procedures', nivel: 'MANAGE' }, { modulo: 'agenda', nivel: 'VIEW' }],
  })
  consulta = await criarMembro(`pr8c${marca}`, {
    tenant: rede.tenantId, rotulo: 'Consulta', permissoes: [{ modulo: 'procedures', nivel: 'VIEW' }],
  })
})

test.afterAll(async () => {
  await dona?.limpar(); await gerente?.limpar(); await consulta?.limpar()
  await rede?.limpar()
})

test('A35: no portal da unidade, o catálogo diz que é da clínica toda e quem o muda', async ({ browser }) => {
  await como(browser, gerente!, async p => {
    await p.goto(`/${slug}/procedures`)
    // Clínica de uma unidade: a fala troca "rede" por "clínica" (design.md).
    await expect(p.locator('[data-catalogo-da-rede]')).toContainText(/quem cria e muda é quem administra a (rede|clínica)/)
  })
})

test('A35: na rede, quem só vê Procedimentos lê que o cargo só consulta — sem "Novo procedimento"', async ({ browser }) => {
  await como(browser, consulta!, async p => {
    await p.goto('/admin/procedures')
    await expect(p.locator('[data-catalogo-so-consulta]')).toContainText('Seu cargo só consulta o catálogo')
    await expect(p.getByRole('button', { name: 'Novo procedimento' })).toHaveCount(0)
  })
})

test('A4: o formulário do procedimento só existe no DOM com a janela aberta (um só)', async ({ browser }) => {
  await como(browser, dona!, async p => {
    await p.goto('/admin/procedures')
    await expect(p.getByRole('button', { name: 'Novo procedimento' }).first()).toBeVisible()
    await expect(p.locator('input[name="price"]'), 'nada montado escondido').toHaveCount(0)
    await p.getByRole('button', { name: 'Novo procedimento' }).first().click()
    await expect(p.locator('input[name="price"]')).toHaveCount(1)
  })
})

/**
 * A20 da 9ª simulação (2026-11-07): na clínica de uma unidade, a dona abria
 * Procedimentos pelo portal da unidade e lia "aqui ele é consulta", sem saber
 * que se edita no portal da clínica. Quem pode editar (Procedimentos em
 * Gerenciar, da clínica toda) ganha o "Editar no catálogo da clínica"; a
 * gerente de unidade fixa, não (H7: o catálogo é da clínica toda).
 */
test('A20 da 9ª: o catálogo da unidade leva quem pode editar ao catálogo da clínica', async ({ browser }) => {
  await como(browser, dona!, async p => {
    await p.goto(`/${slug}/procedures`)
    const link = p.locator('[data-catalogo-da-rede]').getByRole('link', { name: /Editar no catálogo da (rede|clínica)/ })
    await expect(link).toHaveAttribute('href', '/admin/procedures')
  })
  await como(browser, gerente!, async p => {
    await p.goto(`/${slug}/procedures`)
    await expect(p.locator('[data-catalogo-da-rede]')).toBeVisible()
    await expect(p.locator('[data-catalogo-da-rede]').getByRole('link')).toHaveCount(0)
  })
})
