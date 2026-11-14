import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'

/**
 * O "Bloco: Estoque" do plano de adaptação (docs/revisao.md, 2026-11-14), numa
 * rede [e2e] própria de uma unidade. O Heitor, 13/11:
 *
 * - E1/E5: "Hoje o que é chamado de fornecedor vira marca. Adiciona cadastro de
 *   fornecedor, igual ao de marca." — três cadastros de texto livre:
 *   categorias, marcas e fornecedores.
 * - E4/E5: criar, renomear e excluir — "é só quem tem permissão de gerenciar,
 *   mesma regra para categoria, marca e fornecedor" (ser da rede deixa de contar).
 * - E6/E3: "Categoria, marca e fornecedor com lista e campo de busca com autocomplete."
 * - E2: "checkbox de onde o produto está disponivel (Insumo e Venda direta)".
 * - E10: "Não existe fornecedor de costume. Na entrada no estoque, escolhe
 *   fornecedor e marca." — o cadastro do produto não tem marca nem fornecedor.
 * - E14: a Entrada (e o estoque inicial) pede marca e fornecedor.
 * - E15: "Garanta que existam os 3 filtros: categorias, marca, fornecedores" —
 *   "o filtro de marca ou fornecedor mostra os produtos que tem alguma entrada
 *   dessa marca/fornecedor".
 */

test.setTimeout(240_000)

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede
let slug = ''
let gerente: MembroDeTeste
let quemVe: MembroDeTeste
let gel = ''
let luva = ''
const nomeGel = `${PREFIXO} Gel ${marca}`
const nomeLuva = `${PREFIXO} Luva ${marca}`
const nomeNovo = `${PREFIXO} Sérum novo ${marca}`
const rota = () => `/${slug}/estoque`

async function como(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado, viewport: { width: 1440, height: 900 } })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}
const linhaDo = (p: Page, nome: string) => p.getByRole('row').filter({ hasText: nome }).first()

const TABELA = { categorias: 'product_categories', marcas: 'marcas', fornecedores: 'fornecedores' } as const
const COLUNA = { categorias: 'name', marcas: 'nome', fornecedores: 'nome' } as const
type Lista = keyof typeof TABELA

async function itemDaLista(lista: Lista, nome: string): Promise<{ id: string } | null> {
  const { data, error } = await db().from(TABELA[lista]).select('id')
    .eq('tenant_id', rede.tenantId).eq(COLUNA[lista], nome).maybeSingle<{ id: string }>()
  expect(error, `${lista}: ${nome}`).toBeNull()
  return data
}
async function criarNaLista(lista: Lista, nome: string): Promise<string> {
  const { data, error } = await db().from(TABELA[lista]).insert({ tenant_id: rede.tenantId, [COLUNA[lista]]: nome })
    .select('id').single<{ id: string }>()
  expect(error, `${lista}: ${nome}`).toBeNull()
  return data!.id
}

test.use({ storageState: { cookies: [], origins: [] } })

