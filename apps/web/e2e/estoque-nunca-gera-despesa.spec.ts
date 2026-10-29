import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * Movimentação de estoque NUNCA gera despesa (D13 revisto, decisão do Heitor,
 * 2026-10-28): "Movimentação de estoque, tanto entrada quanto saída, não gera
 * despesa. Os valores são informados apenas para base de cálculo de insumos,
 * custo, margem e lucro."
 *
 * Em 28/10 a "Entrada" (unidade e rede) tinha ganhado "Lançar o custo como
 * despesa paga hoje", marcada por padrão (1b54c531, `estoque_compra`), e o
 * cadastro do produto já a tinha no estoque inicial. As duas saem: a entrada
 * com custo grava o movimento (o custo vai em `unit_cost`, base do custo de
 * consumo e da margem) e nenhum `financial_transactions`. Saída, ajuste e
 * transferência também não.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let daRede: MembroDeTeste | null = null
let daUnidade: MembroDeTeste | null = null
let slug = ''
let produto = ''
let nome = ''
let segunda = ''

async function como(m: MembroDeTeste, browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}
async function abrirEntrada(p: Page, rota: string) {
  await p.goto(rota)
  await p.locator('tr, [role="row"], div').filter({ hasText: nome })
    .filter({ has: p.getByTitle('Gerenciar estoque') }).last()
    .getByTitle('Gerenciar estoque').click()
  const modal = p.locator('dialog[open]').filter({ hasText: 'Gerenciar estoque' })
  await modal.getByRole('button', { name: 'Entrada', exact: true }).click()
  return modal
}
/** Todo lançamento das unidades da rede: nenhuma movimentação cria um. */
async function lancamentos() {
  const { data, error } = await db().from('financial_transactions')
    .select('amount, type, category, description')
    .in('branch_id', [rede!.branchId, segunda].filter(Boolean))
  expect(error).toBeNull()
  return data ?? []
}
async function entradas() {
  const { data, error } = await db().from('stock_movements').select('quantity, unit_cost')
    .eq('product_id', produto).eq('type', 'PURCHASE').order('created_at')
  expect(error).toBeNull()
  return (data ?? []).map(d => ({ quantidade: Number(d.quantity), custo: d.unit_cost === null ? null : Number(d.unit_cost) }))
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`ng${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  produto = await rede.criarProduto('Toxina', 0)
  nome = (await db().from('products').select('name').eq('id', produto).single<{ name: string }>()).data!.name
  daRede = await criarMembro(`ngr${marca}`, {
    tenant: rede.tenantId, rotulo: 'Estoque da rede', permissoes: [{ modulo: 'stock', nivel: 'MANAGE' }],
  })
  daUnidade = await criarMembro(`ngu${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Estoque da unidade', permissoes: [{ modulo: 'stock', nivel: 'MANAGE' }],
  })
})

test.afterAll(async () => {
  const falhas: string[] = []
  const unidades = [rede?.branchId, segunda].filter(Boolean) as string[]
  if (rede) {
    // Só para não deixar sobra se a regra quebrar: o esperado é não haver nenhum.
    const r = await db().from('financial_transactions').delete().in('branch_id', unidades)
    if (r.error) falhas.push(`lançamentos: ${r.error.message}`)
    const { data } = await db().from('products').select('id').eq('tenant_id', rede.tenantId).neq('id', produto)
    const outros = (data ?? []).map(p => p.id as string)
    const ids = [produto, ...outros]
    for (const tabela of ['product_batches', 'stock_movements', 'branch_product_stock']) {
      const d = await db().from(tabela).delete().in('product_id', ids)
      if (d.error) falhas.push(`${tabela}: ${d.error.message}`)
    }
    if (outros.length) {
      const d = await db().from('products').delete().in('id', outros)
      if (d.error) falhas.push(`produtos: ${d.error.message}`)
    }
    if (segunda) {
      const d = await db().from('branches').delete().eq('id', segunda)
      if (d.error) falhas.push(`segunda unidade: ${d.error.message}`)
    }
  }
  await daRede?.limpar()
  await daUnidade?.limpar()
  await rede?.limpar()
  expect(falhas).toEqual([])
})

