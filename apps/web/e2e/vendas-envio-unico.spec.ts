import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao, chamarAcaoComFormulario } from './apoio/acao-direta'

/**
 * O envio que chega duas vezes grava uma vez só — no dinheiro, no estoque e nos
 * pontos (D10 da 5ª simulação; o Heitor: "use idempotência para todos os
 * cadastros e edições do sistema"; o mecanismo é o de `lib/envio-unico.ts`).
 * Cada caso manda o MESMO envio (a mesma chave) duas vezes AO MESMO TEMPO e
 * confere que gravou uma vez; o controle é um envio NOVO (outra chave), que
 * grava de novo. Numa rede [e2e] própria.
 */

test.describe.configure({ mode: 'serial' })

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let caixa: MembroDeTeste | null = null
let cliente = ''
let serum = ''
let insumo = ''
const hoje = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
const chave = () => crypto.randomUUID()
const PIX = { forma: 'AVISTA', metodo: 'PIX' }

async function como<T>(browser: Browser, fn: (p: Page) => Promise<T>) {
  const ctx = await browser.newContext({ storageState: caixa!.estado })
  try { return await fn(await ctx.newPage()) } finally { await ctx.close() }
}
const contar = async (tabela: string, filtro: Record<string, string>) => {
  let q = db().from(tabela).select('id', { count: 'exact', head: true })
  for (const [k, v] of Object.entries(filtro)) q = q.eq(k, v)
  const { count, error } = await q
  expect(error).toBeNull()
  return count ?? 0
}

test.beforeAll(async () => {
  test.setTimeout(120_000)
  rede = await criarOutraRede(`eu${marca}`)
  cliente = await rede.criarCliente('Envio único')
  expect((await db().from('procedures').update({ price: 300 }).eq('id', rede.procedureId)).error).toBeNull()
  const p1 = await db().from('products').insert({ tenant_id: rede.tenantId, name: `${PREFIXO} Sérum eu ${marca}`, unit: 'un', uso: 'REVENDA', sale_price: 100 })
    .select('id').single<{ id: string }>()
  expect(p1.error).toBeNull()
  serum = p1.data!.id
  const p2 = await db().from('products').insert({ tenant_id: rede.tenantId, name: `${PREFIXO} Insumo eu ${marca}`, unit: 'un', uso: 'INSUMO' })
    .select('id').single<{ id: string }>()
  expect(p2.error).toBeNull()
  insumo = p2.data!.id
  expect((await db().rpc('estoque_entrada', {
    p_produto: serum, p_unidade: rede.branchId, p_quantidade: 10, p_custo: 40, p_observacao: 'e2e', p_lote: null, p_validade: null, p_autor: 'e2e',
  })).error).toBeNull()
  expect((await db().from('loyalty_configs').upsert({ tenant_id: rede.tenantId, enabled: true, earn_mode: 'POR_REAL', points_per_real: 1 }, { onConflict: 'tenant_id' })).error).toBeNull()
  caixa = await criarMembro(`eu${marca}`, {
    tenant: rede.tenantId, rotulo: 'Caixa e estoque',
    permissoes: [
      { modulo: 'cashier', nivel: 'MANAGE' }, { modulo: 'financial', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'MANAGE' },
      { modulo: 'loyalty', nivel: 'MANAGE' }, { modulo: 'stock', nivel: 'MANAGE' },
    ],
  })
})

test.afterAll(async () => {
  const falhas: string[] = []
  const b = db()
  const anote = (oQue: string, r: { error: { message: string } | null }) => { if (r.error) falhas.push(`${oQue}: ${r.error.message}`) }
  if (rede) {
    const { data: vp } = await b.from('product_sales').select('id').eq('tenant_id', rede.tenantId)
    const idsP = (vp ?? []).map(v => v.id as string)
    const { data: vs } = await b.from('procedure_sales').select('id').eq('tenant_id', rede.tenantId)
    const idsS = (vs ?? []).map(v => v.id as string)
    if (idsP.length) {
      anote('comissão do produto', await b.from('commission_lines').delete().in('product_sale_id', idsP))
      anote('lançamento do produto', await b.from('financial_transactions').update({ product_sale_id: null }).in('product_sale_id', idsP))
    }
    if (idsS.length) {
      anote('comissão do pré-pago', await b.from('commission_lines').update({ procedure_sale_id: null }).in('procedure_sale_id', idsS))
      anote('lançamento do pré-pago', await b.from('financial_transactions').update({ procedure_sale_id: null }).in('procedure_sale_id', idsS))
    }
    const { data: txs } = await b.from('financial_transactions').select('id').eq('branch_id', rede.branchId)
    const txIds = (txs ?? []).map(t => t.id as string)
    if (txIds.length) anote('pontos do lançamento', await b.from('loyalty_transactions').delete().in('transaction_id', txIds))
    const { data: conta } = await b.from('loyalty_accounts').select('id').eq('client_id', cliente).maybeSingle()
    if (conta) anote('pontos', await b.from('loyalty_transactions').delete().eq('loyalty_account_id', conta.id))
    anote('lançamentos', await b.from('financial_transactions').delete().eq('branch_id', rede.branchId))
    if (idsP.length) anote('vendas de produto', await b.from('product_sales').delete().in('id', idsP))
    if (idsS.length) anote('vendas de pré-pago', await b.from('procedure_sales').delete().in('id', idsS))
    anote('créditos', await b.from('internal_credits').delete().eq('client_id', cliente))
    for (const id of [serum, insumo].filter(Boolean)) {
      for (const t of ['product_batches', 'stock_movements', 'branch_product_stock']) anote(t, await b.from(t).delete().eq('product_id', id))
      await b.from('domain_events').delete().eq('entidade_id', id)
      anote('produto', await b.from('products').delete().eq('id', id))
    }
    await b.from('envios_unicos').delete().eq('tenant_id', rede.tenantId)
    await b.from('loyalty_configs').delete().eq('tenant_id', rede.tenantId)
    await b.from('commission_configs').delete().eq('tenant_id', rede.tenantId)
  }
  await caixa?.limpar()
  await rede?.limpar()
  expect(falhas).toEqual([])
})

