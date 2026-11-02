import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * F6 da 5ª simulação (o Heitor: "concordo"; H5, "A cliente é da clínica"):
 * quem tem Clientes em Gerenciar edita a ficha de QUALQUER cliente da clínica,
 * mesmo cadastrada em OUTRA unidade. A recepção fixa na Zona Sul atende a
 * Marlene, cadastrada na Moinhos, e corrige o telefone e as anotações dela.
 *
 * Quem edita é um membro de UNIDADE FIXA: como admin a ficha abre e grava de
 * qualquer jeito, e o teste não provaria nada.
 */

const marca = `fu${Date.now().toString(36)}`
const db = () => banco()
let rede: OutraRede | null = null
let unidadeB = ''
let slugB = ''
let clienteDeA = ''
let recepcaoDeB: MembroDeTeste | null = null

async function como(browser: Browser, estado: string, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(marca)
  const { data: b, error: eB } = await db().from('branches')
    .insert({ tenant_id: rede.tenantId, name: `${PREFIXO} Zona Sul ${marca}`, slug: `e2e-zs-${marca}` })
    .select('id, slug').single<{ id: string; slug: string }>()
  expect(eB, 'criar a segunda unidade').toBeNull()
  unidadeB = b!.id; slugB = b!.slug

  // A Marlene é cadastrada em A (a unidade do apoio).
  clienteDeA = await rede.criarCliente('Marlene')

  recepcaoDeB = await criarMembro(`r${marca}`, {
    tenant: rede.tenantId, branchId: unidadeB, rotulo: 'Recepção de B',
    permissoes: [
      { modulo: 'clients', nivel: 'MANAGE', escopo: 'ALL' },
      { modulo: 'agenda', nivel: 'MANAGE', escopo: 'ALL' },
    ],
  })
})

test.afterAll(async () => {
  await recepcaoDeB?.limpar()
  if (unidadeB) await db().from('branches').delete().eq('id', unidadeB)
  await rede?.limpar()
})

async function ficha() {
  const { data, error } = await db().from('clients').select('name, phone, notes, branch_id').eq('id', clienteDeA).single()
  expect(error).toBeNull()
  return data as { name: string; phone: string | null; notes: string | null; branch_id: string }
}

test('a recepção fixa em B edita os dados e as anotações da cliente cadastrada em A', async ({ browser }) => {
  const novoNome = `${PREFIXO} Marlene Souza ${marca}`
  await como(browser, recepcaoDeB!.estado, async p => {
    await p.goto(`/${slugB}/clients/${clienteDeA}?aba=dados`)
    await expect(p.locator('[data-cadastro-so-leitura]')).toHaveCount(0)

    // O "Nome *" da aba Dados (o primeiro campo de texto do cartão; o da topbar é a busca).
    const nome = p.locator('.card input[type="text"]').first()
    await expect(nome).toHaveValue(new RegExp(`Marlene ${marca}`))
    await nome.fill(novoNome)
    await p.getByRole('button', { name: 'Salvar dados' }).click()
    await expect.poll(async () => (await ficha()).name, { timeout: 15_000 }).toBe(novoNome)

    // As anotações moram na visão geral da ficha.
    await p.goto(`/${slugB}/clients/${clienteDeA}`)
    const notas = p.getByPlaceholder('Preferências, restrições, combinados… o que ajudar quem for atender.')
    await notas.fill('Prefere horário da tarde.')
    await notas.blur()
    await expect(p.getByText('salvo', { exact: true })).toBeVisible()
  })
  const depois = await ficha()
  expect(depois.notes).toBe('Prefere horário da tarde.')
  // A ficha continua cadastrada em A: editar não a muda de unidade.
  expect(depois.branch_id).toBe(rede!.branchId)
})

test('a recepção fixa em B arquiva e reativa a cliente cadastrada em A', async ({ browser }) => {
  await como(browser, recepcaoDeB!.estado, async p => {
    await p.goto(`/${slugB}/clients/${clienteDeA}`)
    await p.getByRole('button', { name: 'Mais ações' }).click()
    await p.getByRole('button', { name: 'Arquivar cliente' }).click()
    await p.getByRole('button', { name: 'Arquivar', exact: true }).click()
    await expect.poll(async () => (await db().from('clients').select('is_active').eq('id', clienteDeA).single()).data?.is_active,
      { timeout: 15_000 }).toBe(false)
    await expect(p.getByText('Esta cliente é de outra unidade.')).toHaveCount(0)
  })
  // Reativa (sem a tela: o botão de reativar é o mesmo menu).
  await como(browser, recepcaoDeB!.estado, async p => {
    await p.goto(`/${slugB}/clients/${clienteDeA}`)
    await p.getByRole('button', { name: 'Mais ações' }).click()
    await p.getByRole('button', { name: /Reativar/ }).click()
    await expect.poll(async () => (await db().from('clients').select('is_active').eq('id', clienteDeA).single()).data?.is_active,
      { timeout: 15_000 }).toBe(true)
  })
})