test.beforeAll(async () => {
  rede = await criarOutraRede(`emf${marca}`)
  const b = db()
  expect((await b.from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  slug = (await b.from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  const produtos = await b.from('products').insert([
    { tenant_id: rede.tenantId, name: nomeGel, unit: 'un', cost_price: 10, uso: 'INSUMO', min_stock: 0 },
    { tenant_id: rede.tenantId, name: nomeLuva, unit: 'cx', cost_price: 10, uso: 'INSUMO', min_stock: 0 },
  ]).select('id, name')
  expect(produtos.error).toBeNull()
  gel = produtos.data!.find(p => p.name === nomeGel)!.id as string
  luva = produtos.data!.find(p => p.name === nomeLuva)!.id as string
  // Quem tem o Estoque em Gerenciar numa unidade só: antes, a "configuração da
  // clínica" (H7) a recusava nas categorias e na lista de fornecedores.
  gerente = await criarMembro(`emfg${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Estoque em Gerenciar', permissoes: [{ modulo: 'stock', nivel: 'MANAGE' }],
  })
  quemVe = await criarMembro(`emfv${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Estoque em Ver', permissoes: [{ modulo: 'stock', nivel: 'VIEW' }],
  })
})

test.afterAll(async () => {
  await gerente?.limpar(); await quemVe?.limpar(); await rede?.limpar()
})

test.describe.serial('marcas, fornecedores e categorias', () => {
  test('E4/E5: quem tem o Estoque em Gerenciar (de uma unidade) cria, renomeia e exclui as três listas — quem só vê, não', async ({ browser }) => {
    for (const lista of ['categorias', 'marcas', 'fornecedores'] as const) {
      const nome = `${PREFIXO} ${lista} ${marca}`
      await como(browser, gerente, async p => {
        const c = await chamarAcao(p, 'actions/stock.ts', 'criarItemDoEstoque', rota(), [lista, nome])
        expect(c.texto, `criar em ${lista}`).toContain('"id"')
        const item = await itemDaLista(lista, nome)
        expect(item, `${lista}: criado`).not.toBeNull()

        const r = await chamarAcao(p, 'actions/stock.ts', 'renomearItemDoEstoque', rota(), [lista, item!.id, `${nome} novo`])
        expect(r.texto, `renomear em ${lista}`).toContain('"success":true')
        expect(await itemDaLista(lista, `${nome} novo`), `${lista}: renomeado`).not.toBeNull()

        const e = await chamarAcao(p, 'actions/stock.ts', 'excluirItemDoEstoque', rota(), [lista, item!.id])
        expect(e.texto, `excluir em ${lista}`).toContain('"success":true')
        expect(await itemDaLista(lista, `${nome} novo`), `${lista}: excluído`).toBeNull()
      })

      // Quem só vê o Estoque não grava (o controle é o gerente, acima).
      const alvo = await criarNaLista(lista, `${nome} alvo`)
      await como(browser, quemVe, async p => {
        const c = await chamarAcao(p, 'actions/stock.ts', 'criarItemDoEstoque', rota(), [lista, `${nome} de quem vê`])
        expect(c.texto).not.toContain('"id"')
        const e = await chamarAcao(p, 'actions/stock.ts', 'excluirItemDoEstoque', rota(), [lista, alvo])
        expect(e.texto).not.toContain('"success":true')
      })
      expect(await itemDaLista(lista, `${nome} de quem vê`)).toBeNull()
      expect(await itemDaLista(lista, `${nome} alvo`)).not.toBeNull()
    }
  })

  test('E1/E5 e E4 na tela: Categorias, Marcas e Fornecedores ao lado, para quem tem Gerenciar — criar, renomear, excluir', async ({ browser }) => {
    const nome = `${PREFIXO} Marca da tela ${marca}`
    await como(browser, gerente, async p => {
      await p.goto(rota())
      for (const botao of ['Categorias', 'Marcas', 'Fornecedores']) {
        await expect(p.getByRole('button', { name: botao, exact: true }), botao).toBeVisible()
      }
      await p.getByRole('button', { name: 'Marcas', exact: true }).click()
      const janela = p.getByRole('dialog', { name: 'Marcas' })
      await janela.getByLabel('Nova marca').fill(nome)
      await janela.getByRole('button', { name: 'Adicionar' }).click()
      const linha = janela.locator(`[data-item-da-lista="${nome}"]`)
      await expect(linha).toBeVisible()

      await linha.getByRole('button', { name: `Renomear ${nome}` }).click()
      await janela.getByLabel(`Novo nome de ${nome}`).fill(`${nome} 2`)
      await janela.getByRole('button', { name: 'Salvar' }).click()
      const renomeada = janela.locator(`[data-item-da-lista="${nome} 2"]`)
      await expect(renomeada).toBeVisible()

      await renomeada.getByRole('button', { name: `Excluir ${nome} 2` }).click()
      await renomeada.getByRole('button', { name: 'Excluir', exact: true }).click()
      await expect(renomeada).toHaveCount(0)
    })
    expect(await itemDaLista('marcas', `${nome} 2`)).toBeNull()

    // Quem só vê: nenhum dos três botões.
    await como(browser, quemVe, async p => {
      await p.goto(rota())
      await expect(linhaDo(p, nomeGel)).toBeVisible()
      for (const botao of ['Categorias', 'Marcas', 'Fornecedores']) {
        await expect(p.getByRole('button', { name: botao, exact: true }), botao).toHaveCount(0)
      }
    })
  })

  test('E2, E6 e E10: o produto tem a categoria com busca, os checkboxes Insumo e Venda direta, e NÃO tem marca nem fornecedor; o estoque inicial pede os dois', async ({ browser }) => {
    const categoria = `${PREFIXO} Cosméticos ${marca}`
    const fornecedor = `${PREFIXO} Distribuidora ${marca}`
    const marcaNova = `${PREFIXO} Marca nova ${marca}`
    const catId = await criarNaLista('categorias', categoria)
    const fornId = await criarNaLista('fornecedores', fornecedor)
    await como(browser, gerente, async p => {
      await p.goto(rota())
      await expect(async () => {
        await p.getByRole('button', { name: 'Novo produto' }).first().click({ timeout: 1000 })
        await expect(p.locator('dialog[open]').locator('input[name="name"]')).toBeVisible({ timeout: 1000 })
      }).toPass()
      const modal = p.locator('dialog[open]')
      await modal.locator('input[name="name"]').fill(nomeNovo)

      // E10: sem fornecedor de costume, sem marca no produto.
      await expect(modal.getByText('Fornecedor de costume')).toHaveCount(0)
      await expect(modal.getByRole('combobox', { name: 'Marca' })).toHaveCount(0)
      await expect(modal.getByRole('combobox', { name: 'Fornecedor', exact: true })).toHaveCount(0)

      // E6: a categoria se acha pela busca (parte do nome, sem acento).
      await modal.getByRole('combobox', { name: 'Categoria' }).fill(`cosmeticos ${marca}`)
      await modal.getByRole('option', { name: categoria }).click()
      await expect(modal.locator('[data-campo-escolhido="Categoria"]')).toContainText(categoria)

      // E2: dois checkboxes; o produto novo nasce Insumo.
      const onde = modal.getByRole('group', { name: 'Onde o produto está disponível' })
      await expect(onde.getByRole('checkbox', { name: 'Insumo' })).toBeChecked()
      await onde.getByRole('checkbox', { name: 'Venda direta' }).check()
      await modal.locator('input[name="sale_price"]').fill('120')

      // E14 no estoque inicial: a marca (nova, ali mesmo) e o fornecedor (da lista).
      await modal.getByRole('switch', { name: /Adicionar estoque inicial/ }).click()
      await modal.locator('input[name="initial_qty"]').fill('3')
      await modal.getByRole('combobox', { name: 'Marca' }).fill(marcaNova)
      await modal.getByRole('option', { name: /Nova marca/ }).click()
      await expect(modal.locator('[data-campo-escolhido="Marca"]')).toContainText(marcaNova)
      await modal.getByRole('combobox', { name: 'Fornecedor', exact: true }).fill('distribuidora')
      await modal.getByRole('option', { name: fornecedor }).click()

      await modal.getByRole('button', { name: 'Criar produto' }).click()
      await expect(modal).toBeHidden()
    })
    const { data: prod, error } = await db().from('products').select('id, uso, sale_price, category_id')
      .eq('tenant_id', rede.tenantId).eq('name', nomeNovo).single<{ id: string; uso: string; sale_price: number; category_id: string }>()
    expect(error).toBeNull()
    expect({ uso: prod!.uso, preco: Number(prod!.sale_price), categoria: prod!.category_id }).toEqual({ uso: 'AMBOS', preco: 120, categoria: catId })
    const marcaId = (await itemDaLista('marcas', marcaNova))?.id
    expect(marcaId, 'a marca nova entrou na lista').toBeTruthy()
    const { data: mov } = await db().from('stock_movements').select('marca_id, fornecedor_id, marca, fornecedor')
      .eq('product_id', prod!.id).eq('type', 'PURCHASE').single<{ marca_id: string; fornecedor_id: string; marca: string; fornecedor: string }>()
    expect(mov).toEqual({ marca_id: marcaId, fornecedor_id: fornId, marca: marcaNova, fornecedor })
  })

  test('E2: só Venda direta grava REVENDA (o PDV a vende); nenhum dos dois é recusado', async ({ browser }) => {
    const soVenda = `${PREFIXO} Só venda ${marca}`
    await como(browser, gerente, async p => {
      await p.goto(rota())
      await p.getByRole('button', { name: 'Novo produto' }).first().click()
      const modal = p.locator('dialog[open]')
      await modal.locator('input[name="name"]').fill(soVenda)
      const onde = modal.getByRole('group', { name: 'Onde o produto está disponível' })
      await onde.getByRole('checkbox', { name: 'Insumo' }).uncheck()
      await modal.getByRole('button', { name: 'Criar produto' }).click()
      await expect(modal.getByText('Marque onde o produto está disponível')).toBeVisible()
      await onde.getByRole('checkbox', { name: 'Venda direta' }).check()
      await modal.locator('input[name="sale_price"]').fill('50')
      await modal.getByRole('button', { name: 'Criar produto' }).click()
      await expect(modal).toBeHidden()
    })
    const { data } = await db().from('products').select('uso').eq('tenant_id', rede.tenantId).eq('name', soVenda).single<{ uso: string }>()
    expect(data!.uso).toBe('REVENDA')
  })

  test('E14: a Entrada pede marca e fornecedor, e o Histórico os mostra', async ({ browser }) => {
    const m = `${PREFIXO} Marca da entrada ${marca}`
    const f = `${PREFIXO} Fornecedor da entrada ${marca}`
    const marcaId = await criarNaLista('marcas', m)
    const fornId = await criarNaLista('fornecedores', f)
    await como(browser, gerente, async p => {
      await p.goto(rota())
      await linhaDo(p, nomeGel).getByRole('button', { name: 'Entrada e perda' }).click()
      const modal = p.locator('dialog[open]').filter({ hasText: 'Gerenciar estoque' })
      await modal.locator('input[name="quantity"]').fill('4')
      await modal.getByRole('combobox', { name: 'Marca' }).fill('marca da entrada')
      await modal.getByRole('option', { name: m }).click()
      await modal.getByRole('combobox', { name: 'Fornecedor', exact: true }).fill('fornecedor da entrada')
      await modal.getByRole('option', { name: f }).click()
      await modal.getByRole('button', { name: /Registrar entrada/ }).click()
      await expect.poll(async () => (await db().from('stock_movements').select('marca_id, fornecedor_id')
        .eq('product_id', gel).eq('type', 'PURCHASE')).data).toEqual([{ marca_id: marcaId, fornecedor_id: fornId }])

      await p.goto(rota())
      await linhaDo(p, nomeGel).getByRole('button', { name: 'Entrada e perda' }).click()
      const de_novo = p.locator('dialog[open]').filter({ hasText: 'Gerenciar estoque' })
      await de_novo.getByRole('button', { name: 'Histórico' }).click()
      await expect(de_novo.getByText(m)).toBeVisible()
      await expect(de_novo.getByText(f)).toBeVisible()
    })
  })

  test('E15: os três filtros — categoria, marca e fornecedor; marca e fornecedor mostram quem teve alguma entrada deles', async ({ browser }) => {
    const mLuva = `${PREFIXO} Marca da luva ${marca}`
    const fLuva = `${PREFIXO} Fornecedor da luva ${marca}`
    await criarNaLista('marcas', mLuva)
    await criarNaLista('fornecedores', fLuva)
    const r = await db().rpc('estoque_entrada', {
      p_produto: luva, p_unidade: rede.branchId, p_quantidade: 2, p_custo: 10, p_observacao: null,
      p_lote: null, p_validade: null, p_autor: 'e2e', p_fornecedor: fLuva, p_nota_fiscal: null, p_marca: mLuva,
    })
    expect(r.error).toBeNull()
    await como(browser, gerente, async p => {
      await p.goto(rota())
      await expect(linhaDo(p, nomeLuva)).toBeVisible()
      await expect(linhaDo(p, nomeGel)).toBeVisible()

      await p.getByLabel('Filtrar por marca').selectOption({ label: mLuva })
      await expect(linhaDo(p, nomeLuva)).toBeVisible()
      await expect(p.getByRole('row').filter({ hasText: nomeGel })).toHaveCount(0)
      await p.getByLabel('Filtrar por marca').selectOption({ value: '' })

      await p.getByLabel('Filtrar por fornecedor').selectOption({ label: `${PREFIXO} Fornecedor da entrada ${marca}` })
      await expect(linhaDo(p, nomeGel)).toBeVisible()
      await expect(p.getByRole('row').filter({ hasText: nomeLuva })).toHaveCount(0)
      await p.getByLabel('Filtrar por fornecedor').selectOption({ value: '' })

      await p.getByLabel('Filtrar por categoria').selectOption({ label: `${PREFIXO} Cosméticos ${marca}` })
      await expect(linhaDo(p, nomeNovo)).toBeVisible()
      await expect(p.getByRole('row').filter({ hasText: nomeGel })).toHaveCount(0)
    })
  })
})