test('a venda de produto: o mesmo envio duas vezes ao mesmo tempo vende UMA vez', async ({ browser }) => {
  const rota = `/admin/clients/${cliente}`
  await como(browser, async p => {
    await p.goto(rota)
    const k = chave()
    const args = [cliente, serum, rede!.branchId, 1, PIX, null, k]
    const [a, b] = await Promise.all([1, 2].map(() => chamarAcao(p, 'actions/produtos.ts', 'venderProduto', rota, args)))
    expect(a!.texto + b!.texto).toContain('vendaId')
    expect(await contar('product_sales', { tenant_id: rede!.tenantId })).toBe(1)
    // Controle: um envio novo vende de novo.
    await chamarAcao(p, 'actions/produtos.ts', 'venderProduto', rota, [cliente, serum, rede!.branchId, 1, PIX, null, chave()])
    expect(await contar('product_sales', { tenant_id: rede!.tenantId })).toBe(2)
  })
})

test('a venda de procedimento pré-pago: o mesmo envio vende UMA vez', async ({ browser }) => {
  const rota = `/admin/clients/${cliente}`
  await como(browser, async p => {
    await p.goto(rota)
    const args = [cliente, rede!.procedureId, rede!.branchId, 1, null, PIX, null, chave()]
    await Promise.all([1, 2].map(() => chamarAcao(p, 'actions/pre-pago.ts', 'venderProcedimento', rota, args)))
    expect(await contar('procedure_sales', { tenant_id: rede!.tenantId })).toBe(1)
  })
})

test('o crédito interno: o mesmo envio concede UMA vez', async ({ browser }) => {
  const rota = `/admin/clients/${cliente}`
  await como(browser, async p => {
    await p.goto(rota)
    const campos = { client_id: cliente, branch_id: rede!.branchId, slug: '', amount: '50', description: `Cortesia ${marca}`, _envio: chave() }
    await Promise.all([1, 2].map(() => chamarAcaoComFormulario(p, 'actions/clients.ts', 'grantInternalCredit', rota, [null], campos)))
    expect(await contar('internal_credits', { client_id: cliente })).toBe(1)
  })
})

test('o lançamento manual: o mesmo envio lança UMA vez', async ({ browser }) => {
  const descricao = `${PREFIXO} Aluguel ${marca}`
  await como(browser, async p => {
    await p.goto('/admin/financeiro')
    const campos = {
      _branchId: rede!.branchId, _slug: '', type: 'EXPENSE', category: 'Aluguel', description: descricao, amount: '1200',
      payment_method: 'PIX', is_paid: 'true', paid_on: hoje(), due_date: hoje(), schedule_mode: 'single', notes: '', _envio: chave(),
    }
    const rs = await Promise.all([1, 2].map(() => chamarAcaoComFormulario(p, 'actions/financial.ts', 'createTransactionAdvanced', '/admin/financeiro', [undefined], campos)))
    expect(rs.map(r => r.texto).join('\n')).toContain('"success":true')
    expect(await contar('financial_transactions', { branch_id: rede!.branchId, description: descricao })).toBe(1)
  })
})

test('o ajuste de pontos: o mesmo envio ajusta UMA vez', async ({ browser }) => {
  const rota = `/admin/clients/${cliente}`
  await como(browser, async p => {
    await p.goto(rota)
    const entrada = { clientId: cliente, branchId: rede!.branchId, pontos: 70, motivo: `Cortesia ${marca}`, envio: chave() }
    await Promise.all([1, 2].map(() => chamarAcao(p, 'actions/fidelidade.ts', 'ajustarPontos', rota, [entrada])))
  })
  const { data: conta } = await db().from('loyalty_accounts').select('id').eq('client_id', cliente).single<{ id: string }>()
  const { data: lanc } = await db().from('loyalty_transactions').select('points').eq('loyalty_account_id', conta!.id).eq('points', 70)
  expect(lanc ?? []).toHaveLength(1)
})

test('a entrada e a perda de estoque: o mesmo envio movimenta UMA vez', async ({ browser }) => {
  await como(browser, async p => {
    await p.goto('/admin/estoque')
    const entrada = { productId: insumo, branchId: rede!.branchId, quantity: '5', unit_cost: '10', notes: `Compra ${marca}`, _envio: chave() }
    await Promise.all([1, 2].map(() => chamarAcaoComFormulario(p, 'actions/stock.ts', 'adminAddStock', '/admin/estoque', [undefined], entrada)))
    expect(await contar('stock_movements', { product_id: insumo })).toBe(1)
    const perda = { productId: insumo, branchId: rede!.branchId, quantity: '1', motivo: 'VENCIDO', notes: '', _envio: chave() }
    await Promise.all([1, 2].map(() => chamarAcaoComFormulario(p, 'actions/stock.ts', 'registrarPerda', '/admin/estoque', [undefined], perda)))
    expect(await contar('stock_movements', { product_id: insumo, type: 'LOSS' })).toBe(1)
  })
  const { data: saldo } = await db().from('branch_product_stock').select('current_stock').eq('product_id', insumo).eq('branch_id', rede!.branchId).single()
  expect(Number(saldo!.current_stock)).toBe(4)
})
