import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'
import { abrirVendaNoPdv, pagoNoPix } from './apoio/vender'

/**
 * com-06 da revisão das decisões (2026-11-02). O Heitor: "às vezes quem vai
 * registrar a venda é recepção e quem vendeu foi a profissional, então,
 * pensando na flexibilidade, um campo para informar quem foi quem realizou
 * aquela venda. Se o campo ficar vazio, aviso e confirmação. Campo vazio não
 * gera comissão para ninguém."
 *
 * A venda de produto, de pacote e de pré-pago ganha "Quem vendeu", separado de
 * quem registrou: é quem leva a comissão da venda (e aparece em Vendas). Vazio,
 * a venda pergunta (na tela e no servidor); confirmada, ninguém recebe.
 * Numa rede [e2e] própria.
 */

test.describe.configure({ mode: 'serial' })

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let outra: OutraRede | null = null
let recepcao: MembroDeTeste | null = null
let slug = ''
let cliente = ''
let serum = ''
let pacote = ''

async function como<T>(browser: Browser, fn: (p: Page) => Promise<T>) {
  const ctx = await browser.newContext({ storageState: recepcao!.estado })
  try { return await fn(await ctx.newPage()) } finally { await ctx.close() }
}
const ultima = async (tabela: string, coluna = 'created_at') => (await db().from(tabela).select('*')
  .eq('client_id', cliente).order(coluna, { ascending: false }).limit(1).single()).data!
const PIX = { forma: 'AVISTA', metodo: 'PIX' }

