import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * As AÇÕES da busca universal (fase 2, 2026-10-08): "Novo agendamento" e
 * "Cadastrar cliente" sem registro; "Agendar" e "Vender" no cliente achado; e
 * o termo que não achou ninguém vira "Cadastrar «termo» como cliente". Cada
 * uma abre o modal que já existe, pela URL. Só aparece para quem a tela de
 * destino libera.
 *
 * Numa rede `[e2e]` própria.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let outra: OutraRede
let dono: MembroDeTeste
let soVe: MembroDeTeste
let clienteId: string
let nomeDoCliente: string
const criados: MembroDeTeste[] = []

test.beforeAll(async () => {
  test.setTimeout(240_000)
  outra = await criarOutraRede(`ba${marca}`)
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', outra.tenantId)).error).toBeNull()
  dono = await criarMembro(`badono${marca}`, { tenant: outra.tenantId, donoDaRede: true, permissoes: [], rotulo: 'Dono' })
  soVe = await criarMembro(`bave${marca}`, { tenant: outra.tenantId, rotulo: 'Só vê', permissoes: [
    { modulo: 'agenda', nivel: 'VIEW' }, { modulo: 'clients', nivel: 'VIEW' },
  ] })
  criados.push(dono, soVe)
  clienteId = await outra.criarCliente('Acoes Rita')
  nomeDoCliente = (await db().from('clients').select('name').eq('id', clienteId).single()).data!.name as string
  // Um procedimento à venda (o "Vender" só abre com algo a vender).
  const { error } = await db().from('procedures').insert({ tenant_id: outra.tenantId, name: `${PREFIXO} Limpeza ba${marca}`, category: 'e2e', duration_min: 30, price: 150 })
  expect(error).toBeNull()
})
test.afterAll(async () => {
  for (const m of criados) await m.limpar()
  await db().from('procedures').delete().eq('tenant_id', outra.tenantId)
  await outra?.limpar()
})

async function como(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}
async function buscar(p: Page, termo: string) {
  const campo = p.getByRole('combobox', { name: 'Busca universal' })
  await campo.click()
  if (termo) await campo.fill(termo)
  return p.getByRole('listbox', { name: 'Resultados da busca' })
}

test('sem termo, as ações no topo: "Novo agendamento" abre o modal na agenda', async ({ browser }) => {
  await como(browser, dono, async p => {
    await p.goto('/admin/dashboard')
    const lista = await buscar(p, '')
    await expect(lista.getByRole('group', { name: 'Ações' })).toBeVisible()
    await expect(lista.getByRole('option', { name: 'Cadastrar cliente' })).toBeVisible()
    await lista.getByRole('option', { name: 'Novo agendamento' }).click()
    await expect(p).toHaveURL(/\/admin\/agenda/)
    await expect(p.getByRole('dialog', { name: 'Novo agendamento' })).toBeVisible()
  })
})

test('no cliente achado: "Agendar" abre o modal com ele escolhido', async ({ browser }) => {
  await como(browser, dono, async p => {
    await p.goto('/admin/dashboard')
    const lista = await buscar(p, 'Acoes Rita')
    await lista.getByRole('option', { name: `Agendar para ${nomeDoCliente}` }).click()
    const modal = p.getByRole('dialog', { name: 'Novo agendamento' })
    await expect(modal).toBeVisible()
    await expect(modal.getByText(nomeDoCliente)).toBeVisible()
  })
})

test('no cliente achado: "Vender" abre a venda na ficha dele', async ({ browser }) => {
  await como(browser, dono, async p => {
    await p.goto('/admin/dashboard')
    const lista = await buscar(p, 'Acoes Rita')
    await lista.getByRole('option', { name: `Vender para ${nomeDoCliente}` }).click()
    await expect(p).toHaveURL(new RegExp(`/admin/clients/${clienteId}`))
    await expect(p.getByRole('dialog', { name: 'Vender' })).toBeVisible()
  })
})

test('pelo teclado: → entra nas ações do cliente, Enter abre a escolhida', async ({ browser }) => {
  await como(browser, dono, async p => {
    await p.goto('/admin/dashboard')
    const lista = await buscar(p, 'Acoes Rita')
    await expect(lista.getByRole('option').filter({ hasText: nomeDoCliente }).first()).toBeVisible()
    const campo = p.getByRole('combobox', { name: 'Busca universal' })
    await campo.press('ArrowRight')
    await expect(lista.getByRole('option', { name: `Agendar para ${nomeDoCliente}` })).toHaveAttribute('aria-selected', 'true')
    await campo.press('Enter')
    await expect(p.getByRole('dialog', { name: 'Novo agendamento' })).toBeVisible()
  })
})

test('o termo que não achou ninguém vira "Cadastrar «termo» como cliente", com o nome preenchido', async ({ browser }) => {
  const novo = `Zuleica Inexistente ${marca}`
  await como(browser, dono, async p => {
    await p.goto('/admin/dashboard')
    const lista = await buscar(p, novo)
    await lista.getByRole('option', { name: `Cadastrar “${novo}” como cliente` }).click()
    await expect(p).toHaveURL(/\/admin\/clients\/new/)
    await expect(p.locator('input[name="name"]')).toHaveValue(novo)
  })
})

test('quem só VÊ a agenda e os clientes não ganha ação nenhuma', async ({ browser }) => {
  await como(browser, soVe, async p => {
    await p.goto('/admin/dashboard')
    const lista = await buscar(p, '')
    await expect(lista.getByRole('group', { name: 'Atalhos' })).toBeVisible()
    await expect(lista.getByRole('group', { name: 'Ações' })).toHaveCount(0)
    const achados = await buscar(p, 'Acoes Rita')
    await expect(achados.getByRole('option').filter({ hasText: nomeDoCliente }).first()).toBeVisible()
    await expect(achados.getByRole('option', { name: /^Agendar para|^Vender para/ })).toHaveCount(0)
  })
})
