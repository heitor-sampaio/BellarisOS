import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'
import { euVendi, pagoNoPix } from './apoio/vender'

/**
 * A VENDA DE PRODUTO (D4, decisão do Heitor, 2026-10-29): "Produto entra no
 * 'Vender' da ficha da cliente, com quantidade, desconto e forma de pagamento.
 * O estoque baixa pelo lote que vence primeiro. A venda vai para o caixa,
 * para as vendas e para o faturamento." Só produtos de REVENDA (D-6), exige
 * cliente cadastrada, sem estoque suficiente recusa, e os pontos são da
 * clínica decidir (Configurações → Fidelidade).
 *
 * Até aqui a única saída era o ajuste, que não gerava receita, pontos nem
 * caixa (D4 da 4ª simulação).
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let recepcao: MembroDeTeste | null = null
let dona: MembroDeTeste | null = null
let financeiro: MembroDeTeste | null = null
let cliente = ''
let serum = ''
let luva = ''
const nomeSerum = `${PREFIXO} Sérum ${marca}`
const nomeLuva  = `${PREFIXO} Luva ${marca}`
const emDias = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString()
const hojeBR = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
const n = (v: unknown) => Number(v)

async function como<T>(browser: Browser, fn: (p: Page) => Promise<T>) {
  const ctx = await browser.newContext({ storageState: recepcao!.estado })
  try { return await fn(await ctx.newPage()) } finally { await ctx.close() }
}
async function abrirVendaDeProduto(p: Page) {
  await p.goto(`/admin/clients/${cliente}`)
  await p.getByRole('button', { name: 'Vender', exact: true }).click()
  const dlg = p.getByRole('dialog', { name: 'Vender' })
  await dlg.getByRole('button', { name: 'Produto', exact: true }).click()
  return dlg
}
async function vendas() {
  const { data, error } = await db().from('product_sales')
    .select('id, quantity, preco_unitario, preco_tabela, desconto, price, custo, sold_by').eq('tenant_id', rede!.tenantId).order('sold_at')
  expect(error).toBeNull()
  return data ?? []
}
/** Os lançamentos de pontos da cliente (o extrato é da conta dela). */
async function pontos() {
  const { data: conta } = await db().from('loyalty_accounts').select('id').eq('client_id', cliente).maybeSingle()
  if (!conta) return []
  const { data, error } = await db().from('loyalty_transactions').select('points, kind').eq('loyalty_account_id', conta.id)
  expect(error).toBeNull()
  return data ?? []
}
async function lotes() {
  const { data } = await db().from('product_batches').select('batch_number, quantity').eq('product_id', serum).order('batch_number')
  return Object.fromEntries((data ?? []).map(l => [l.batch_number as string, n(l.quantity)]))
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`vp${marca}`)
  cliente = await rede.criarCliente('Ana')
  const p1 = await db().from('products').insert({
    tenant_id: rede.tenantId, name: nomeSerum, unit: 'un', uso: 'REVENDA', sale_price: 149,
  }).select('id').single<{ id: string }>()
  expect(p1.error).toBeNull()
  serum = p1.data!.id
  const p2 = await db().from('products').insert({ tenant_id: rede.tenantId, name: nomeLuva, unit: 'cx', uso: 'INSUMO' })
    .select('id').single<{ id: string }>()
  expect(p2.error).toBeNull()
  luva = p2.data!.id
  // Dois lotes do sérum: A vence em 30 dias (2 un a R$ 60), B em 90 (3 un a R$ 70).
  for (const [lote, qtd, custo, validade] of [['A', 2, 60, emDias(30)], ['B', 3, 70, emDias(90)]] as const) {
    const r = await db().rpc('estoque_entrada', {
      p_produto: serum, p_unidade: rede.branchId, p_quantidade: qtd, p_custo: custo, p_observacao: 'e2e',
      p_lote: lote, p_validade: validade, p_autor: 'e2e',
    })
    expect(r.error).toBeNull()
  }
  const r2 = await db().rpc('estoque_entrada', {
    p_produto: luva, p_unidade: rede.branchId, p_quantidade: 5, p_custo: 20, p_observacao: 'e2e', p_lote: null, p_validade: null, p_autor: 'e2e',
  })
  expect(r2.error).toBeNull()
  // A fidelidade ligada, por real pago; a venda de produto começa NÃO pontuando.
  const fid = await db().from('loyalty_configs').upsert({ tenant_id: rede.tenantId, enabled: true, earn_mode: 'POR_REAL', points_per_real: 1 }, { onConflict: 'tenant_id' })
  expect(fid.error).toBeNull()
  dona = await criarMembro(`vpd${marca}`, {
    tenant: rede.tenantId, rotulo: 'Configurações', permissoes: [{ modulo: 'settings', nivel: 'MANAGE' }],
  })
  financeiro = await criarMembro(`vpf${marca}`, {
    tenant: rede.tenantId, rotulo: 'Financeiro', permissoes: [{ modulo: 'financial', nivel: 'MANAGE' }],
  })
  recepcao = await criarMembro(`vpr${marca}`, {
    tenant: rede.tenantId, rotulo: 'Recepção',
    permissoes: [{ modulo: 'cashier', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'VIEW' }, { modulo: 'agenda', nivel: 'VIEW' }],
  })
})

