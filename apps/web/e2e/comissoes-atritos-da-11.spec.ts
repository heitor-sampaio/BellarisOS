import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'
import { abrirVendaNoPdv } from './apoio/vender'

/**
 * As comissões da 11ª simulação (2026-11-10), numa rede [e2e] própria:
 *
 * - A17: a comissão de venda POR PESSOA — decidida pelo princípio 1 (a clínica
 *   decide; configuração com padrão que não muda nada): "Comissão de venda (%)"
 *   no cadastro de comissão de cada pessoa, vazio por padrão. Vale para pacote,
 *   plano, pré-pago e produto, sobre o vendido, para quem está em "Quem
 *   vendeu". A regra do item vence a da pessoa; sem as duas, a da clínica. A
 *   tela diz de onde veio o percentual ("3% — da Tatiane").
 * - A42: a lista "Quem vendeu" trazia a estoquista — só quem tem Vendas.
 * - A43: no extrato, a venda do plano aparecia como "Procedimento · Beatriz".
 */

test.setTimeout(180_000)

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede
let slug = ''
let dona: MembroDeTeste
let tatiane: MembroDeTeste
let gisele: MembroDeTeste
let cliente = ''
let pacoteSemRegra = ''
let pacoteComRegra = ''
let produto = ''
const n = (v: unknown) => Number(v ?? 0)

async function como(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado, viewport: { width: 1440, height: 900 } })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

