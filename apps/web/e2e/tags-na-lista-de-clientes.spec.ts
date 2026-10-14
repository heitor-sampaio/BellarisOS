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
const NOIVAS = `${PREFIXO} Noivas ${marca}`
const COM_TAG = `${PREFIXO} Com tag ${marca}`
const SEM_TAG = `${PREFIXO} Sem tag ${marca}`
const INATIVA = `${PREFIXO} Inativa ${marca}`

test.beforeAll(async () => {
  test.setTimeout(240_000)
  outra = await criarOutraRede(`tgl${marca}`)
  admin = await criarMembro(`tgl${marca}`, { tenant: outra.tenantId, rotulo: 'Recepção', permissoes: [{ modulo: 'clients', nivel: 'MANAGE' }] })
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
    await p.getByRole('button', { name: 'Inativos', exact: true }).click()
    await expect(p.getByText(INATIVA)).toBeVisible()
    await expect(p.getByText(COM_TAG)).toHaveCount(0)
    await expect(p.getByRole('button', { name: 'Inativos', exact: true })).toBeVisible()
  })
})
