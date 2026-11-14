import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'

/**
 * Bloco Procedimentos (PR1/PR6, PR2, PR3) e o começo do bloco Pacotes (PC1,
 * PC6) do plano de adaptação — a revisão do Heitor de 2026-11-13:
 * - PR1/PR6, PC6: categorias, procedimento e pacote — criar, editar,
 *   ativar/desativar — é de quem tem Procedimentos em Gerenciar, e só isso.
 *   Sai a exigência de ser da rede: a pessoa de unidade fixa com o módulo em
 *   Gerenciar cuida do catálogo pelo portal da unidade.
 * - PR2: "Visível no app do cliente" vira "Permitir auto agendamento".
 * - PR3: "Ficha" vira "Ficha de atendimento".
 * - PC1: o preço do pacote nasce com a soma (sessões × preço de tabela) e
 *   pode ser alterado.
 * Numa rede [e2e] própria.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let slug = ''
let procId = ''
let gerencia: MembroDeTeste | null = null
let consulta: MembroDeTeste | null = null

async function como(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  test.setTimeout(120_000)
  rede = await criarOutraRede(`prp${marca}`)
  const b = db()
  expect((await b.from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  slug = (await b.from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  const { data: proc, error } = await b.from('procedures')
    .insert({ tenant_id: rede.tenantId, name: `${PREFIXO} Peeling ${marca}`, category: 'e2e', duration_min: 30, price: 250 })
    .select('id').single<{ id: string }>()
  expect(error).toBeNull()
  procId = proc!.id
  // Unidade fixa, com o catálogo em Gerenciar — o caso que a regra antiga barrava.
  gerencia = await criarMembro(`prpg${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Catálogo',
    permissoes: [{ modulo: 'procedures', nivel: 'MANAGE' }],
  })
  consulta = await criarMembro(`prpc${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Consulta',
    permissoes: [{ modulo: 'procedures', nivel: 'VIEW' }],
  })
})

test.afterAll(async () => {
  await gerencia?.limpar(); await consulta?.limpar()
  await rede?.limpar()
})

test('PR1/PR6: quem tem Procedimentos em Gerenciar, de unidade fixa, cuida do catálogo pelo portal da unidade', async ({ browser }) => {
  await como(browser, gerencia!, async p => {
    await p.goto(`/${slug}/procedures`)
    await expect(p.getByRole('button', { name: 'Novo procedimento' }).first()).toBeVisible()
    await expect(p.getByRole('button', { name: /Categorias/ }).first()).toBeVisible()

    // A categoria e o desativar, direto pela action (é a trava de verdade).
    const nome = `${PREFIXO} Cat ${marca}`
    // A resposta vem como payload RSC: a prova é o banco.
    await chamarAcao(p, 'actions/categorias-de-procedimento.ts', 'criarCategoriaDeProcedimento', `/${slug}/procedures`, [nome])
    const { data: cat } = await db().from('procedure_categories').select('id').eq('tenant_id', rede!.tenantId).eq('nome', nome)
    expect(cat ?? []).toHaveLength(1)

    await chamarAcao(p, 'actions/procedures.ts', 'toggleProcedureStatus', `/${slug}/procedures`, [procId, false])
    const { data: proc } = await db().from('procedures').select('is_active').eq('id', procId).single<{ is_active: boolean }>()
    expect(proc!.is_active).toBe(false)
    await db().from('procedures').update({ is_active: true }).eq('id', procId)
  })
})

test('PR2/PR3: o formulário diz "Permitir auto agendamento" e "Ficha de atendimento"', async ({ browser }) => {
  await como(browser, gerencia!, async p => {
    await p.goto(`/${slug}/procedures`)
    await p.getByRole('button', { name: 'Novo procedimento' }).first().click()
    await expect(p.getByLabel('Permitir auto agendamento')).toBeVisible()
    await expect(p.getByText('Visível no app do cliente')).toHaveCount(0)
    await expect(p.getByText('Ficha de atendimento', { exact: true })).toBeVisible()
  })
})

test('PR1: quem só vê Procedimentos lê quem muda o catálogo (pela permissão) e não ganha botão nem action', async ({ browser }) => {
  await como(browser, consulta!, async p => {
    await p.goto(`/${slug}/procedures`)
    await expect(p.locator('[data-catalogo-da-rede]')).toContainText('quem tem Procedimentos em Gerenciar')
    await expect(p.getByRole('button', { name: 'Novo procedimento' })).toHaveCount(0)
    const nome = `${PREFIXO} Cat proibida ${marca}`
    await chamarAcao(p, 'actions/categorias-de-procedimento.ts', 'criarCategoriaDeProcedimento', `/${slug}/procedures`, [nome]).catch(() => null)
    const { data } = await db().from('procedure_categories').select('id').eq('tenant_id', rede!.tenantId).eq('nome', nome)
    expect(data ?? []).toHaveLength(0)
  })
})

test('PC6: o pacote também — quem tem Procedimentos em Gerenciar, de unidade fixa, cria pelo portal da unidade', async ({ browser }) => {
  await como(browser, gerencia!, async p => {
    await p.goto(`/${slug}/pacotes`)
    await expect(p.getByRole('button', { name: 'Novo pacote' })).toBeVisible()
    const nome = `${PREFIXO} Pacote ${marca}`
    await chamarAcao(p, 'actions/pacotes.ts', 'salvarPacote', `/${slug}/pacotes`, [{
      name: nome, price: 900, validity_days: null, is_active: true,
      itens: [{ procedure_id: procId, quantity: 4 }],
    }])
    const { data } = await db().from('service_packages').select('id').eq('tenant_id', rede!.tenantId).eq('name', nome)
    expect(data ?? []).toHaveLength(1)
  })
})

test('PC1: o preço do pacote nasce com a soma das sessões e se altera à mão', async ({ browser }) => {
  await como(browser, gerencia!, async p => {
    await p.goto(`/${slug}/pacotes`)
    await p.getByRole('button', { name: 'Novo pacote' }).click()
    const form = p.getByRole('group', { name: 'Novo pacote' })
    await form.getByLabel('Procedimento 1', { exact: true }).selectOption(procId)
    await form.getByLabel('Sessões do procedimento 1').fill('4')
    const preco = form.getByLabel('Preço do pacote')
    // 4 × R$ 250,00
    await expect(preco).toHaveValue('1.000,00')
    await form.getByLabel('Sessões do procedimento 1').fill('5')
    await expect(preco).toHaveValue('1.250,00')
    // Mexeu no preço: a soma não o sobrescreve mais.
    await preco.fill('1.100,00')
    await form.getByLabel('Sessões do procedimento 1').fill('6')
    await expect(preco).toHaveValue('1.100,00')
  })
})
