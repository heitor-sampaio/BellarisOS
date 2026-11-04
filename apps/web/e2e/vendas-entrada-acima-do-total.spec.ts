import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'

/**
 * ven-02 da revisão das decisões (2026-11-02, "mudar"): a entrada maior que o
 * total era CORTADA calada — "o plano custa R$ 900 e a Bruna digita entrada de
 * R$ 1.000; grava R$ 900 sem dizer nada". Agora a tela avisa "a entrada passa
 * do total" junto do campo e não deixa seguir, e o servidor recusa com a mesma
 * frase ("regras de negócio devem ser sempre validadas em backend").
 * No checkout do plano e na venda da ficha. Numa rede [e2e] própria.
 */

test.describe.configure({ mode: 'serial' })

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let recepcao: MembroDeTeste | null = null
let slug = ''
let planId = ''
let cliente = ''
let produto = ''
const vence = () => new Date(Date.now() + 30 * 86_400_000).toISOString()

async function como<T>(browser: Browser, fn: (p: Page) => Promise<T>) {
  const ctx = await browser.newContext({ storageState: recepcao!.estado })
  try { return await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  test.setTimeout(120_000)
  rede = await criarOutraRede(`eat${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  const plano = await rede.criarPlanoProposto('Entrada', { semTermo: true })   // R$ 50,00
  planId = plano.planId
  cliente = plano.clientId
  const p = await db().from('products').insert({ tenant_id: rede.tenantId, name: `${PREFIXO} Sérum eat ${marca}`, unit: 'un', uso: 'REVENDA', sale_price: 100 })
    .select('id').single<{ id: string }>()
  expect(p.error).toBeNull()
  produto = p.data!.id
  expect((await db().rpc('estoque_entrada', {
    p_produto: produto, p_unidade: rede.branchId, p_quantidade: 5, p_custo: 40, p_observacao: 'e2e', p_lote: null, p_validade: null, p_autor: 'e2e',
  })).error).toBeNull()
  recepcao = await criarMembro(`eat${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Recepção',
    permissoes: [
      { modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'MANAGE' },
      { modulo: 'cashier', nivel: 'MANAGE' }, { modulo: 'financial', nivel: 'MANAGE' },
    ],
  })
})

test.afterAll(async () => {
  const b = db()
  if (rede) {
    const { data: vs } = await b.from('product_sales').select('id').eq('tenant_id', rede.tenantId)
    const ids = (vs ?? []).map(v => v.id as string)
    if (ids.length) {
      await b.from('commission_lines').delete().in('product_sale_id', ids)
      await b.from('financial_transactions').delete().in('product_sale_id', ids)
      await b.from('product_sales').delete().in('id', ids)
    }
    for (const t of ['product_batches', 'stock_movements', 'branch_product_stock']) await b.from(t).delete().eq('product_id', produto)
    await b.from('products').delete().eq('id', produto)
    await b.from('treatment_plans').delete().eq('branch_id', rede.branchId)
    await b.from('envios_unicos').delete().eq('tenant_id', rede.tenantId)
  }
  await recepcao?.limpar()
  await rede?.limpar()
})

test('checkout do plano: a entrada acima do total avisa junto do campo e não segue', async ({ browser }) => {
  await como(browser, async p => {
    await p.goto(`/${slug}/planejamentos/${planId}`)
    await p.getByRole('button', { name: 'Fechar checkout' }).click()
    const janela = p.getByRole('dialog', { name: 'Checkout' })
    await janela.getByRole('button', { name: /Confirmar plano/ }).click()
    await janela.getByRole('button', { name: 'Entrada + parcelas' }).click()
    await janela.getByLabel('Entrada').fill('60')
    await expect(janela.getByRole('alert').filter({ hasText: 'passa do total do plano' })).toContainText('R$ 50,00')
    // A37: a forma nasce vazia; escolhida, o que segura é a entrada.
    await janela.getByRole('button', { name: 'Pix', exact: true }).click()
    await janela.getByRole('button', { name: /Ir para a documentação/ }).click()
    await expect(janela.getByRole('button', { name: /Ir para a documentação/ }), 'continua no pagamento').toBeVisible()
  })
})

test('checkout do plano: o servidor recusa a entrada acima do total (e aceita a que cabe)', async ({ browser }) => {
  const rota = `/${slug}/planejamentos/${planId}`
  await como(browser, async p => {
    await p.goto(rota)
    const acima = await chamarAcao(p, 'actions/treatment-plans.ts', 'checkoutTreatmentPlan', rota,
      [planId, { forma: 'PARCELADO', metodo: 'PIX', entrada: 60, parcelas: 2, primeiroVencimento: vence() }, [], slug])
    expect(acima!.texto).toContain('passa do total do plano')
    const { data: nada } = await db().from('financial_transactions').select('id').eq('treatment_plan_id', planId)
    expect(nada ?? [], 'nenhum dinheiro gravado').toHaveLength(0)
    expect((await db().from('treatment_plans').select('status').eq('id', planId).single()).data!.status).toBe('PROPOSED')
    // Controle: a entrada que cabe fecha o plano.
    const cabe = await chamarAcao(p, 'actions/treatment-plans.ts', 'checkoutTreatmentPlan', rota,
      [planId, { forma: 'PARCELADO', metodo: 'PIX', entrada: 20, parcelas: 2, primeiroVencimento: vence() }, [], slug])
    expect(cabe!.texto).not.toContain('passa do total')
    expect((await db().from('treatment_plans').select('status').eq('id', planId).single()).data!.status).toBe('ACCEPTED')
  })
})

test('a venda da ficha: a entrada acima do total avisa, desliga o "Vender" e o servidor recusa', async ({ browser }) => {
  const rota = `/${slug}/clients/${cliente}`
  await como(browser, async p => {
    await p.goto(rota)
    await p.getByRole('button', { name: 'Vender' }).first().click()
    const janela = p.getByRole('dialog', { name: 'Vender' })
    const aba = janela.getByRole('button', { name: 'Produto' })
    if (await aba.count()) await aba.click()
    await janela.getByRole('button', { name: 'Entrada + parcelas' }).click()
    await janela.getByLabel('Entrada').fill('150')
    await expect(janela.getByRole('alert').filter({ hasText: 'passa do total da venda' })).toContainText('R$ 100,00')
    await expect(janela.getByRole('button', { name: /^Vender por/ })).toBeDisabled()

    const acima = await chamarAcao(p, 'actions/produtos.ts', 'venderProduto', rota,
      [cliente, produto, rede!.branchId, 1, { forma: 'PARCELADO', metodo: 'PIX', entrada: 150, parcelas: 2, primeiroVencimento: vence() }, null, null])
    expect(acima!.texto).toContain('passa do total da venda')
    const { count } = await db().from('product_sales').select('id', { count: 'exact', head: true }).eq('tenant_id', rede!.tenantId)
    expect(count, 'nenhuma venda').toBe(0)
  })
})