test.afterAll(async () => {
  const falhas: string[] = []
  if (rede) {
    const b = db()
    const { data } = await b.from('product_sales').select('id').eq('tenant_id', rede.tenantId)
    const ids = (data ?? []).map(v => v.id as string)
    if (ids.length) {
      // As linhas de comissão (e o extrato delas, em cascata) saem antes da venda.
      const rl = await b.from('commission_lines').delete().in('product_sale_id', ids)
      if (rl.error) falhas.push(`comissão: ${rl.error.message}`)
      for (const t of ['financial_transactions']) {
        const r = await b.from(t).update({ product_sale_id: null }).in('product_sale_id', ids)
        if (r.error) falhas.push(`${t}: ${r.error.message}`)
      }
    }
    // Os pontos apontam para o lançamento que os deu: saem antes dele.
    const { data: txs } = await b.from('financial_transactions').select('id').eq('branch_id', rede.branchId)
    const txIds = (txs ?? []).map(t => t.id as string)
    if (txIds.length) {
      const r = await b.from('loyalty_transactions').delete().in('transaction_id', txIds)
      if (r.error) falhas.push(`pontos: ${r.error.message}`)
    }
    const r1 = await b.from('financial_transactions').delete().eq('branch_id', rede.branchId)
    if (r1.error) falhas.push(`lançamentos: ${r1.error.message}`)
    if (ids.length) {
      const r = await b.from('product_sales').delete().in('id', ids)
      if (r.error) falhas.push(`vendas: ${r.error.message}`)
    }
    for (const id of [serum, luva].filter(Boolean)) {
      for (const t of ['product_batches', 'stock_movements', 'branch_product_stock']) {
        const r = await b.from(t).delete().eq('product_id', id)
        if (r.error) falhas.push(`${t}: ${r.error.message}`)
      }
      await b.from('domain_events').delete().eq('entidade_id', id)
      const r = await b.from('products').delete().eq('id', id)
      if (r.error) falhas.push(`produto: ${r.error.message}`)
    }
  }
  if (rede) await db().from('commission_configs').delete().eq('tenant_id', rede.tenantId)
  await recepcao?.limpar(); await dona?.limpar(); await financeiro?.limpar(); await rede?.limpar()
  expect(falhas).toEqual([])
})

