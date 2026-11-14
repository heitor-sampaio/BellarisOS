import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'

/**
 * A34 da 8ª simulação (2026-11-06): não existia devolução de UMA unidade do
 * produto — era estornar a venda inteira e vender de novo, em três
 * lançamentos. Decidido pelo princípio 3: a devolução é POR LINHA, com o
 * estoque e o dinheiro proporcionais; no cartão vale o estorno inteiro
 * (r2-fin-03) — o pagamento todo volta e o que fica é lançado de novo, na
 * forma ORIGINAL já escolhida (A41, princípio 5).
 *
 * Numa rede [e2e] própria.
 */

test.describe.configure({ mode: 'serial' })

const marca = Date.now().toString(36)
const db = () => banco()
const n = (v: unknown) => Number(v)
let rede: OutraRede | null = null
let caixa: MembroDeTeste | null = null
let slug = ''
let cliente = ''
let serum = ''
let protetor = ''
let vendaPix = ''
const nomeSerum = `${PREFIXO} Sérum dev ${marca}`
const nomeProtetor = `${PREFIXO} Protetor dev ${marca}`

async function como<T>(browser: Browser, fn: (p: Page) => Promise<T>) {
  const ctx = await browser.newContext({ storageState: caixa!.estado })
  try { return await fn(await ctx.newPage()) } finally { await ctx.close() }
}
async function produto(nome: string, preco: number) {
  const p = await db().from('products').insert({ tenant_id: rede!.tenantId, name: nome, unit: 'un', uso: 'REVENDA', sale_price: preco })
    .select('id').single<{ id: string }>()
  expect(p.error).toBeNull()
  expect((await db().rpc('estoque_entrada', {
    p_produto: p.data!.id, p_unidade: rede!.branchId, p_quantidade: 5, p_custo: 40, p_observacao: 'e2e', p_lote: null, p_validade: null, p_autor: 'e2e',
  })).error).toBeNull()
  return p.data!.id
}
const saldo = async (id: string) => n((await db().from('branch_product_stock').select('current_stock')
  .eq('product_id', id).eq('branch_id', rede!.branchId).single()).data!.current_stock)

async function vender(p: Page, itens: { produtoId: string; quantidade: number }[], pagamento: Record<string, unknown>) {
  const rota = `/${slug}/clients/${cliente}`
  await p.goto(rota)
  const r = await chamarAcao(p, 'actions/produtos.ts', 'venderProduto', `/${slug}/pdv`,
    [cliente, itens, rede!.branchId, null, pagamento, null, null, { vendedorId: caixa!.userId }])
  expect(r.texto, 'vender').toContain('"vendaId"')
  const { data } = await db().from('product_sales').select('id').eq('tenant_id', rede!.tenantId)
    .order('created_at', { ascending: false }).limit(1).single<{ id: string }>()
  return data!.id
}

