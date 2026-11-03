import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcaoComFormulario } from './apoio/acao-direta'

/**
 * r2-ven-10 (o Heitor, revisão de 03/11: "deixar a clínica decidir,
 * flexibilidade"). A comissão da venda de produto pode ser:
 * - UMA regra sobre o total (como era): Configurações → Comissões → "Uma regra
 *   sobre o total";
 * - ou POR PRODUTO: cada produto com o seu percentual ou valor (por unidade),
 *   e o produto sem regra própria cai na regra geral.
 * A regra de cada produto se registra NO CADASTRO dele (o Heitor, 03/11: "se
 * cada produto pode ter uma comissão diferente, o que faz sentido é que em
 * cada produto se possa registrar uma comissão diferente"); Configurações
 * escolhe o modo e a regra geral, e mostra o resumo.
 * No kit, cada item comissiona pela sua regra, sobre a parte dele no vendido
 * (o desconto rateado). Numa rede [e2e] própria.
 */

test.describe.configure({ mode: 'serial' })

const marca = Date.now().toString(36)
const db = () => banco()
const n = (v: unknown) => Number(v ?? 0)
let rede: OutraRede | null = null
let dona: MembroDeTeste | null = null
let cliente = ''
let serum = '', protetor = '', mascara = ''
const nome = (r: string) => `${PREFIXO} ${r} cpp${marca}`

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: dona!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}
async function produto(rotulo: string, preco: number) {
  const p = await db().from('products').insert({ tenant_id: rede!.tenantId, name: nome(rotulo), unit: 'un', uso: 'REVENDA', sale_price: preco })
    .select('id').single<{ id: string }>()
  expect(p.error).toBeNull()
  expect((await db().rpc('estoque_entrada', {
    p_produto: p.data!.id, p_unidade: rede!.branchId, p_quantidade: 10, p_custo: 20, p_observacao: 'e2e', p_lote: null, p_validade: null, p_autor: 'e2e',
  })).error).toBeNull()
  return p.data!.id
}
/** O kit: 2 séruns (R$ 100), 1 protetor (R$ 90) e 1 máscara (R$ 50) — R$ 340, com R$ 34 de desconto (10%), no Pix. */
async function venderOKit() {
  const { data, error } = await db().rpc('produto_vender_itens', {
    p_tenant: rede!.tenantId, p_cliente: cliente, p_unidade: rede!.branchId, p_ator: dona!.userId, p_vendedor: rede!.professionalId,
    p_itens: [{ product_id: serum, quantity: 2 }, { product_id: protetor, quantity: 1 }, { product_id: mascara, quantity: 1 }],
    p_desconto: 34, p_lancamentos: [{ amount: 306, payment_method: 'PIX', is_paid: true }],
  })
  expect(error, 'vender o kit').toBeNull()
  return data as string
}
async function linhas(venda: string) {
  const { data, error } = await db().from('commission_lines').select('id, item, regra_tipo, regra_valor, preco').eq('product_sale_id', venda).order('item')
  expect(error).toBeNull()
  const out: { tipo: string; valor: number; base: number; devido: number }[] = []
  for (const l of data ?? []) {
    const { data: c } = await db().from('commissions').select('amount').eq('line_id', l.id)
    out.push({ tipo: String(l.regra_tipo), valor: n(l.regra_valor), base: n(l.preco), devido: Math.round((c ?? []).reduce((s, x) => s + n(x.amount), 0) * 100) / 100 })
  }
  return out
}

test.beforeAll(async () => {
  test.setTimeout(150_000)
  rede = await criarOutraRede(`cpp${marca}`)
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  cliente = await rede.criarCliente('Kit da comissão')
  serum = await produto('Sérum', 100)
  protetor = await produto('Protetor', 90)
  mascara = await produto('Máscara', 50)
  // A regra geral: 5% sobre o total.
  expect((await db().from('commission_configs').upsert({ tenant_id: rede.tenantId, modo: 'INTEGRAL', produto_pct: 5 }, { onConflict: 'tenant_id' })).error).toBeNull()
  dona = await criarMembro(`cppd${marca}`, { tenant: rede.tenantId, donoDaRede: true, permissoes: [] })
})