test.describe.serial('a venda de produto', () => {
  test('pela ficha: 3 séruns com desconto, no Pix — a venda, a baixa pelo lote que vence primeiro e o dinheiro', async ({ browser }) => {
    await como(browser, async p => {
      const dlg = await abrirVendaDeProduto(p)
      // A48 da 5ª simulação: a venda não dizia nada sobre pontos — e não pontuava.
      await expect(dlg.locator('[data-pontos-do-produto]')).toContainText('não gera pontos')
      const opcoes = await dlg.getByLabel('Produto', { exact: true }).locator('option').allTextContents()
      expect(opcoes.some(o => o.includes(nomeSerum)), 'a revenda está à venda').toBe(true)
      expect(opcoes.some(o => o.includes(nomeLuva)), 'o insumo não é vendido').toBe(false)
      await dlg.getByLabel('Produto', { exact: true }).selectOption(serum)
      await dlg.getByLabel('Quantidade').fill('3')
      await expect(dlg.locator('[data-resumo-do-produto]')).toContainText('447,00')
      await dlg.getByLabel('Desconto', { exact: true }).fill('47')
      await dlg.getByLabel('Meio de pagamento').selectOption('PIX')
      await pagoNoPix(dlg)
      await euVendi(dlg)
      await dlg.getByRole('button', { name: /^Vender por R\$\s400,00$/ }).click()
      await expect(dlg).toBeHidden()
    })

    const [v] = await vendas()
    expect({ q: n(v!.quantity), un: n(v!.preco_unitario), tab: n(v!.preco_tabela), desc: n(v!.desconto), preco: n(v!.price), custo: n(v!.custo), quem: v!.sold_by })
      .toEqual({ q: 3, un: 149, tab: 447, desc: 47, preco: 400, custo: 190, quem: recepcao!.userId })
    // FEFO: os 2 do lote A (vence antes) e 1 do B.
    expect(await lotes()).toEqual({ A: 0, B: 2 })
    const { data: saldo } = await db().from('branch_product_stock').select('current_stock').eq('product_id', serum).eq('branch_id', rede!.branchId).single()
    expect(n(saldo!.current_stock)).toBe(2)
    const { data: mov } = await db().from('stock_movements').select('quantity').eq('product_id', serum).eq('type', 'SALE')
    expect((mov ?? []).map(m => n(m.quantity))).toEqual([-3])
    const { data: tx } = await db().from('financial_transactions')
      .select('amount, is_paid, payment_method, category, client_id, product_sale_id, type').eq('branch_id', rede!.branchId)
    expect(tx!.map(t => ({ ...t, amount: n(t.amount) }))).toEqual([{
      amount: 400, is_paid: true, payment_method: 'PIX', category: 'Venda de produto', client_id: cliente, product_sale_id: v!.id, type: 'INCOME',
    }])
    // A venda de produto não pontua (a clínica ainda não ligou).
    expect(await pontos()).toEqual([])
  })

  test('sem estoque suficiente, recusa — e nada é gravado', async ({ browser }) => {
    const antes = (await vendas()).length
    await como(browser, async p => {
      const dlg = await abrirVendaDeProduto(p)
      await dlg.getByLabel('Produto', { exact: true }).selectOption(serum)
      await dlg.getByLabel('Quantidade').fill('5')
      await pagoNoPix(dlg)
      await euVendi(dlg)
      await dlg.getByRole('button', { name: /^Vender por/ }).click()
      await expect(dlg.getByRole('alert')).toContainText(/estoque insuficiente/i)
    })
    expect((await vendas()).length).toBe(antes)
    expect(await lotes()).toEqual({ A: 0, B: 2 })
  })

  test('exige cliente cadastrada: o servidor recusa a venda sem a ficha da rede', async ({ browser }) => {
    await como(browser, async p => {
      const rota = `/admin/clients/${cliente}`
      await p.goto(rota)
      const pagamento = { forma: 'AVISTA', metodo: 'PIX' }
      const semCliente = await chamarAcao(p, 'actions/produtos.ts', 'venderProduto', rota, ['', serum, rede!.branchId, 1, pagamento, null])
      expect(semCliente.texto).toMatch(/cliente/i)
      const outra = await chamarAcao(p, 'actions/produtos.ts', 'venderProduto', rota, ['00000000-0000-4000-8000-000000000000', serum, rede!.branchId, 1, pagamento, null])
      expect(outra.texto).toMatch(/Cliente não encontrad/i)
    })
    expect((await vendas()).length).toBe(1)
  })

  test('com a venda de produto pontuando (Fidelidade), a cliente ganha por real pago', async ({ browser }) => {
    // A clínica liga em Configurações → Fidelidade → "Venda de produto".
    const ctxDona = await browser.newContext({ storageState: dona!.estado })
    try {
      const p = await ctxDona.newPage()
      await p.goto('/admin/settings?tab=fidelidade')
      await p.getByRole('button', { name: 'Pontua', exact: true }).click()
      await p.getByRole('button', { name: 'Salvar', exact: true }).click()
      await expect(p.getByText('Salvo')).toBeVisible()
    } finally { await ctxDona.close() }
    const { data: cfg } = await db().from('loyalty_configs').select('pontua_venda_de_produto').eq('tenant_id', rede!.tenantId).single()
    expect(cfg?.pontua_venda_de_produto).toBe(true)
    await como(browser, async p => {
      const dlg = await abrirVendaDeProduto(p)
      await expect(dlg.locator('[data-pontos-do-produto]')).toContainText('gera pontos de fidelidade quando for paga')
      await dlg.getByLabel('Produto', { exact: true }).selectOption(serum)
      await dlg.getByLabel('Quantidade').fill('1')
      await dlg.getByLabel('Meio de pagamento').selectOption('CASH')
      await pagoNoPix(dlg)
      await euVendi(dlg)
      await dlg.getByRole('button', { name: /^Vender por R\$\s149,00$/ }).click()
      await expect(dlg).toBeHidden()
    })
    expect(await pontos()).toEqual([{ points: 149, kind: 'GANHO' }])
  })

  test('a venda entra no relatório de vendas e no faturamento (a regra única de receita)', async () => {
    const dia = hojeBR()
    const janela = { p_tenant: rede!.tenantId, p_branch_ids: [rede!.branchId], p_from: `${dia}T00:00:00-03:00`, p_to: `${dia}T23:59:59-03:00` }
    const { data: resumo, error } = await db().rpc('metrics_vendas_resumo', janela)
    expect(error).toBeNull()
    const produto = (resumo as { tipo: string | null; quantidade: number; total: number }[]).find(r => r.tipo === 'PRODUTO')
    expect({ q: n(produto?.quantidade), total: n(produto?.total) }).toEqual({ q: 2, total: 549 })
    const { data: pagas, error: e2 } = await db().rpc('metrics_receitas_pagas', { ...janela, p_professional_id: null })
    expect(e2).toBeNull()
    const soma = (pagas as { amount: number }[]).reduce((s, r) => s + n(r.amount), 0)
    expect(soma, 'as duas vendas pagas, no faturamento').toBe(549)
  })

  test('a comissão da venda de produto é da clínica configurar: 10% para quem vendeu, quando a venda é paga', async ({ browser }) => {
    // Sem a configuração, as vendas de antes não geraram comissão.
    const { data: antes } = await db().from('commission_lines').select('id').eq('tenant_id', rede!.tenantId)
    expect(antes ?? []).toEqual([])

    const ctxFin = await browser.newContext({ storageState: financeiro!.estado })
    try {
      const p = await ctxFin.newPage()
      await p.goto('/admin/settings?tab=comissoes')
      const como = p.locator('[aria-label="Como a comissão acontece"]')
      await como.getByLabel('Comissão na venda de produto (%)').fill('10')
      await como.getByRole('button', { name: 'Salvar' }).click()
      await expect(como.getByRole('status')).toHaveText('Salvo.')
    } finally { await ctxFin.close() }
    const { data: cfg } = await db().from('commission_configs').select('produto_pct').eq('tenant_id', rede!.tenantId).single()
    expect(n(cfg?.produto_pct)).toBe(10)

    // Mais estoque (sobrou 1 sérum) e uma venda à vista (R$ 149) e uma a receber (R$ 149).
    const mais = await db().rpc('estoque_entrada', { p_produto: serum, p_unidade: rede!.branchId, p_quantidade: 5, p_custo: 70, p_observacao: 'e2e', p_lote: 'C', p_validade: null, p_autor: 'e2e' })
    expect(mais.error).toBeNull()
    await como(browser, async p => {
      for (const forma of ['À vista', 'A receber']) {
        const dlg = await abrirVendaDeProduto(p)
        await dlg.getByLabel('Produto', { exact: true }).selectOption(serum)
        await dlg.getByLabel('Quantidade').fill('1')
        await dlg.getByRole('button', { name: forma, exact: true }).click()
        await pagoNoPix(dlg)
        await euVendi(dlg)
        await dlg.getByRole('button', { name: /^Vender por R\$\s149,00$/ }).click()
        await expect(dlg).toBeHidden()
      }
    })
    const { data: linhas } = await db().from('commission_lines')
      .select('id, origem, professional_id, product_sale_id, regra_valor, preco').eq('tenant_id', rede!.tenantId).order('created_at')
    expect(linhas!.map(l => ({ origem: l.origem, quem: l.professional_id, pct: n(l.regra_valor), preco: n(l.preco), venda: !!l.product_sale_id })))
      .toEqual([
        { origem: 'PRODUTO', quem: recepcao!.userId, pct: 10, preco: 149, venda: true },
        { origem: 'PRODUTO', quem: recepcao!.userId, pct: 10, preco: 149, venda: true },
      ])
    const devido = async (linha: string) => ((await db().from('commissions').select('amount').eq('line_id', linha)).data ?? [])
      .reduce((s, c) => Math.round((s + n(c.amount)) * 100) / 100, 0)
    expect(await devido(linhas![0]!.id as string), 'a paga: 10% de R$ 149').toBe(14.9)
    expect(await devido(linhas![1]!.id as string), 'a receber: nada até pagar').toBe(0)

    // O extrato da equipe diz o produto e a cliente.
    const dia = hojeBR()
    const { data: extrato, error } = await db().rpc('comissoes_extrato', {
      p_tenant: rede!.tenantId, p_branch_ids: null, p_inicio: `${dia}T00:00:00-03:00`, p_fim: `${dia}T23:59:59-03:00`, p_profissional: recepcao!.userId,
    })
    expect(error).toBeNull()
    // A paga liberou; a receber aparece "aguardando o pagamento integral", com o previsto (H4).
    expect((extrato as { procedimento: string | null; cliente: string | null; origem: string; kind: string; previsto: number | null }[])
      .map(e => ({ k: e.kind, o: e.origem, produto: e.procedimento, cliente: !!e.cliente, previsto: e.previsto == null ? null : n(e.previsto) }))
      .sort((a, b) => a.k.localeCompare(b.k)))
      .toEqual([
        { k: 'AGUARDANDO', o: 'PRODUTO', produto: nomeSerum, cliente: true, previsto: 14.9 },
        { k: 'LIBERACAO', o: 'PRODUTO', produto: nomeSerum, cliente: true, previsto: null },
      ])
  })

  test('o custo do produto vendido desconta do lucro, como o insumo consumido (metrics_resultado)', async () => {
    const custos = (await vendas()).reduce((s, v) => Math.round((s + n(v.custo)) * 100) / 100, 0)
    expect(custos, 'as vendas retrataram o custo dos lotes').toBeGreaterThan(0)
    const dia = hojeBR()
    const { data, error } = await db().rpc('metrics_resultado', {
      p_tenant: rede!.tenantId, p_branch_ids: [rede!.branchId],
      p_from: `${dia}T00:00:00-03:00`, p_to: `${dia}T23:59:59-03:00`, p_professional_id: null,
    })
    expect(error).toBeNull()
    const total = (data as { branch_id: string | null; consumo_de_insumo: number }[]).find(l => l.branch_id === null)
    expect(n(total?.consumo_de_insumo), 'o custo do que foi vendido, no lucro').toBe(custos)

    const { data: serie, error: e2 } = await db().rpc('metrics_series_do_resultado', {
      p_tenant: rede!.tenantId, p_branch_ids: [rede!.branchId],
      p_from: `${dia}T00:00:00-03:00`, p_to: `${dia}T23:59:59-03:00`, p_granularity: 'day', p_professional_id: null,
    })
    expect(e2).toBeNull()
    const naSerie = (serie as { consumo_de_insumo: number }[]).reduce((s, r) => Math.round((s + n(r.consumo_de_insumo)) * 100) / 100, 0)
    expect(naSerie, 'o gráfico da evolução bate com o cartão').toBe(custos)
  })

  // O ESTORNO da venda de produto (H2, decisão do Heitor, 2026-11-01): "estorno
  // de produto precisa ter um campo para indicar se houve devolução de produto
  // ou não; se sim, produto volta ao estoque". Na 5ª simulação o protetor
  // estornado ("devolveu, lacrado") ficou fora do estoque, contou nas Vendas
  // (R$ 6.013 contra R$ 5.915) e o custo dele saiu do lucro.

  test('estorno com "o produto voltou": o estoque volta aos lotes de onde saiu, e a venda some das Vendas e do custo', async ({ browser }) => {
    const [primeira] = await vendas()
    expect(await lotes(), 'antes: a primeira venda tirou 2 do A e 1 do B').toEqual({ A: 0, B: 0, C: 4 })
    expect(await saldo()).toBe(4)

    const ctxFin = await browser.newContext({ storageState: financeiro!.estado })
    try {
      const p = await ctxFin.newPage()
      await p.goto('/admin/financeiro')
      const linha = p.locator('tr', { hasText: `3× ${nomeSerum}` })
      await linha.getByTitle('Estornar').click()
      const dlg = p.getByRole('dialog', { name: 'Estornar esta venda de produto?' })
      await expect(dlg.getByRole('radiogroup', { name: 'O produto voltou ao estoque?' })).toBeVisible()
      await dlg.getByLabel('Motivo do estorno *').fill('Devolveu lacrado')
      await expect(dlg.getByRole('button', { name: 'Confirmar estorno' }), 'sem dizer se voltou, não estorna').toBeDisabled()
      await dlg.getByRole('radio', { name: /Sim, voltou ao estoque/ }).check()
      await dlg.getByRole('button', { name: 'Confirmar estorno' }).click()
      await expect(dlg).toBeHidden()
    } finally { await ctxFin.close() }

    const estornada = await venda(primeira!.id as string)
    expect({ estornada: !!estornada.estornada_em, voltou: estornada.produto_voltou, motivo: estornada.estorno_motivo })
      .toEqual({ estornada: true, voltou: true, motivo: 'Devolveu lacrado' })
    expect(await lotes(), 'os 3 voltam aos lotes de onde saíram').toEqual({ A: 2, B: 1, C: 4 })
    expect(await saldo()).toBe(7)
    const { data: dev } = await db().from('stock_movements').select('quantity, unit_cost, reference').eq('product_id', serum).eq('type', 'SALE_RETURN')
    expect((dev ?? []).map(m => ({ q: n(m.quantity), ref: m.reference }))).toEqual([{ q: 3, ref: `venda:${primeira!.id}` }])
    const { data: tx } = await db().from('financial_transactions').select('notes, category').eq('product_sale_id', primeira!.id)
    expect(tx!.map(t => t.notes)).toEqual(['Estornada'])

    const r = await resumoDoProduto()
    expect(r, 'sem a venda estornada: as três de R$ 149').toEqual({ q: 3, total: 447 })
    expect(await consumo(), 'o custo do lucro sem a venda estornada').toBe(await custoDasVivas())
  })

  test('estorno com "não voltou": o estoque fica, a venda sai das Vendas e o custo vai para as Perdas', async ({ browser }) => {
    const segunda = (await vendas())[1]!
    const { data: txs } = await db().from('financial_transactions').select('id').eq('product_sale_id', segunda.id)
    const tx = txs![0]!.id as string
    const ctxFin = await browser.newContext({ storageState: financeiro!.estado })
    try {
      const p = await ctxFin.newPage()
      await p.goto('/admin/financeiro')
      const semDizer = await chamarAcao(p, 'actions/financial.ts', 'reverseTransaction', '/admin/financeiro', [tx, '', 'Quebrou na bolsa'])
      expect(semDizer.texto, 'o servidor exige a resposta').toMatch(/voltou ao estoque/i)
      expect((await venda(segunda.id as string)).estornada_em).toBeNull()
      const r = await chamarAcao(p, 'actions/financial.ts', 'reverseTransaction', '/admin/financeiro', [tx, '', 'Quebrou na bolsa', false])
      expect(r.texto).toMatch(/"success":true/)
    } finally { await ctxFin.close() }

    const v = await venda(segunda.id as string)
    expect({ estornada: !!v.estornada_em, voltou: v.produto_voltou }).toEqual({ estornada: true, voltou: false })
    expect(await saldo(), 'não voltou: o estoque fica').toBe(7)
    const { count } = await db().from('stock_movements').select('id', { count: 'exact', head: true }).eq('product_id', serum).eq('type', 'SALE_RETURN')
    expect(count).toBe(1)
    expect(await pontos(), 'os pontos dela voltam').toEqual(expect.arrayContaining([{ points: -149, kind: 'ESTORNO_GANHO' }]))
    expect(await resumoDoProduto()).toEqual({ q: 2, total: 298 })
    expect(await consumo()).toBe(await custoDasVivas())

    const dia = hojeBR()
    const { data: perdas, error } = await db().rpc('metrics_perdas', {
      p_tenant: rede!.tenantId, p_branch_ids: [rede!.branchId], p_from: `${dia}T00:00:00-03:00`, p_to: `${dia}T23:59:59-03:00`,
    })
    expect(error).toBeNull()
    const linha = (perdas as { motivo: string | null; product_id: string | null; quantidade: number; custo: number }[])
      .find(l => l.motivo === 'VENDA_ESTORNADA' && l.product_id === serum)
    expect({ q: n(linha?.quantidade), custo: n(linha?.custo) }).toEqual({ q: 1, custo: n(v.custo) })
  })

  test('venda com entrada e parcela: o estorno estorna a entrada, cancela a parcela e a comissão — e a venda não se estorna duas vezes', async ({ browser }) => {
    const nova = await db().rpc('produto_vender', {
      p_tenant: rede!.tenantId, p_cliente: cliente, p_produto: serum, p_unidade: rede!.branchId, p_ator: recepcao!.userId,
      p_quantidade: 1, p_desconto: 0, p_lancamentos: [
        { amount: 49, is_paid: true, payment_method: 'PIX', sufixo: 'entrada' },
        { amount: 100, is_paid: false, due_date: emDias(30), sufixo: 'parcela 2/2' },
      ],
    })
    expect(nova.error).toBeNull()
    const id = nova.data as string
    expect(await saldo()).toBe(6)
    const { data: txs } = await db().from('financial_transactions').select('id, is_paid').eq('product_sale_id', id).order('amount')
    const entrada = txs!.find(t => t.is_paid)!.id as string
    const parcela = txs!.find(t => !t.is_paid)!.id as string

    // Pela função de sempre, sem dizer do produto, o banco recusa.
    const porFora = await db().rpc('estornar_transacao', { p_transacao: entrada, p_tenant: rede!.tenantId, p_ator: 'e2e' })
    expect(porFora.error?.message ?? '').toMatch(/venda de produto/i)

    const ctxFin = await browser.newContext({ storageState: financeiro!.estado })
    try {
      const p = await ctxFin.newPage()
      await p.goto('/admin/financeiro')
      const r = await chamarAcao(p, 'actions/financial.ts', 'reverseTransaction', '/admin/financeiro', [entrada, '', 'Desistiu', true])
      expect(r.texto).toMatch(/"success":true/)
      const deNovo = await chamarAcao(p, 'actions/financial.ts', 'reverseTransaction', '/admin/financeiro', [parcela, '', 'De novo', true])
      expect(deNovo.texto).toMatch(/já foi estornada/i)
    } finally { await ctxFin.close() }

    const { data: depois } = await db().from('financial_transactions').select('id, is_paid, notes').eq('product_sale_id', id)
    expect(Object.fromEntries(depois!.map(t => [t.id === entrada ? 'entrada' : 'parcela', { pago: t.is_paid, notes: t.notes }])))
      .toEqual({ entrada: { pago: true, notes: 'Estornada' }, parcela: { pago: false, notes: 'Estornada' } })
    expect(await saldo(), 'voltou').toBe(7)
    const { data: linha } = await db().from('commission_lines').select('id, status').eq('product_sale_id', id).single()
    expect(linha!.status).toBe('CANCELADA')
    const { data: acertos } = await db().from('commissions').select('amount').eq('line_id', linha!.id)
    expect((acertos ?? []).reduce((s, c) => Math.round((s + n(c.amount)) * 100) / 100, 0), 'nada a pagar').toBe(0)
  })

  test('a venda toda a receber (nada pago) ganha "Cancelar venda": a mesma pergunta do produto, e a venda sai', async ({ browser }) => {
    const sufixo = `fiado ${marca}`
    const nova = await db().rpc('produto_vender', {
      p_tenant: rede!.tenantId, p_cliente: cliente, p_produto: serum, p_unidade: rede!.branchId, p_ator: recepcao!.userId,
      p_quantidade: 1, p_desconto: 0, p_lancamentos: [{ amount: 149, is_paid: false, sufixo }],
    })
    expect(nova.error).toBeNull()
    const id = nova.data as string
    const antes = await saldo()

    const ctxFin = await browser.newContext({ storageState: financeiro!.estado })
    try {
      const p = await ctxFin.newPage()
      await p.goto('/admin/financeiro')
      const linha = p.locator('tr', { hasText: sufixo })
      await expect(linha.getByTitle('Cancelar venda')).toBeVisible()
      await expect(linha.getByTitle('Estornar'), 'nada pago: não é estorno').toHaveCount(0)
      await linha.getByTitle('Cancelar venda').click()
      const dlg = p.getByRole('dialog', { name: 'Cancelar esta venda de produto?' })
      await expect(dlg.getByRole('radiogroup', { name: 'O produto voltou ao estoque?' })).toBeVisible()
      await dlg.getByLabel('Motivo do cancelamento *').fill('Desistiu antes de pagar')
      await dlg.getByRole('radio', { name: /Sim, voltou ao estoque/ }).check()
      await dlg.getByRole('button', { name: 'Confirmar cancelamento' }).click()
      await expect(dlg).toBeHidden()
    } finally { await ctxFin.close() }

    const v = await venda(id)
    expect({ estornada: !!v.estornada_em, voltou: v.produto_voltou, motivo: v.estorno_motivo })
      .toEqual({ estornada: true, voltou: true, motivo: 'Desistiu antes de pagar' })
    expect(await saldo(), 'voltou ao estoque').toBe(antes + 1)
    const { data: txs } = await db().from('financial_transactions').select('is_paid, notes').eq('product_sale_id', id)
    expect(txs).toEqual([{ is_paid: false, notes: 'Estornada' }])
  })
})