test.beforeAll(async () => {
  test.setTimeout(120_000)
  rede = await criarOutraRede(`vdp${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  cliente = await rede.criarCliente('Devolve')
  serum = await produto(nomeSerum, 100)
  protetor = await produto(nomeProtetor, 90)
  expect((await db().from('commission_configs').upsert({ tenant_id: rede.tenantId, modo: 'INTEGRAL', produto_pct: 10 }, { onConflict: 'tenant_id' })).error).toBeNull()
  caixa = await criarMembro(`vdp${marca}`, {
    tenant: rede.tenantId, rotulo: 'Caixa',
    permissoes: [{ modulo: 'cashier', nivel: 'MANAGE' }, { modulo: 'financial', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'MANAGE' }],
  })
})

test.afterAll(async () => {
  await caixa?.limpar()
  await rede?.limpar()
})

test('A34: devolver 1 de 2 séruns pagos no Pix — o estoque volta 1, o Pix fica com o resto e o estorno parcial leva R$ 100', async ({ browser }) => {
  test.setTimeout(120_000)
  await como(browser, async p => {
    vendaPix = await vender(p, [{ produtoId: serum, quantidade: 2 }, { produtoId: protetor, quantidade: 1 }], { forma: 'AVISTA', metodo: 'PIX' })
    expect(await saldo(serum)).toBe(3)

    await p.goto(`/${slug}/financeiro?aba=movimentacoes`)
    const linha = p.locator('tr', { hasText: `2× ${nomeSerum}` }).first()
    await linha.getByTitle('Estornar').click()
    const janela = p.getByRole('dialog', { name: 'Estornar esta venda de produto?' })
    await janela.getByRole('button', { name: 'Devolver só parte da venda' }).click()

    const parte = p.getByRole('dialog', { name: 'Devolver parte da venda' })
    await expect(parte.locator('[data-devolver-parte]')).toBeVisible()
    await parte.getByLabel(`Quantas de ${nomeSerum} voltam`).selectOption('1')
    await parte.getByRole('radio', { name: /Sim, voltou ao estoque/ }).check()
    // A conta do banco: 1 sérum de R$ 100 volta; a venda passa a valer R$ 190.
    await expect(parte.locator('[data-a-devolver]')).toContainText('R$ 100,00')
    await expect(parte.locator('[data-conta-da-devolucao]')).toContainText('R$ 190,00')
    await parte.getByRole('radio', { name: /^Estorno/ }).first().check()
    await parte.getByRole('radio', { name: /Estorno parcial/ }).check()
    await parte.getByLabel('Motivo da devolução *').fill('A cliente devolveu um sérum lacrado')
    await parte.getByRole('button', { name: 'Devolver' }).click()
    await expect(parte).toBeHidden({ timeout: 20_000 })
  })

  expect(await saldo(serum), 'voltou 1 sérum').toBe(4)
  expect(await saldo(protetor), 'o protetor não se mexeu').toBe(4)
  const { data: txs } = await db().from('financial_transactions').select('type, category, amount, notes, payment_method, description')
    .eq('branch_id', rede!.branchId).order('created_at')
  const pix = (txs ?? []).find(t => t.type === 'INCOME' && t.category === 'Venda de produto')
  expect(n(pix!.amount), 'o Pix fica com o que a venda vale').toBe(190)
  expect(pix!.notes).not.toBe('Estornada')
  const parcial = (txs ?? []).find(t => t.category === 'Estorno')
  expect(n(parcial!.amount)).toBe(100)
  expect(parcial!.payment_method).toBe('PIX')
  const { data: venda } = await db().from('product_sales').select('estornada_em, valor_devolvido, custo_devolvido, unidades_devolvidas').eq('id', vendaPix).single()
  expect(venda!.estornada_em, 'a venda continua viva').toBeNull()
  expect(n(venda!.valor_devolvido)).toBe(100)
  expect(n(venda!.custo_devolvido)).toBe(40)
  expect(n(venda!.unidades_devolvidas)).toBe(1)
  // As Vendas e a comissão seguem o que a venda vale agora.
  const { data: vs } = await db().rpc('metrics_vendas', {
    p_tenant: rede!.tenantId, p_branch_ids: null, p_from: new Date(Date.now() - 86_400_000).toISOString(), p_to: new Date(Date.now() + 86_400_000).toISOString(),
  })
  const v = (vs as { id: string; valor: number; quantidade: number }[]).find(x => x.id === vendaPix)
  expect(n(v!.valor)).toBe(190)
  expect(n(v!.quantidade)).toBe(2)
  const { data: linhas } = await db().from('commission_lines').select('id').eq('product_sale_id', vendaPix)
  const { data: extrato } = await db().from('commissions').select('amount').in('line_id', (linhas ?? []).map(l => l.id))
  expect((extrato ?? []).reduce((s, e) => s + n(e.amount), 0), '10% de R$ 190').toBeCloseTo(19, 2)
})

test('A34 + A41: no cartão, o pagamento volta inteiro e o que fica é lançado de novo — a forma já vem a original (Crédito 3x)', async ({ browser }) => {
  test.setTimeout(120_000)
  let venda = ''
  await como(browser, async p => {
    venda = await vender(p, [{ produtoId: serum, quantidade: 2 }], { forma: 'AVISTA', metodo: 'CREDIT_CARD', vezes: 3 })
    await p.goto(`/${slug}/financeiro?aba=movimentacoes`)
    const linha = p.locator('tr', { hasText: `2× ${nomeSerum}` }).filter({ hasText: /Crédito 3x/ }).first()
    await linha.getByTitle('Estornar').click()
    await p.getByRole('dialog', { name: 'Estornar esta venda de produto?' }).getByRole('button', { name: 'Devolver só parte da venda' }).click()
    const parte = p.getByRole('dialog', { name: 'Devolver parte da venda' })
    await parte.getByLabel(`Quantas de ${nomeSerum} voltam`).selectOption('1')
    await parte.getByRole('radio', { name: /Não voltou/ }).check()
    await parte.getByRole('radio', { name: /^Estorno/ }).first().check()
    // No cartão, o inteiro vem escolhido — e a forma do que fica, a original.
    await expect(parte.getByRole('radio', { name: /Estornar o pagamento inteiro/ })).toBeChecked()
    await expect(parte.getByLabel('Forma do pagamento do usado')).toHaveValue('CREDIT_CARD')
    await expect(parte.getByLabel('Vezes no cartão')).toHaveValue('3')
    await parte.getByLabel('Motivo da devolução *').fill('Um veio aberto')
    await parte.getByRole('button', { name: 'Devolver' }).click()
    await expect(parte).toBeHidden({ timeout: 20_000 })
  })
  const { data: txs } = await db().from('financial_transactions').select('amount, notes, payment_method, cartao_vezes, category, is_paid')
    .eq('product_sale_id', venda).order('created_at')
  const vivos = (txs ?? []).filter(t => t.notes !== 'Estornada' && t.category !== 'Estorno')
  expect(vivos.map(t => [n(t.amount), t.payment_method, t.cartao_vezes])).toEqual([[100, 'CREDIT_CARD', 3]])
  expect((txs ?? []).some(t => t.notes === 'Estornada' && n(t.amount) === 200), 'o pagamento inteiro estornado').toBe(true)
  // Não voltou: o estoque fica, e o sérum devolvido entra nas perdas.
  expect(await saldo(serum)).toBe(2)
  const { data: perdas } = await db().rpc('metrics_perdas', {
    p_tenant: rede!.tenantId, p_branch_ids: null, p_from: new Date(Date.now() - 86_400_000).toISOString(), p_to: new Date(Date.now() + 86_400_000).toISOString(),
  })
  const linha = (perdas as { motivo: string; product_id: string | null; custo: number }[]).find(x => x.motivo === 'VENDA_ESTORNADA' && x.product_id === serum)
  expect(n(linha!.custo)).toBe(40)
})

test('A34: o estorno da venda inteira depois de uma devolução em parte devolve só o que ainda estava com a cliente', async ({ browser }) => {
  const { data: tx } = await db().from('financial_transactions').select('id')
    .eq('product_sale_id', vendaPix).eq('type', 'INCOME').neq('category', 'Estorno').single<{ id: string }>()
  await como(browser, async p => {
    await p.goto(`/${slug}/financeiro`)
    const r = await chamarAcao(p, 'actions/financial.ts', 'reverseTransaction', `/${slug}/financeiro`, [tx!.id, slug, 'Devolveu o resto', true])
    expect(r.texto).toContain('"success":true')
  })
  expect(await saldo(serum), 'volta só o sérum que ficou com ela (o já devolvido não volta de novo)').toBe(3)
  expect(await saldo(protetor)).toBe(5)
})
