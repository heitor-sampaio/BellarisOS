import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * A lista de clientes filtra pelas tags DA REDE (pedido do Heitor,
 * 2026-10-14): no lugar do segmento fixo "Todos / VIP / Novos / Inativos", os
 * filtros na forma do resto do sistema — Situação (escolha única) e Tags
 * (várias, do vocabulário de Configurações → Tags).
 *
 * Numa rede `[e2e]` própria.
 */

test.describe.configure({ mode: 'serial' })

const marca = Date.now().toString(36)
const db = () => banco()
let outra: OutraRede
let admin: MembroDeTeste
let unidadeNorte: string
const NOIVAS = `${PREFIXO} Noivas ${marca}`
const COM_TAG = `${PREFIXO} Com tag ${marca}`
const SEM_TAG = `${PREFIXO} Sem tag ${marca}`
const INATIVA = `${PREFIXO} Inativa ${marca}`

test.beforeAll(async () => {
  test.setTimeout(240_000)
  outra = await criarOutraRede(`tgl${marca}`)
  admin = await criarMembro(`tgl${marca}`, { tenant: outra.tenantId, rotulo: 'Recepção', permissoes: [{ modulo: 'clients', nivel: 'MANAGE' }] })
  // A segunda unidade: com ela, a lista ganha o filtro de unidade.
  const un = await db().from('branches').insert({ tenant_id: outra.tenantId, name: `${PREFIXO} Norte ${marca}`, slug: `e2e-tgl-norte-${marca}` }).select('id').single<{ id: string }>()
  expect(un.error).toBeNull()
  unidadeNorte = un.data!.id
  const fone = () => '5548' + String(Date.now() + Math.floor(Math.random() * 1e6)).slice(-9)
  const r = await db().from('clients').insert([
    { tenant_id: outra.tenantId, branch_id: outra.branchId, name: COM_TAG, phone: fone(), tags: [NOIVAS], is_active: true },
    { tenant_id: outra.tenantId, branch_id: outra.branchId, name: SEM_TAG, phone: fone(), tags: [], is_active: true },
    { tenant_id: outra.tenantId, branch_id: outra.branchId, name: INATIVA, phone: fone(), tags: [], is_active: false },
  ])
  expect(r.error).toBeNull()
})
test.afterAll(async () => {
  if (outra) {
    const { data: cs } = await db().from('clients').select('id').eq('tenant_id', outra.tenantId)
    if (cs?.length) await db().from('clients').delete().in('id', cs.map(c => c.id))
    await db().from('tags').delete().eq('tenant_id', outra.tenantId)
    if (unidadeNorte) await db().from('branches').delete().eq('id', unidadeNorte)
  }
  await admin?.limpar()
  await outra?.limpar()
})

async function como(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test('a lista filtra por situação e pelas tags da rede, sem o segmento fixo', async ({ browser }) => {
  await como(browser, admin, async p => {
    await p.goto('/admin/clients')
    await expect(p.getByText(COM_TAG)).toBeVisible()
    await expect(p.getByText(SEM_TAG)).toBeVisible()
    await expect(p.getByText(INATIVA)).toHaveCount(0)
    // O segmento fixo saiu.
    await expect(p.getByRole('button', { name: 'VIP', exact: true })).toHaveCount(0)

    // Tags: o vocabulário da rede — inclusive a que ninguém usa ainda.
    await p.getByRole('button', { name: 'Tags', exact: true }).click()
    await expect(p.getByRole('button', { name: 'Gestante', exact: true })).toBeVisible()
    await p.getByRole('button', { name: NOIVAS, exact: true }).click()
    await expect(p.getByText(COM_TAG)).toBeVisible()
    await expect(p.getByText(SEM_TAG)).toHaveCount(0)
    await expect(p.getByRole('button', { name: 'Tags · 1', exact: true })).toBeVisible()
    // Desmarca, e fecha o painel clicando na posição do gatilho (o fundo do
    // painel cobre a tela e fecha ao clique).
    await p.getByRole('button', { name: NOIVAS, exact: true }).click()
    await expect(p.getByText(SEM_TAG)).toBeVisible()
    const gatilho = (await p.getByRole('button', { name: 'Tags', exact: true }).boundingBox())!
    await p.mouse.click(gatilho.x + 5, gatilho.y + 5)

    // Situação: escolha única.
    await p.getByRole('button', { name: 'Situação', exact: true }).click()
    await p.getByRole('button', { name: 'Arquivadas', exact: true }).click()
    await expect(p.getByText(INATIVA)).toBeVisible()
    await expect(p.getByText(COM_TAG)).toHaveCount(0)
    await expect(p.getByRole('button', { name: 'Arquivadas', exact: true })).toBeVisible()
  })
})

test('os seletores da barra têm o MESMO marcador (quadrado), e abrir as tags não empurra a lista', async ({ browser }) => {
  await como(browser, admin, async p => {
    await p.goto('/admin/clients')
    const linha = p.locator('button', { hasText: COM_TAG })
    await expect(linha).toBeVisible()
    const antes = (await linha.boundingBox())!
    const largura = p.viewportSize()!.width

    for (const gatilho of ['Situação', 'Unidade', 'Tags']) {
      await p.getByRole('button', { name: gatilho, exact: true }).click()
      const marcadores = p.locator('[data-marcador]')
      await expect(marcadores.first()).toBeVisible()
      const raios = await marcadores.evaluateAll(els => els.map(e => getComputedStyle(e).borderRadius))
      expect(new Set(raios), `marcadores de ${gatilho}`).toEqual(new Set(['4px']))

      // O painel cabe na tela, e a lista não andou para o lado.
      expect((await linha.boundingBox())!.x, `a lista com ${gatilho} aberto`).toBe(antes.x)
      const caixa = (await p.locator('[data-painel-picker]').boundingBox())!
      expect(caixa.x).toBeGreaterThanOrEqual(0)
      expect(caixa.x + caixa.width).toBeLessThanOrEqual(largura)
      // E nada o cobre: nos quatro cantos, o que está por cima é o painel (a
      // coluna do meio era desenhada por cima do pedaço que saía da lista).
      const coberto = await p.locator('[data-painel-picker]').evaluate(el => {
        const r = el.getBoundingClientRect()
        const pontos = [[r.left + 6, r.top + 6], [r.right - 6, r.top + 6], [r.left + 6, r.bottom - 6], [r.right - 6, r.bottom - 6]]
        return pontos.filter(([x, y]) => !el.contains(document.elementFromPoint(x!, y!))).length
      })
      expect(coberto, `cantos cobertos do painel de ${gatilho}`).toBe(0)

      const g = (await p.getByRole('button', { name: gatilho, exact: true }).boundingBox())!
      await p.mouse.click(g.x + 5, g.y + 5)
      await expect(p.locator('[data-painel-picker]')).toHaveCount(0)
    }
  })
})