async function venda(id: string) {
  const { data, error } = await db().from('product_sales').select('estornada_em, produto_voltou, estorno_motivo, custo').eq('id', id).single()
  expect(error).toBeNull()
  return data!
}
async function saldo() {
  const { data } = await db().from('branch_product_stock').select('current_stock').eq('product_id', serum).eq('branch_id', rede!.branchId).single()
  return n(data!.current_stock)
}
function janelaDeHoje() {
  const dia = hojeBR()
  return { p_tenant: rede!.tenantId, p_branch_ids: [rede!.branchId], p_from: `${dia}T00:00:00-03:00`, p_to: `${dia}T23:59:59-03:00` }
}
async function resumoDoProduto() {
  const { data, error } = await db().rpc('metrics_vendas_resumo', janelaDeHoje())
  expect(error).toBeNull()
  const produto = (data as { tipo: string | null; quantidade: number; total: number }[]).find(r => r.tipo === 'PRODUTO')
  return { q: n(produto?.quantidade), total: n(produto?.total) }
}
async function consumo() {
  const { data, error } = await db().rpc('metrics_resultado', { ...janelaDeHoje(), p_professional_id: null })
  expect(error).toBeNull()
  return n((data as { branch_id: string | null; consumo_de_insumo: number }[]).find(l => l.branch_id === null)?.consumo_de_insumo)
}
async function custoDasVivas() {
  const { data } = await db().from('product_sales').select('custo').eq('tenant_id', rede!.tenantId).is('estornada_em', null)
  return (data ?? []).reduce((s, v) => Math.round((s + n(v.custo)) * 100) / 100, 0)
}
