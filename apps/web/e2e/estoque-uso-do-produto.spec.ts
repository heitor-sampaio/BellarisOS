import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * O USO do produto (D-6, decisão do Heitor, 2026-10-29): "o cadastro do
 * produto diz o uso: Insumo, Revenda ou Os dois. O insumo aparece no
 * atendimento, e a revenda na venda de produto."
 *
 * Era um liga/desliga "Produto para venda direta ao cliente" que só abria o
 * preço de venda; nada lia esse sinal. Agora `products.uso` (INSUMO | REVENDA |
 * AMBOS): a revenda pede o preço de venda, e o insumo de revenda NÃO aparece
 * para escolher como insumo de procedimento. Os produtos que já existiam
 * herdaram o uso do que tinham: com preço de venda, "Os dois" (continuam no
 * atendimento e passam a poder ser vendidos); sem, "Insumo".
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let gestor: MembroDeTeste | null = null
const revenda = `${PREFIXO} Sérum revenda ${marca}`
const insumo  = `${PREFIXO} Luva insumo ${marca}`
const ambos   = `${PREFIXO} Ácido os dois ${marca}`

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: gestor!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

async function novoProduto(p: Page, nome: string, uso: 'Insumo' | 'Revenda' | 'Os dois', preco?: string) {
  await p.goto('/admin/estoque')
  await expect(async () => {
    await p.getByRole('button', { name: 'Novo produto' }).click({ timeout: 1000 })
    await expect(p.locator('dialog[open]').locator('input[name="name"]')).toBeVisible({ timeout: 1000 })
  }).toPass()
  const modal = p.locator('dialog[open]')
  await modal.locator('input[name="name"]').fill(nome)
  await modal.getByRole('group', { name: 'Uso do produto' }).getByRole('button', { name: uso, exact: true }).click()
  if (preco !== undefined) await modal.locator('input[name="sale_price"]').fill(preco)
  return modal
}

async function produto(nome: string) {
  const { data, error } = await db().from('products').select('uso, sale_price').eq('name', nome).maybeSingle<{ uso: string; sale_price: number | null }>()
  expect(error).toBeNull()
  return data ? { uso: data.uso, preco: data.sale_price === null ? null : Number(data.sale_price) } : null
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`uso${marca}`)
  gestor = await criarMembro(`usog${marca}`, {
    tenant: rede.tenantId, rotulo: 'Estoque e procedimentos',
    permissoes: [{ modulo: 'stock', nivel: 'MANAGE' }, { modulo: 'procedures', nivel: 'MANAGE' }],
  })
})
test.afterAll(async () => {
  const falhas: string[] = []
  if (rede) {
    const { data } = await db().from('products').select('id').eq('tenant_id', rede.tenantId)
    const ids = (data ?? []).map(p => p.id as string)
    if (ids.length) {
      for (const t of ['product_batches', 'stock_movements', 'branch_product_stock']) {
        const r = await db().from(t).delete().in('product_id', ids)
        if (r.error) falhas.push(`${t}: ${r.error.message}`)
      }
      const r = await db().from('products').delete().in('id', ids)
      if (r.error) falhas.push(`produtos: ${r.error.message}`)
    }
  }
  await gestor?.limpar(); await rede?.limpar()
  expect(falhas).toEqual([])
})

test.describe.serial('o uso do produto', () => {
  test('o cadastro pergunta o uso; a revenda pede o preço de venda', async ({ browser }) => {
    await como(browser, async p => {
      // Revenda sem preço: recusa.
      let modal = await novoProduto(p, revenda, 'Revenda')
      await modal.getByRole('button', { name: 'Criar produto' }).click()
      await expect(modal.getByText('Informe o preço de venda')).toBeVisible()
      await modal.locator('input[name="sale_price"]').fill('149')
      await modal.getByRole('button', { name: 'Criar produto' }).click()
      await expect.poll(() => produto(revenda)).toEqual({ uso: 'REVENDA', preco: 149 })

      // Insumo: sem preço de venda.
      modal = await novoProduto(p, insumo, 'Insumo')
      await expect(modal.locator('input[name="sale_price"]:not([type="hidden"])'), 'o insumo não pede preço de venda').toHaveCount(0)
      await modal.getByRole('button', { name: 'Criar produto' }).click()
      await expect.poll(() => produto(insumo)).toEqual({ uso: 'INSUMO', preco: null })

      // Os dois.
      modal = await novoProduto(p, ambos, 'Os dois', '80')
      await modal.getByRole('button', { name: 'Criar produto' }).click()
      await expect.poll(() => produto(ambos)).toEqual({ uso: 'AMBOS', preco: 80 })
    })
  })

  test('o produto só de revenda não se escolhe como insumo do procedimento', async ({ browser }) => {
    await como(browser, async p => {
      await p.goto('/admin/procedures')
      await p.getByRole('button', { name: 'Novo procedimento' }).first().click()
      const modal = p.locator('dialog[open]')
      await modal.getByRole('button', { name: 'Adicionar insumo' }).click()
      const opcoes = await modal.locator('select').filter({ has: p.locator('option', { hasText: insumo }) }).first().locator('option').allTextContents()
      expect(opcoes.some(o => o.includes(insumo)), 'o insumo').toBe(true)
      expect(opcoes.some(o => o.includes(ambos)), 'o de uso duplo').toBe(true)
      expect(opcoes.some(o => o.includes(revenda)), 'a revenda não é insumo').toBe(false)
    })
  })

  test('os produtos de antes herdaram o uso do preço de venda', async () => {
    const { count: comPrecoSoInsumo, error: e1 } = await db().from('products')
      .select('id', { count: 'exact', head: true }).not('sale_price', 'is', null).eq('uso', 'INSUMO')
    expect(e1).toBeNull()
    expect(comPrecoSoInsumo, 'quem tinha preço de venda não ficou só como insumo').toBe(0)
    const { count: semPrecoRevenda, error: e2 } = await db().from('products')
      .select('id', { count: 'exact', head: true }).is('sale_price', null).neq('uso', 'INSUMO')
    expect(e2).toBeNull()
    expect(semPrecoRevenda, 'revenda sem preço não existe').toBe(0)
  })
})