test.afterAll(async () => {
  const b = db()
  if (rede) {
    const { data: vs } = await b.from('product_sales').select('id').eq('tenant_id', rede.tenantId)
    const ids = (vs ?? []).map(v => v.id as string)
    if (ids.length) {
      await b.from('commission_lines').delete().in('product_sale_id', ids)
      await b.from('financial_transactions').update({ product_sale_id: null }).in('product_sale_id', ids)
      await b.from('product_sale_items').delete().in('sale_id', ids)
    }
    await b.from('financial_transactions').delete().eq('branch_id', rede.branchId)
    if (ids.length) await b.from('product_sales').delete().in('id', ids)
    for (const id of [serum, protetor, mascara].filter(Boolean)) {
      for (const t of ['product_batches', 'stock_movements', 'branch_product_stock']) await b.from(t).delete().eq('product_id', id)
      await b.from('domain_events').delete().eq('entidade_id', id)
      await b.from('products').delete().eq('id', id)
    }
    await b.from('commission_configs').delete().eq('tenant_id', rede.tenantId)
  }
  await dona?.limpar()
  await rede?.limpar()
})

test('uma regra sobre o total (como era): o kit gera UMA comissão, 5% do vendido', async () => {
  const venda = await venderOKit()
  expect(await linhas(venda)).toEqual([{ tipo: 'PERCENTAGE', valor: 5, base: 306, devido: 15.3 }])
})

/** Abre o cadastro do produto (Estoque → o lápis "Editar produto"). */
async function abrirOCadastro(p: Page, rotulo: string) {
  await p.goto('/admin/estoque')
  await p.getByRole('row').filter({ hasText: nome(rotulo) }).first().getByTitle('Editar produto').click()
  const modal = p.locator('dialog[open]').filter({ hasText: 'Editar produto' })
  await expect(modal).toBeVisible()
  return modal
}

test('com "uma regra sobre o total", o cadastro do produto diz isso e não oferece a comissão dele', async ({ browser }) => {
  await como(browser, async p => {
    const modal = await abrirOCadastro(p, 'Sérum')
    const comissao = modal.locator('[data-comissao-do-produto]')
    await expect(comissao).toContainText('uma regra sobre o total')
    await expect(comissao.getByRole('link', { name: /Configurações → Comissões/ })).toBeVisible()
    await expect(comissao.getByLabel('Valor da comissão')).toHaveCount(0)
  })
})

test('por produto: a dona escolhe em Configurações → Comissões, registra a comissão NO CADASTRO de cada produto, e cada item do kit comissiona pela sua regra (o sem regra, pela geral)', async ({ browser }) => {
  await como(browser, async p => {
    await p.goto('/admin/settings?tab=comissoes')
    const bloco = p.getByRole('group', { name: 'Comissão da venda de produto' })
    await bloco.getByRole('button', { name: 'Por produto' }).click()
    await p.getByRole('button', { name: 'Salvar', exact: true }).click()
    await expect(p.getByRole('status').filter({ hasText: 'Salvo.' }).first()).toBeVisible()
    // O Heitor (03/11): "em cada produto se possa registrar uma comissão
    // diferente". Configurações mostra só o resumo, com o caminho do cadastro.
    const lista = p.locator('[data-comissao-por-produto]')
    await expect(lista).toContainText(nome('Sérum'))
    await expect(lista.locator('[data-produto]', { hasText: nome('Máscara') })).toContainText('regra geral')
    await expect(lista.locator('input, select'), 'nada se edita aqui: um lugar só').toHaveCount(0)
    await expect(lista).toContainText('no cadastro do produto')

    // O sérum: 10% do vendido, no cadastro.
    let modal = await abrirOCadastro(p, 'Sérum')
    let comissao = modal.locator('[data-comissao-do-produto]')
    await expect(comissao).toContainText('regra geral (5%)')
    await comissao.getByLabel('Valor da comissão').fill('10')
    await modal.getByRole('button', { name: 'Salvar', exact: true }).click()
    await expect(modal).toBeHidden()
    // O protetor: R$ 3,00 por unidade.
    modal = await abrirOCadastro(p, 'Protetor')
    comissao = modal.locator('[data-comissao-do-produto]')
    await comissao.getByLabel('Tipo da comissão').selectOption('FIXED_AMOUNT')
    await comissao.getByLabel('Valor da comissão').fill('3,00')
    await modal.getByRole('button', { name: 'Salvar', exact: true }).click()
    await expect(modal).toBeHidden()
    // A máscara fica sem regra própria: vale a geral (5%).

    // O resumo de Configurações mostra o que o cadastro gravou.
    await p.goto('/admin/settings?tab=comissoes')
    await expect(p.locator('[data-comissao-por-produto] [data-produto]', { hasText: nome('Sérum') })).toContainText('10% do vendido')
    await expect(p.locator('[data-comissao-por-produto] [data-produto]', { hasText: nome('Protetor') })).toContainText('R$ 3,00 por unidade')
  })
  const { data: cfg } = await db().from('commission_configs').select('produto_modo').eq('tenant_id', rede!.tenantId).single()
  expect(cfg!.produto_modo).toBe('POR_PRODUTO')
  const { data: ps } = await db().from('products').select('id, comissao_tipo, comissao_valor').in('id', [serum, protetor, mascara])
  const de = (id: string) => ps!.find(x => x.id === id)!
  expect([de(serum).comissao_tipo, n(de(serum).comissao_valor)]).toEqual(['PERCENTAGE', 10])
  expect([de(protetor).comissao_tipo, n(de(protetor).comissao_valor)]).toEqual(['FIXED_AMOUNT', 3])
  expect(de(mascara).comissao_tipo).toBeNull()

  const venda = await venderOKit()
  // As partes do vendido (R$ 306 = R$ 340 − 10%): sérum R$ 180, protetor R$ 81, máscara R$ 45.
  expect(await linhas(venda)).toEqual([
    { tipo: 'PERCENTAGE', valor: 10, base: 180, devido: 18 },          // 10% do sérum
    { tipo: 'FIXED_AMOUNT', valor: 3, base: 81, devido: 3 },           // R$ 3 por protetor
    { tipo: 'PERCENTAGE', valor: 5, base: 45, devido: 2.25 },          // a máscara, pela geral
  ])

  // O estorno da venda devolve as três.
  expect((await db().rpc('produto_estornar_venda', { p_tenant: rede!.tenantId, p_venda: venda, p_ator: 'e2e', p_motivo: 'e2e', p_voltou: true })).error).toBeNull()
  expect((await linhas(venda)).map(l => l.devido)).toEqual([0, 0, 0])
})

