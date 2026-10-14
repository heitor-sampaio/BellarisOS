import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'

/**
 * As categorias de procedimento da rede (pedido do Heitor, 2026-10-14): eram
 * quinze fixas no código, sem tela nenhuma — e o procedimento com categoria
 * fora delas ("Facial", vinda da importação) perdia a categoria ao ser editado.
 *  - Rede nova nasce com as quinze; a categoria gravada em qualquer lugar
 *    entra no vocabulário sozinha (gatilho).
 *  - Procedimentos → Categorias: criar, renomear (em todos os procedimentos —
 *    e juntar, se o nome já existe) e arquivar.
 *  - O cadastro oferece as ativas e mantém a do procedimento, mesmo arquivada.
 *
 * Numa rede `[e2e]` própria.
 */

test.describe.configure({ mode: 'serial' })

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede
let gestor: MembroDeTeste
let soVe: MembroDeTeste
const FACIAL = `${PREFIXO} Facial ${marca}`
const ROSTO = `${PREFIXO} Rosto ${marca}`
const HARMONIZACAO = `${PREFIXO} Harmonização ${marca}`
const procs: Record<string, string> = {}

test.beforeAll(async () => {
  test.setTimeout(240_000)
  rede = await criarOutraRede(`cat${marca}`)
  gestor = await criarMembro(`catg${marca}`, { tenant: rede.tenantId, rotulo: 'Gestor', permissoes: [{ modulo: 'procedures', nivel: 'MANAGE' }] })
  soVe = await criarMembro(`catv${marca}`, { tenant: rede.tenantId, rotulo: 'Só vê', permissoes: [{ modulo: 'procedures', nivel: 'VIEW' }] })
  // Gravados direto (o caminho da importação): duas com uma categoria de fora,
  // uma em "Fios" e uma em "peeling" (a mesma de "Peeling", sem caixa).
  for (const [chave, categoria] of [['A', FACIAL], ['B', FACIAL], ['Fios', 'Fios'], ['Peeling', 'peeling']] as const) {
    const r = await db().from('procedures').insert({
      tenant_id: rede.tenantId, name: `${PREFIXO} Proc ${chave} ${marca}`, category: categoria, duration_min: 30, price: 100,
    }).select('id').single<{ id: string }>()
    expect(r.error, `procedimento ${chave}`).toBeNull()
    procs[chave] = r.data!.id
  }
})
test.afterAll(async () => {
  await gestor?.limpar(); await soVe?.limpar()
  if (rede) await db().from('procedure_categories').delete().eq('tenant_id', rede.tenantId)
  await rede?.limpar()
})

async function como(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

const vocabulario = async () => ((await db().from('procedure_categories').select('nome, arquivada_em').eq('tenant_id', rede.tenantId)).data ?? []) as
  { nome: string; arquivada_em: string | null }[]
const categoriaDe = async (chave: string) => (await db().from('procedures').select('category').eq('id', procs[chave]!).single()).data!.category as string

test('a rede nova nasce com as quinze, e a categoria gravada em qualquer lugar entra sozinha', async () => {
  const nomes = (await vocabulario()).map(c => c.nome)
  expect(nomes).toEqual(expect.arrayContaining(['Toxina botulínica', 'Preenchimento', 'Fios', 'Peeling', 'Outros', FACIAL]))
  expect(nomes.filter(n => n.toLowerCase() === 'peeling'), 'sem caixa: "peeling" é "Peeling"').toHaveLength(1)
})

test('Procedimentos → Categorias: mostra o uso, cria, renomeia em todos os procedimentos e arquiva', async ({ browser }) => {
  await como(browser, gestor, async p => {
    await p.goto('/admin/procedures')
    await p.getByRole('button', { name: /Categorias/ }).click()
    const janela = p.getByRole('dialog', { name: 'Categorias de procedimento' })
    await expect(janela.locator(`[data-categoria="${FACIAL}"]`)).toContainText('2 procedimentos')

    await janela.getByLabel('Nova categoria').fill(HARMONIZACAO)
    await janela.getByRole('button', { name: 'Criar categoria' }).click()
    await expect(janela.locator(`[data-categoria="${HARMONIZACAO}"]`)).toContainText('nenhum procedimento')

    const facial = janela.locator(`[data-categoria="${FACIAL}"]`)
    await facial.getByRole('button', { name: 'Renomear' }).click()
    await facial.getByLabel('Novo nome').fill(ROSTO)
    await facial.getByRole('button', { name: 'Salvar' }).click()
    await expect(janela.locator(`[data-categoria="${ROSTO}"]`)).toContainText('2 procedimentos')
    await expect(janela.locator(`[data-categoria="${FACIAL}"]`)).toHaveCount(0)

    await janela.locator('[data-categoria="Fios"]').getByRole('button', { name: 'Arquivar' }).click()
    await expect(janela.locator('[data-categoria="Fios"]')).toContainText('Arquivada')
  })
  expect(await categoriaDe('A')).toBe(ROSTO)
  expect(await categoriaDe('B')).toBe(ROSTO)
  const voc = await vocabulario()
  expect(voc.map(c => c.nome)).not.toContain(FACIAL)
  expect(voc.find(c => c.nome === 'Fios')?.arquivada_em).toBeTruthy()
})

test('o cadastro oferece as ativas — e o procedimento mantém a sua, mesmo arquivada', async ({ browser }) => {
  await como(browser, gestor, async p => {
    await p.goto('/admin/procedures')
    await p.getByRole('button', { name: 'Novo procedimento' }).first().click()
    const novo = p.locator('dialog[open] select[name="category"]')
    await expect(novo.locator('option', { hasText: HARMONIZACAO })).toHaveCount(1)
    await expect(novo.locator('option', { hasText: ROSTO })).toHaveCount(1)
    await expect(novo.locator('option', { hasText: /^Fios$/ })).toHaveCount(0)
    await p.keyboard.press('Escape')

    await p.locator('tr', { hasText: `${PREFIXO} Proc Fios ${marca}` }).getByRole('button', { name: 'Editar' }).click()
    await expect(p.locator('dialog[open] select[name="category"]')).toHaveValue('Fios')
  })
})

test('quem só vê procedimentos não mexe nas categorias (nem pela action direta)', async ({ browser }) => {
  await como(browser, soVe, async p => {
    await p.goto('/admin/procedures')
    await expect(p.getByRole('heading', { name: 'Procedimentos' })).toBeVisible()
    await expect(p.getByRole('button', { name: /Categorias/ })).toHaveCount(0)
    const r = await chamarAcao(p, 'actions/categorias-de-procedimento.ts', 'criarCategoriaDeProcedimento', '/admin/procedures', [`${PREFIXO} Furo ${marca}`])
    expect(r.texto).not.toContain('"ok":true')
  })
  expect((await vocabulario()).map(c => c.nome)).not.toContain(`${PREFIXO} Furo ${marca}`)
})