test.describe('movimentação de estoque nunca gera despesa', () => {
  test('na rede: a Entrada com custo não oferece despesa e não lança nada', async ({ browser }) => {
    const e0 = (await entradas()).length
    await como(daRede!, browser, async p => {
      const modal = await abrirEntrada(p, '/admin/estoque')
      await modal.locator('select[name="branchId"]').first().selectOption(rede!.branchId)
      await modal.locator('input[name="quantity"]').first().fill('2')
      await modal.locator('input[name="unit_cost"]').fill('300')
      await expect(modal.getByText(/despesa/i)).toHaveCount(0)
      await modal.getByRole('button', { name: 'Registrar entrada' }).click()
      await expect(modal).toBeHidden()
    })
    expect((await entradas()).slice(e0), 'a entrada grava, com o custo').toEqual([{ quantidade: 2, custo: 300 }])
    expect(await lancamentos(), 'nenhum lançamento').toEqual([])
  })

  test('na unidade: a Entrada com custo não oferece despesa e não lança nada', async ({ browser }) => {
    const e0 = (await entradas()).length
    await como(daUnidade!, browser, async p => {
      const modal = await abrirEntrada(p, `/${slug}/estoque`)
      await modal.locator('input[name="quantity"]').first().fill('1')
      await modal.locator('input[name="unit_cost"]').fill('900')
      await expect(modal.getByText(/despesa/i)).toHaveCount(0)
      await modal.getByRole('button', { name: 'Registrar entrada' }).click()
      await expect(modal).toBeHidden()
    })
    expect((await entradas()).slice(e0)).toEqual([{ quantidade: 1, custo: 900 }])
    expect(await lancamentos()).toEqual([])
  })

  test('o estoque inicial do cadastro, com custo, também não lança despesa', async ({ browser }) => {
    const novo = `${PREFIXO} Pelo cadastro ${marca}`
    await como(daUnidade!, browser, async p => {
      await p.goto(`/${slug}/estoque`)
      await expect(async () => {
        await p.getByRole('button', { name: 'Novo produto' }).click({ timeout: 1000 })
        await expect(p.getByRole('switch', { name: /Adicionar estoque inicial/ })).toBeVisible({ timeout: 1000 })
      }).toPass()
      const modal = p.locator('dialog[open]')
      await modal.locator('input[name="name"]').fill(novo)
      await modal.locator('select[name="unit"]').selectOption({ index: 1 })
      await modal.getByRole('switch', { name: /Adicionar estoque inicial/ }).click()
      await modal.locator('input[name="initial_qty"]').fill('3')
      await modal.locator('input[name="initial_cost"]').fill('10')
      await expect(modal.getByRole('checkbox', { name: /despesa/i })).toHaveCount(0)
      await modal.getByRole('button', { name: 'Criar produto' }).click()
      await expect.poll(async () => (await db().from('products').select('id').eq('name', novo)).data?.length ?? 0).toBe(1)
    })
    const { data: prod } = await db().from('products').select('id').eq('name', novo).single<{ id: string }>()
    await expect.poll(async () => (await db().from('branch_product_stock').select('current_stock').eq('product_id', prod!.id).maybeSingle()).data?.current_stock).toBe(3)
    expect(await lancamentos()).toEqual([])
  })

  test('saída, ajuste e transferência não lançam nada — e estoque_compra não existe mais', async () => {
    const { data: b, error: eB } = await db().from('branches')
      .insert({ tenant_id: rede!.tenantId, name: `${PREFIXO} Segunda ${marca}`, slug: `e2e-ng2-${marca}` })
      .select('id').single<{ id: string }>()
    expect(eB).toBeNull()
    segunda = b!.id

    const entrada = await db().rpc('estoque_entrada', {
      p_produto: produto, p_unidade: rede!.branchId, p_quantidade: 5, p_custo: 120, p_observacao: 'e2e',
      p_lote: null, p_validade: null, p_autor: 'e2e',
    })
    expect(entrada.error).toBeNull()
    const ajuste = await db().rpc('estoque_ajuste', {
      p_produto: produto, p_unidade: rede!.branchId, p_novo_saldo: 4, p_motivo: 'Perda: frasco quebrado', p_autor: 'e2e',
    })
    expect(ajuste.error, 'perda pelo ajuste').toBeNull()
    const transf = await db().rpc('estoque_transferir', {
      p_produto: produto, p_origem: rede!.branchId, p_destino: segunda, p_quantidade: 2, p_observacao: 'e2e', p_autor: 'e2e',
    })
    expect(transf.error, 'transferência').toBeNull()

    expect(await lancamentos(), 'nenhum lançamento em unidade nenhuma').toEqual([])

    const compra = await db().rpc('estoque_compra', {
      p_produto: produto, p_unidade: rede!.branchId, p_quantidade: 1, p_custo: 10, p_observacao: null,
      p_lote: null, p_validade: null, p_autor: 'e2e', p_despesa: true, p_descricao: 'x',
    })
    expect(compra.error?.code, 'a função da despesa saiu').toBe('PGRST202')
  })
})