test.beforeAll(async () => {
  test.setTimeout(150_000)
  rede = await criarOutraRede(`vqv${marca}`)
  outra = await criarOutraRede(`vqvo${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  cliente = await rede.criarCliente('Quem vendeu')
  expect((await db().from('users').update({ provides_services: true }).eq('id', rede.professionalId)).error).toBeNull()
  expect((await db().from('procedures').update({ price: 100 }).eq('id', rede.procedureId)).error).toBeNull()
  const p = await db().from('products').insert({ tenant_id: rede.tenantId, name: `${PREFIXO} Sérum vqv ${marca}`, unit: 'un', uso: 'REVENDA', sale_price: 100 })
    .select('id').single<{ id: string }>()
  expect(p.error).toBeNull()
  serum = p.data!.id
  expect((await db().rpc('estoque_entrada', {
    p_produto: serum, p_unidade: rede.branchId, p_quantidade: 10, p_custo: 40, p_observacao: 'e2e', p_lote: null, p_validade: null, p_autor: 'e2e',
  })).error).toBeNull()
  expect((await db().from('commission_configs').upsert({ tenant_id: rede.tenantId, modo: 'INTEGRAL', produto_pct: 10 }, { onConflict: 'tenant_id' })).error).toBeNull()
  const pac = await db().rpc('pacote_salvar', {
    p_tenant: rede.tenantId, p_id: null, p_nome: `${PREFIXO} Pacote vqv ${marca}`, p_preco: 400, p_validade: null, p_ativo: true,
    p_itens: [{ procedure_id: rede.procedureId, quantity: 4 }],
    p_comissao: { venda: { tipo: 'PERCENTAGE', valor: 10 }, execucao: { tipo: 'NENHUMA', valor: null } },
  })
  expect(pac.error).toBeNull()
  pacote = pac.data as string
  recepcao = await criarMembro(`vqv${marca}`, {
    tenant: rede.tenantId, rotulo: 'Recepção',
    permissoes: [{ modulo: 'cashier', nivel: 'MANAGE' }, { modulo: 'financial', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'MANAGE' }],
  })
})

test.afterAll(async () => {
  const b = db()
  if (rede) {
    await b.from('commission_lines').delete().eq('tenant_id', rede.tenantId)
    const ids = ((await b.from('product_sales').select('id').eq('tenant_id', rede.tenantId)).data ?? []).map(v => v.id as string)
    const cps = ((await b.from('client_packages').select('id').eq('client_id', cliente)).data ?? []).map(v => v.id as string)
    const pps = ((await b.from('procedure_sales').select('id').eq('tenant_id', rede.tenantId)).data ?? []).map(v => v.id as string)
    await b.from('financial_transactions').delete().eq('branch_id', rede.branchId)
    if (ids.length) await b.from('product_sales').delete().in('id', ids)
    if (cps.length) { await b.from('package_sessions').delete().in('client_package_id', cps); await b.from('client_packages').delete().in('id', cps) }
    if (pps.length) { await b.from('procedure_sale_units').delete().in('sale_id', pps); await b.from('procedure_sales').delete().in('id', pps) }
    await b.from('service_packages').delete().eq('tenant_id', rede.tenantId)
    for (const t of ['product_batches', 'stock_movements', 'branch_product_stock']) await b.from(t).delete().eq('product_id', serum)
    await b.from('products').delete().eq('id', serum)
    await b.from('commission_configs').delete().eq('tenant_id', rede.tenantId)
    await b.from('envios_unicos').delete().eq('tenant_id', rede.tenantId)
  }
  await recepcao?.limpar()
  await rede?.limpar()
  await outra?.limpar()
})

test('a recepção registra e a profissional vendeu: a venda é dela, e a comissão também', async ({ browser }) => {
  await como(browser, async p => {
    const janela = await abrirVendaNoPdv(p, `/${slug}`, cliente)
    await janela.getByRole('button', { name: 'Produto' }).click()
    // r2-ven-12 (o Heitor: "nasce sempre vazio"): em toda venda, o campo nasce vazio.
    await expect(janela.getByLabel('Quem vendeu'), 'o produto: nasce vazio').toHaveValue('')
    await expect(janela.getByLabel('Quem vendeu').locator('option', { hasText: '(você)' }), 'quem registra se acha na lista').toHaveCount(1)
    for (const aba of ['Pacote', 'Procedimento']) {
      await janela.getByRole('button', { name: aba, exact: true }).click()
      await expect(janela.getByLabel('Quem vendeu'), `${aba}: nasce vazio`).toHaveValue('')
    }
    await janela.getByRole('button', { name: 'Produto' }).click()
    await expect(janela.getByLabel('Quem vendeu')).toHaveValue('')
    await janela.getByLabel('Quem vendeu').selectOption(rede!.professionalId)
    await pagoNoPix(janela)
    await janela.getByRole('button', { name: /^Vender por/ }).click()
    await expect(janela).toBeHidden()
  })
  const v = await ultima('product_sales')
  expect({ vendeu: v.sold_by, registrou: v.registrado_por }).toEqual({ vendeu: rede!.professionalId, registrou: recepcao!.userId })
  const { data: linhas } = await db().from('commission_lines').select('professional_id').eq('product_sale_id', v.id)
  expect((linhas ?? []).map(l => l.professional_id), 'a comissão é de quem vendeu').toEqual([rede!.professionalId])
})

test('"Quem vendeu" vazio: a venda pergunta, nada grava antes da resposta, e confirmada não gera comissão', async ({ browser }) => {
  const antes = (await db().from('product_sales').select('id').eq('tenant_id', rede!.tenantId)).data!.length
  await como(browser, async p => {
    const janela = await abrirVendaNoPdv(p, `/${slug}`, cliente)
    await janela.getByRole('button', { name: 'Produto' }).click()
    // Vazio, como nasce: vender pergunta.
    await pagoNoPix(janela)
    await janela.getByRole('button', { name: /^Vender por/ }).click()
    const pergunta = janela.locator('[data-pergunta-da-venda]')
    await expect(pergunta).toContainText('Ninguém foi marcado em “Quem vendeu”')
    expect((await db().from('product_sales').select('id').eq('tenant_id', rede!.tenantId)).data!.length, 'sem a resposta, não vende').toBe(antes)
    await pergunta.getByRole('button', { name: 'Vender assim' }).click()
    await expect(janela).toBeHidden()
  })
  const v = await ultima('product_sales')
  expect({ vendeu: v.sold_by, registrou: v.registrado_por }).toEqual({ vendeu: null, registrou: recepcao!.userId })
  const { data: linhas } = await db().from('commission_lines').select('id').eq('product_sale_id', v.id)
  expect(linhas ?? [], 'ninguém recebe').toHaveLength(0)
})

test('o servidor: pergunta sem quem vendeu, e recusa quem não é da equipe da rede', async ({ browser }) => {
  const rota = `/${slug}/clients/${cliente}`
  await como(browser, async p => {
    await p.goto(rota)
    const pergunta = await chamarAcao(p, 'actions/produtos.ts', 'venderProduto', `/${slug}/pdv`, [cliente, serum, rede!.branchId, 1, PIX, null, null, { vendedorId: null }])
    expect(pergunta!.texto).toContain('confirmarSemVendedor')
    const alheio = await chamarAcao(p, 'actions/produtos.ts', 'venderProduto', `/${slug}/pdv`,
      [cliente, serum, rede!.branchId, 1, PIX, null, null, { vendedorId: outra!.professionalId }])
    expect(alheio!.texto).toContain('não é da equipe desta clínica')
  })
})

test('o pacote e o pré-pago também: quem vendeu leva a venda (e a comissão de venda do pacote)', async ({ browser }) => {
  const rota = `/${slug}/clients/${cliente}`
  await como(browser, async p => {
    await p.goto(rota)
    const r1 = await chamarAcao(p, 'actions/pacotes.ts', 'venderPacote', `/${slug}/pdv`,
      [cliente, pacote, rede!.branchId, PIX, null, null, { vendedorId: rede!.professionalId }])
    expect(r1!.texto).toContain('clientPackageId')
    const r2 = await chamarAcao(p, 'actions/pre-pago.ts', 'venderProcedimento', `/${slug}/pdv`,
      [cliente, rede!.procedureId, rede!.branchId, 1, null, PIX, null, null, { vendedorId: rede!.professionalId }])
    expect(r2!.texto).toContain('saleId')
    const semNinguem = await chamarAcao(p, 'actions/pre-pago.ts', 'venderProcedimento', `/${slug}/pdv`,
      [cliente, rede!.procedureId, rede!.branchId, 1, null, PIX, null, null, { vendedorId: null }])
    expect(semNinguem!.texto).toContain('confirmarSemVendedor')
  })
  const cp = await ultima('client_packages', 'purchased_at')
  expect({ vendeu: cp.sold_by, registrou: cp.registrado_por }).toEqual({ vendeu: rede!.professionalId, registrou: recepcao!.userId })
  const { data: linhas } = await db().from('commission_lines').select('professional_id').eq('client_package_id', cp.id)
  expect((linhas ?? []).map(l => l.professional_id)).toEqual([rede!.professionalId])
  const pp = await ultima('procedure_sales', 'sold_at')
  expect({ vendeu: pp.sold_by, registrou: pp.registrado_por }).toEqual({ vendeu: rede!.professionalId, registrou: recepcao!.userId })
})
