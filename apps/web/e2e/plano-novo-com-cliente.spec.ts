import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * J-39 (ajustes J, 2026-10-30): o "Novo plano" de Planejamentos dizia "O
 * cliente pode ser ligado agora", mas só pedia o nome — não havia como ligar
 * agora. A janela ganhou "Cliente (opcional)", com a busca de cliente (a mesma
 * da tela do plano); sem cliente, o plano nasce pelo nome, como antes.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let profissional: MembroDeTeste | null = null
let slug = ''
let cliente = ''

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: profissional!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`pnc${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  profissional = await criarMembro(`pncp${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Profissional',
    permissoes: [
      { modulo: 'agenda', nivel: 'MANAGE' },
      { modulo: 'clients', nivel: 'VIEW' },
      { modulo: 'medical_records', nivel: 'MANAGE' },
    ],
  })
  cliente = await rede.criarCliente('Marina Novo Plano')
})
test.afterAll(async () => {
  if (rede) await db().from('treatment_plans').delete().eq('branch_id', rede.branchId)
  await profissional?.limpar(); await rede?.limpar()
})

test('o Novo plano liga a cliente na criação, pela busca', async ({ browser }) => {
  const nome = `Harmonização ${marca}`
  await como(browser, async p => {
    await p.goto(`/${slug}/planejamentos`)
    await p.getByRole('button', { name: 'Novo plano' }).first().click()
    const janela = p.getByRole('dialog', { name: 'Novo plano' })
    await janela.getByLabel('Nome do plano').fill(nome)
    await janela.getByLabel('Cliente (opcional)').fill('Marina Novo')
    await janela.getByRole('button', { name: /Marina Novo Plano/ }).click()
    await expect(janela.getByText(/Marina Novo Plano/)).toBeVisible()
    await janela.getByRole('button', { name: 'Criar', exact: true }).click()
    await expect(p).toHaveURL(/\/planejamentos\/[0-9a-f-]{36}$/)
  })
  const { data } = await db().from('treatment_plans').select('client_id').eq('name', nome).single()
  expect(data?.client_id, 'o plano nasce ligado à cliente').toBe(cliente)
})

test('sem cliente, o plano nasce só pelo nome — e a janela não promete o que não faz', async ({ browser }) => {
  const nome = `Sem cliente ${marca}`
  await como(browser, async p => {
    await p.goto(`/${slug}/planejamentos`)
    await p.getByRole('button', { name: 'Novo plano' }).first().click()
    const janela = p.getByRole('dialog', { name: 'Novo plano' })
    await janela.getByLabel('Nome do plano').fill(nome)
    await janela.getByRole('button', { name: 'Criar', exact: true }).click()
    await expect(p).toHaveURL(/\/planejamentos\/[0-9a-f-]{36}$/)
  })
  const { data } = await db().from('treatment_plans').select('client_id').eq('name', nome).single()
  expect(data?.client_id).toBeNull()
})
