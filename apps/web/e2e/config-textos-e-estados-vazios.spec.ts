import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'

/**
 * Textos e estados vazios da configuração (A4, A5, A7, A8, A9 da simulação de
 * 2026-10-27): o catálogo vazio da unidade explica onde se cadastra (ou a quem
 * pedir); "Insumos" sem produto leva ao Estoque; salvar a ficha de
 * pré-atendimento confirma; a unidade não é mandada à aba Assinatura (que só
 * existe na rede); o texto do funil diz que o formulário cria um funil NOVO.
 */
const marca = Date.now().toString(36)
let A: OutraRede
let gerente: MembroDeTeste
let daUnidade: MembroDeTeste

test.beforeAll(async () => {
  A = await criarOutraRede(`txt${marca}`)
  // o catálogo da rede nasce vazio
  await banco().from('procedures').delete().eq('id', A.procedureId)
  gerente = await criarMembro(`txg${marca}`, {
    tenant: A.tenantId, rotulo: 'Gerente da rede',
    permissoes: [
      { modulo: 'procedures', nivel: 'MANAGE' }, { modulo: 'settings', nivel: 'MANAGE' },
      { modulo: 'forms', nivel: 'MANAGE' }, { modulo: 'crm', nivel: 'MANAGE' }, { modulo: 'stock', nivel: 'MANAGE' },
    ],
  })
  daUnidade = await criarMembro(`txu${marca}`, {
    tenant: A.tenantId, branchId: A.branchId, rotulo: 'Da unidade',
    permissoes: [{ modulo: 'procedures', nivel: 'VIEW' }, { modulo: 'settings', nivel: 'MANAGE' }],
  })
})

test.afterAll(async () => {
  await gerente?.limpar()
  await daUnidade?.limpar()
  await A?.limpar()
})

async function como(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test('A4: catálogo vazio — quem gere vê o botão que cadastra; quem não gere lê a quem pedir', async ({ browser }) => {
  const slug = `e2e-un-txt${marca}`
  await como(browser, daUnidade, async p => {
    await p.goto(`/${slug}/procedures`)
    await expect(p.getByText('O catálogo é da rede: peça a quem administra.')).toBeVisible()
    await expect(p.getByRole('link', { name: 'Cadastrar procedimento' })).toHaveCount(0)
  })
  await como(browser, gerente, async p => {
    await p.goto(`/${slug}/procedures`)
    await expect(p.getByRole('link', { name: 'Cadastrar procedimento' })).toHaveAttribute('href', '/admin/procedures')
  })
})

test('A5: "Insumos utilizados" sem produto leva ao cadastro no Estoque', async ({ browser }) => {
  await como(browser, gerente, async p => {
    await p.goto('/admin/procedures')
    await p.getByRole('button', { name: 'Novo procedimento' }).first().click()
    const dialogo = p.locator('dialog[open]')
    await expect(dialogo.getByText('Nenhum produto cadastrado no estoque ainda.')).toBeVisible()
    await expect(dialogo.getByRole('link', { name: /Cadastrar produto no Estoque/ })).toHaveAttribute('href', '/admin/estoque')
  })
})

test('A7: salvar a ficha de pré-atendimento confirma', async ({ browser }) => {
  await como(browser, gerente, async p => {
    await p.goto('/admin/settings?tab=fichas')
    await p.getByRole('button', { name: 'Editar perguntas' }).click()
    await p.getByRole('button', { name: 'Salvar ficha' }).click()
    await expect(p.getByRole('status').filter({ hasText: 'Ficha de pré-atendimento salva.' })).toBeVisible()
  })
})

test('A8: na unidade, Geral não manda à aba Assinatura — diz que é de quem administra a rede', async ({ browser }) => {
  await como(browser, daUnidade, async p => {
    await p.goto(`/e2e-un-txt${marca}/settings?tab=general`)
    await expect(p.getByText(/A assinatura fica com quem administra a rede/)).toBeVisible()
    await expect(p.getByText(/aba Assinatura/)).toHaveCount(0)
  })
  await como(browser, gerente, async p => {
    await p.goto('/admin/settings?tab=general')
    await expect(p.getByText(/Veja faturas e pagamento na aba Assinatura/)).toBeVisible()
  })
})

test('A9: o texto do funil diz que o formulário cria um funil NOVO e que os existentes não mudam', async ({ browser }) => {
  await como(browser, gerente, async p => {
    await p.goto('/admin/oportunidades')
    await p.getByTitle('Configurar funis').click()
    await expect(p.getByText(/ficam como estão/)).toBeVisible()
  })
})