/** O cadastro do sérum, regravado com uma comissão de 50% — como a tela mandaria. */
const camposComComissao = () => ({
  _productId: serum, name: nome('Sérum'), unit: 'un', uso: 'REVENDA', sale_price: '100',
  comissao: JSON.stringify({ tipo: 'PERCENTAGE', valor: 50 }),
})

test('quem não muda comissão não grava a do produto pelo cadastro: a gerente de unidade fixa (H7) e quem só cuida do estoque', async ({ browser }) => {
  const slug = (await db().from('branches').select('slug').eq('id', rede!.branchId).single<{ slug: string }>()).data!.slug
  const gerente = await criarMembro(`cppg${marca}`, {
    tenant: rede!.tenantId, branchId: rede!.branchId, rotulo: 'Gerente',
    permissoes: [{ modulo: 'financial', nivel: 'MANAGE' }, { modulo: 'stock', nivel: 'MANAGE' }],
  })
  const estoquista = await criarMembro(`cppe${marca}`, {
    tenant: rede!.tenantId, rotulo: 'Estoque', permissoes: [{ modulo: 'stock', nivel: 'MANAGE' }],
  })
  try {
    for (const [quem, rota] of [[gerente, `/${slug}/estoque`], [estoquista, '/admin/estoque']] as const) {
      const ctx = await browser.newContext({ storageState: quem.estado })
      try {
        const p = await ctx.newPage()
        await p.goto(rota)
        // O cadastro não mostra a comissão a quem não a muda.
        await p.getByRole('row').filter({ hasText: nome('Sérum') }).first().getByTitle('Editar produto').click()
        await expect(p.locator('dialog[open]').filter({ hasText: 'Editar produto' })).toBeVisible()
        await expect(p.locator('dialog[open] [data-comissao-do-produto]')).toHaveCount(0)
        const r = await chamarAcaoComFormulario(p, 'actions/stock.ts', 'updateProduct', rota, [undefined], camposComComissao())
        expect(r.texto).toContain('Seu cargo não muda a comissão dos produtos.')
      } finally { await ctx.close() }
    }
  } finally { await gerente.limpar(); await estoquista.limpar() }
  const { data } = await db().from('products').select('comissao_valor').eq('id', serum).single()
  expect(n(data!.comissao_valor), 'nada mudou').toBe(10)
})