async function pacote(nome: string, regra: { tipo: string; valor: number } | null) {
  const b = db()
  const { data, error } = await b.from('service_packages').insert({
    tenant_id: rede.tenantId, procedure_id: rede.procedureId, name: `[e2e] ${nome} ${marca}`, total_sessions: 2, price: 1000,
    comissao_venda_tipo: regra?.tipo ?? null, comissao_venda_valor: regra?.valor ?? null,
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  expect((await b.from('service_package_items').insert({ tenant_id: rede.tenantId, package_id: data!.id, procedure_id: rede.procedureId, quantity: 2 })).error).toBeNull()
  return data!.id
}

const linhasDe = async (filtro: { client_package_id?: string; product_sale_id?: string; procedure_sale_id?: string; treatment_plan_id?: string }) => {
  let q = db().from('commission_lines').select('id, origem, professional_id, regra_tipo, regra_valor, regra_de, appointment_id, preco').eq('tenant_id', rede.tenantId).eq('status', 'ATIVA')
  for (const [k, v] of Object.entries(filtro)) q = q.eq(k, v!)
  const { data, error } = await q
  expect(error).toBeNull()
  return data ?? []
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`com11${marca}`)
  const b = db()
  expect((await b.from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  slug = (await b.from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  expect((await b.from('procedures').update({ price: 500 }).eq('id', rede.procedureId)).error).toBeNull()
  expect((await b.from('commission_configs').upsert({
    tenant_id: rede.tenantId, modo: 'INTEGRAL', desconta_insumos: false, desconta_taxa: false, base_com_pontos: 'PRECO', periodo: 'MENSAL',
    plano_pct: 5, produto_pct: 2, produto_modo: 'TOTAL',
  }, { onConflict: 'tenant_id' })).error).toBeNull()
  dona = await criarMembro(`com11d${marca}`, { tenant: rede.tenantId, donoDaRede: true, rotulo: 'Dona', permissoes: [] })
  tatiane = await criarMembro(`com11t${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Tatiane',
    permissoes: [{ modulo: 'crm', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'VIEW' }],
  })
  gisele = await criarMembro(`com11g${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Gisele', permissoes: [{ modulo: 'stock', nivel: 'MANAGE' }],
  })
  cliente = await rede.criarCliente('Beatriz')
  pacoteSemRegra = await pacote('Pacote sem regra', null)
  pacoteComRegra = await pacote('Pacote com regra', { tipo: 'PERCENTAGE', valor: 10 })
  produto = await rede.criarProduto('Sérum', 10)
  expect((await b.from('products').update({ uso: 'REVENDA', sale_price: 100 }).eq('id', produto)).error).toBeNull()
})

test.afterAll(async () => {
  await dona?.limpar(); await tatiane?.limpar(); await gisele?.limpar()
  await rede?.limpar()
})

test('A17: a dona dá "Comissão de venda (%)" à Tatiane, que não atende — vazio por padrão', async ({ browser }) => {
  await como(browser, dona, async p => {
    await p.goto('/admin/team')
    const chip = p.locator(`[data-comissao="${tatiane.userId}"]`)
    await chip.click()
    const janela = p.getByRole('dialog', { name: /Comissão de/ })
    const campo = janela.getByLabel('Comissão de venda (%)')
    await expect(campo).toHaveValue('')
    await campo.fill('3')
    await janela.getByRole('button', { name: 'Salvar' }).click()
    await expect(chip).toContainText('venda 3%', { timeout: 15_000 })
  })
  await expect.poll(async () => n((await db().from('users').select('comissao_venda_pct').eq('id', tatiane.userId).single<{ comissao_venda_pct: number | null }>()).data?.comissao_venda_pct)).toBe(3)
})

test('A17: o pacote sem "De venda" usa a da pessoa; o que tem, o dele (a regra do item vence)', async ({ browser }) => {
  expect((await db().from('users').update({ comissao_venda_pct: 3 }).eq('id', tatiane.userId)).error).toBeNull()
  const rota = `/${slug}/pdv`
  let semRegra = '', comRegra = ''
  await como(browser, dona, async p => {
    const a = await chamarAcao(p, 'actions/pacotes.ts', 'venderPacote', rota, [cliente, pacoteSemRegra, rede.branchId, { forma: 'AVISTA', metodo: 'PIX' }, null, null, { vendedorId: tatiane.userId }])
    semRegra = /"clientPackageId":"([0-9a-f-]{36})"/.exec(a.texto)?.[1] ?? ''
    const b = await chamarAcao(p, 'actions/pacotes.ts', 'venderPacote', rota, [cliente, pacoteComRegra, rede.branchId, { forma: 'AVISTA', metodo: 'PIX' }, null, null, { vendedorId: tatiane.userId }])
    comRegra = /"clientPackageId":"([0-9a-f-]{36})"/.exec(b.texto)?.[1] ?? ''
  })
  expect(semRegra && comRegra, 'vendeu os dois').toBeTruthy()
  expect((await linhasDe({ client_package_id: semRegra })).map(l => [l.origem, n(l.regra_valor), l.regra_de])).toEqual([['PACOTE_VENDA', 3, 'PESSOA']])
  expect((await linhasDe({ client_package_id: comRegra })).map(l => [l.origem, n(l.regra_valor), l.regra_de])).toEqual([['PACOTE_VENDA', 10, 'ITEM']])
})

test('A17: o produto e o pré-pago — a da pessoa vence a da clínica; o pré-pago ganha a linha de venda', async ({ browser }) => {
  expect((await db().from('users').update({ comissao_venda_pct: 3 }).eq('id', tatiane.userId)).error).toBeNull()
  const rota = `/${slug}/pdv`
  let venda = '', prePago = ''
  await como(browser, dona, async p => {
    const a = await chamarAcao(p, 'actions/produtos.ts', 'venderProduto', rota, [cliente, produto, rede.branchId, 1, { forma: 'AVISTA', metodo: 'PIX' }, null, null, { vendedorId: tatiane.userId }])
    venda = /"vendaId":"([0-9a-f-]{36})"/.exec(a.texto)?.[1] ?? ''
    await chamarAcao(p, 'actions/pre-pago.ts', 'venderProcedimento', rota, [cliente, rede.procedureId, rede.branchId, 2, null, { forma: 'AVISTA', metodo: 'PIX' }, null, null, { vendedorId: tatiane.userId }])
  })
  expect(venda, 'vendeu o produto').not.toBe('')
  expect((await linhasDe({ product_sale_id: venda })).map(l => [l.origem, n(l.regra_valor), l.regra_de])).toEqual([['PRODUTO', 3, 'PESSOA']])
  const { data: ps } = await db().from('procedure_sales').select('id').eq('client_id', cliente).order('sold_at', { ascending: false }).limit(1).single<{ id: string }>()
  prePago = ps!.id
  const doPrePago = await linhasDe({ procedure_sale_id: prePago })
  expect(doPrePago.map(l => [l.origem, n(l.regra_valor), l.regra_de, l.appointment_id, n(l.preco)])).toEqual([['PRE_PAGO', 3, 'PESSOA', null, 1000]])
  // À vista: liberada na hora, 3% de R$ 1.000.
  await expect.poll(async () => {
    const { data } = await db().from('commissions').select('amount').eq('line_id', doPrePago[0]!.id)
    return (data ?? []).reduce((s, c) => s + n(c.amount), 0)
  }).toBe(30)
})

test('A17: o plano — a da pessoa vence o "venda de plano (%)" da clínica; sem a da pessoa, a da clínica', async () => {
  const b = db()
  expect((await b.from('users').update({ comissao_venda_pct: 3 }).eq('id', tatiane.userId)).error).toBeNull()
  const p1 = await rede.criarPlanoProposto('Plano A', { semTermo: true })
  expect((await b.rpc('plano_comissao_de_venda', { p_tenant: rede.tenantId, p_plano: p1.planId, p_vendedor: tatiane.userId })).error).toBeNull()
  expect((await linhasDe({ treatment_plan_id: p1.planId })).map(l => [n(l.regra_valor), l.regra_de])).toEqual([[3, 'PESSOA']])
  expect((await b.from('users').update({ comissao_venda_pct: null }).eq('id', tatiane.userId)).error).toBeNull()
  const p2 = await rede.criarPlanoProposto('Plano B', { semTermo: true })
  expect((await b.rpc('plano_comissao_de_venda', { p_tenant: rede.tenantId, p_plano: p2.planId, p_vendedor: tatiane.userId })).error).toBeNull()
  expect((await linhasDe({ treatment_plan_id: p2.planId })).map(l => [n(l.regra_valor), l.regra_de])).toEqual([[5, 'CLINICA']])
})

test('A17 e A43: o extrato diz de onde veio o percentual, e a venda do plano diz que é venda do plano', async ({ browser }) => {
  // O que o extrato mostra, criado aqui (o teste se sustenta sozinho): a venda
  // pela pessoa (3%), pelo pacote (10%) e o plano pela clínica (5%).
  const b = db()
  expect((await b.from('users').update({ comissao_venda_pct: 3 }).eq('id', tatiane.userId)).error).toBeNull()
  const rota = `/${slug}/pdv`
  await como(browser, dona, async p => {
    await chamarAcao(p, 'actions/pacotes.ts', 'venderPacote', rota, [cliente, pacoteSemRegra, rede.branchId, { forma: 'AVISTA', metodo: 'PIX' }, null, null, { vendedorId: tatiane.userId }])
    await chamarAcao(p, 'actions/pacotes.ts', 'venderPacote', rota, [cliente, pacoteComRegra, rede.branchId, { forma: 'AVISTA', metodo: 'PIX' }, null, null, { vendedorId: tatiane.userId }])
  })
  expect((await b.from('users').update({ comissao_venda_pct: null }).eq('id', tatiane.userId)).error).toBeNull()
  const plano = await rede.criarPlanoProposto('Plano B', { semTermo: true })
  expect((await b.rpc('plano_comissao_de_venda', { p_tenant: rede.tenantId, p_plano: plano.planId, p_vendedor: tatiane.userId })).error).toBeNull()
  await como(browser, dona, async p => {
    await p.goto('/admin/financeiro/comissoes')
    const cartao = p.locator(`[data-comissoes-de="${tatiane.userId}"]`)
    await cartao.getByRole('button', { name: /Extrato/ }).click()
    await expect(cartao.getByText(/3%\s*—\s*da \[e2e\] Tatiane/).first()).toBeVisible()
    await expect(cartao.getByText(/10%\s*—\s*do pacote/).first()).toBeVisible()
    await expect(cartao.getByText(/5%\s*—\s*da clínica/).first()).toBeVisible()
    // A43: a linha da venda do plano começa por "Venda do plano", não "Procedimento".
    const doPlano = cartao.locator('[data-lancamento]', { hasText: 'Plano B' }).first()
    await expect(doPlano.locator('p').first()).toContainText(/^Venda do plano/)
  })
})

test('A42: "Quem vendeu" traz quem tem Vendas, sem a estoquista — e o servidor recusa quem não vende', async ({ browser }) => {
  // Só se vende pelo PDV (PDV7, 2026-11-13): a venda e a action são as de lá.
  const rota = `/${slug}/pdv`
  await como(browser, dona, async p => {
    const dlg = await abrirVendaNoPdv(p, `/${slug}`, cliente)
    await dlg.getByRole('button', { name: 'Pacote', exact: true }).click()
    const campo = dlg.getByLabel('Quem vendeu')
    await expect(campo.locator('option', { hasText: 'Tatiane' })).toHaveCount(1)
    await expect(campo.locator('option', { hasText: 'Gisele' })).toHaveCount(0)
    const r = await chamarAcao(p, 'actions/pacotes.ts', 'venderPacote', rota, [cliente, pacoteSemRegra, rede.branchId, { forma: 'AVISTA', metodo: 'PIX' }, null, null, { vendedorId: gisele.userId }])
    expect(r.texto).toContain('Quem vendeu')
    expect(r.texto).not.toContain('clientPackageId')
  })
})
