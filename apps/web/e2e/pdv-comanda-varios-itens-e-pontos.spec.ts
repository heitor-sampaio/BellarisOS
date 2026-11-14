import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'
import { haMinutosHoje } from './apoio/datas'
import { abrirVendaNoPdv, euVendi } from './apoio/vender'

/**
 * O PDV, fase 5b (o plano de adaptação, `docs/revisao.md` — PDV2 e FD2a–FD2c).
 *
 * O desenho aprovado pelo Heitor (`docs/desenhos/pdv.html`): a Mariana fez a
 * limpeza de pele e "na saída ela levou um sérum, que se acrescenta na mesma
 * comanda" — "sai do estoque da Unidade Centro". Ela tem pontos e decide usar
 * ("320 pts valem R$ 16,00"), e "os pontos desta compra entram quando ela for
 * paga". FD2: o desconto em pontos e o voucher se aplicam na comanda; o ponto
 * nasce quando a comanda é paga; o estorno tira o que ela deu; a tela de
 * Fidelidade diz "No PDV, ao receber".
 *
 * - O produto de Venda direta se acrescenta na comanda do atendimento, com a
 *   quantidade; sai do estoque da unidade AO RECEBER, junto do atendimento e
 *   com a mesma forma. Tira-se antes de receber.
 * - Os pontos valem sobre o total da comanda (o atendimento e o produto).
 * - O estorno da venda do produto devolve o estoque e os pontos dela.
 * - A "Nova venda" também usa os pontos e o voucher (à vista).
 */

test.describe.configure({ mode: 'serial', timeout: 120_000 })

const marca = Date.now().toString(36)
const db = () => banco()
const n = (v: unknown) => Number(v)
let rede: OutraRede | null = null
let balcao: MembroDeTeste | null = null
let slug = ''
let procLimpeza = ''
let serum = ''
let insumo = ''
let minutos = 5
const nomeSerum = `${PREFIXO} Sérum C ${marca}`

async function como<T>(m: MembroDeTeste, browser: Browser, fn: (p: Page) => Promise<T>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { return await fn(await ctx.newPage()) } finally { await ctx.close() }
}

/** Um atendimento iniciado hoje: a comanda nasce (PDV3). */
async function atendimentoIniciado(cliente: string, preco = 180) {
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: cliente, procedure_id: procLimpeza, professional_id: rede!.professionalId,
    status: 'IN_PROGRESS', source: 'INTERNAL', duration_min: 30, price: preco,
    scheduled_at: haMinutosHoje(minutos += 2), started_at: new Date().toISOString(),
  }).select('id').single<{ id: string }>()
  expect(error, 'iniciar o atendimento').toBeNull()
  const c = (await db().from('comandas').select('id').eq('appointment_id', data!.id).single<{ id: string }>()).data!
  return { agendamento: data!.id, comanda: c.id }
}

async function dar(cliente: string, pontos: number) {
  const { error } = await db().rpc('ajustar_pontos', {
    p_tenant: rede!.tenantId, p_cliente: cliente, p_unidade: rede!.branchId, p_pontos: pontos, p_motivo: 'saldo do teste', p_ator: 'e2e',
  })
  expect(error, 'dar pontos').toBeNull()
}
const saldoDePontos = async (cliente: string) =>
  n((await db().rpc('saldo_de_pontos', { p_cliente: cliente, p_unidade: null })).data)
const estoque = async (produto: string) => n((await db().from('branch_product_stock').select('current_stock')
  .eq('product_id', produto).eq('branch_id', rede!.branchId).single()).data!.current_stock)
const itensDa = async (comanda: string) =>
  ((await db().from('comanda_itens').select('product_id, quantidade, product_sale_id').eq('comanda_id', comanda)).data ?? []) as
    { product_id: string; quantidade: number; product_sale_id: string | null }[]

test.beforeAll(async () => {
  test.setTimeout(120_000)
  rede = await criarOutraRede(`pdi${marca}`)
  expect((await db().from('users').update({ branch_id: rede.branchId, provides_services: true }).eq('id', rede.professionalId)).error).toBeNull()
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  const pr = await db().from('procedures')
    .insert({ tenant_id: rede.tenantId, name: `${PREFIXO} Limpeza ${marca}`, category: 'e2e', duration_min: 30, price: 180 })
    .select('id').single<{ id: string }>()
  expect(pr.error).toBeNull()
  procLimpeza = pr.data!.id
  // O sérum é de Venda direta (`products.uso`), R$ 120, 5 na unidade a R$ 40.
  const p = await db().from('products')
    .insert({ tenant_id: rede.tenantId, name: nomeSerum, unit: 'un', uso: 'REVENDA', sale_price: 120 })
    .select('id').single<{ id: string }>()
  expect(p.error).toBeNull()
  serum = p.data!.id
  expect((await db().rpc('estoque_entrada', {
    p_produto: serum, p_unidade: rede.branchId, p_quantidade: 5, p_custo: 40, p_observacao: 'e2e', p_lote: null, p_validade: null, p_autor: 'e2e',
  })).error).toBeNull()
  // O que é só Insumo não se vende na comanda.
  insumo = await rede.criarProduto('Luva')
  // A fidelidade da rede: 1 ponto por real, o ponto vale R$ 0,05, até 50%;
  // a venda de produto pontua (a rede ligou).
  expect((await db().from('loyalty_configs').upsert({
    tenant_id: rede.tenantId, enabled: true, earn_mode: 'POR_REAL', points_per_real: 1,
    redeem_points_value: 0.05, redeem_min_points: 0, redeem_max_pct: 50, pontua_venda_de_produto: true,
  }, { onConflict: 'tenant_id' })).error).toBeNull()
  balcao = await criarMembro(`pdib${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Balcão',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'cashier', nivel: 'MANAGE' },
      { modulo: 'financial', nivel: 'MANAGE' }],
  })
})
test.afterAll(async () => {
  await balcao?.limpar()
  await rede?.limpar()
})

test('a Mariana leva um sérum na comanda do atendimento: acrescenta, usa os pontos e recebe tudo junto, na mesma forma', async ({ browser }) => {
  const mariana = await rede!.criarCliente('Mariana')
  await dar(mariana, 320)
  const { agendamento, comanda } = await atendimentoIniciado(mariana)

  await como(balcao!, browser, async p => {
    await p.goto(`/${slug}/pdv?comanda=${comanda}`)
    const detalhe = p.locator('[data-comanda-aberta]')
    await expect(detalhe).toContainText(`Limpeza ${marca}`)
    await detalhe.getByRole('button', { name: 'Acrescentar produto' }).click()
    const form = detalhe.locator('[data-acrescentar-produto]')
    await form.getByLabel('Produto a acrescentar').selectOption(serum)
    await form.getByLabel('Quantidade').fill('1')
    await form.getByRole('button', { name: 'Acrescentar' }).click()

    const item = detalhe.locator('[data-item-da-comanda]', { hasText: nomeSerum })
    await expect(item).toContainText('sai do estoque')
    await expect(item).toContainText('120,00')
    await expect(detalhe.locator('[data-total-da-comanda]')).toContainText('300,00')
    // Acrescentado não é vendido: o estoque sai quando a comanda é paga.
    expect(await estoque(serum)).toBe(5)

    // "Usar os pontos — 320 pts valem R$ 16,00": sobre o total da comanda.
    const pontos = detalhe.getByTestId('usar-pontos')
    await pontos.locator('input[name="pontos"]').fill('320')
    await expect(pontos).toContainText('16,00')
    const receber = detalhe.getByRole('button', { name: /Receber R\$\s?284,00/ })
    await expect(receber).toBeDisabled()
    await detalhe.getByRole('radio', { name: 'Pix' }).click()
    await receber.click()
    await expect(p.locator(`[data-lista-de-comandas] [data-comanda="${comanda}"]`)).toHaveCount(0)
  })

  // O atendimento e o produto, cada um no seu lançamento, na mesma forma.
  const { data: doAtendimento } = await db().from('financial_transactions')
    .select('id, amount, loyalty_discount, payment_method, is_paid').eq('appointment_id', agendamento)
  expect(doAtendimento).toHaveLength(1)
  const itens = await itensDa(comanda)
  expect(itens).toHaveLength(1)
  expect(itens[0]!.product_sale_id, 'o item virou a venda do produto').not.toBeNull()
  const venda = (await db().from('product_sales').select('id, price, preco_tabela, sold_by').eq('id', itens[0]!.product_sale_id!).single()).data!
  expect({ tabela: n(venda.preco_tabela), preco: n(venda.price) }).toEqual({ tabela: 120, preco: 120 })
  // Quem vendeu o produto é a profissional do atendimento (o desenho: "Quem vendeu: Dra. Ana Lima").
  expect(venda.sold_by).toBe(rede!.professionalId)
  const { data: doProduto } = await db().from('financial_transactions')
    .select('id, amount, loyalty_discount, payment_method, is_paid').eq('product_sale_id', venda.id)
  expect(doProduto).toHaveLength(1)
  const at = doAtendimento![0]!, pr = doProduto![0]!
  expect([at.payment_method, pr.payment_method, at.is_paid, pr.is_paid]).toEqual(['PIX', 'PIX', true, true])
  // Os R$ 16 dos pontos se dividem pelo peso de cada um: 180/300 e 120/300.
  expect({ at: n(at.amount), atPts: n(at.loyalty_discount), pr: n(pr.amount), prPts: n(pr.loyalty_discount) })
    .toEqual({ at: 170.4, atPts: 9.6, pr: 113.6, prPts: 6.4 })
  // O produto saiu do estoque da unidade da comanda.
  expect(await estoque(serum)).toBe(4)
  // Uma comanda só: a venda do produto é DESTA comanda, não outra.
  const { data: daVenda } = await db().from('comandas').select('id').eq('product_sale_id', venda.id)
  expect(daVenda, 'o produto acrescentado não abre outra comanda').toEqual([])

  // FD2b: os pontos usados saem; os ganhos entram quando a comanda é paga.
  const { data: extrato } = await db().from('loyalty_transactions').select('kind, points, transaction_id')
    .in('transaction_id', [at.id, pr.id])
  const soma = (k: string) => (extrato ?? []).filter(l => l.kind === k).reduce((s, l) => s + n(l.points), 0)
  expect(soma('RESGATE')).toBe(-320)
  // 1 ponto por real PAGO: floor(170,40) + floor(113,60) — o produto pontua porque a rede ligou.
  expect(soma('GANHO')).toBe(170 + 113)
  expect(await saldoDePontos(mariana)).toBe(283)

  // A comanda paga diz o que entrou.
  await como(balcao!, browser, async p => {
    await p.goto(`/${slug}/pdv?ver=PAGAS&comanda=${comanda}`)
    await expect(p.locator('[data-comanda-paga]')).toContainText('284,00')
  })
})

test('tirar o produto antes de receber: a comanda volta ao valor do atendimento e nada sai do estoque', async ({ browser }) => {
  const cliente = await rede!.criarCliente('Desiste do Serum')
  const { comanda } = await atendimentoIniciado(cliente)
  const antes = await estoque(serum)
  await como(balcao!, browser, async p => {
    await p.goto(`/${slug}/pdv?comanda=${comanda}`)
    const detalhe = p.locator('[data-comanda-aberta]')
    await detalhe.getByRole('button', { name: 'Acrescentar produto' }).click()
    const form = detalhe.locator('[data-acrescentar-produto]')
    await form.getByLabel('Produto a acrescentar').selectOption(serum)
    await form.getByLabel('Quantidade').fill('2')
    await form.getByRole('button', { name: 'Acrescentar' }).click()
    await expect(detalhe.locator('[data-total-da-comanda]')).toContainText('420,00')
    await detalhe.getByRole('button', { name: `Tirar ${nomeSerum}` }).click()
    await expect(detalhe.locator('[data-item-da-comanda]', { hasText: nomeSerum })).toHaveCount(0)
    await expect(detalhe.locator('[data-total-da-comanda]')).toContainText('180,00')
    await detalhe.getByRole('radio', { name: 'Dinheiro' }).click()
    await detalhe.getByRole('button', { name: /Receber R\$\s?180,00/ }).click()
    await expect(p.locator(`[data-lista-de-comandas] [data-comanda="${comanda}"]`)).toHaveCount(0)
  })
  expect(await itensDa(comanda)).toEqual([])
  expect(await estoque(serum)).toBe(antes)
})

test('o estorno da venda do produto da comanda devolve o estoque e os pontos dela', async ({ browser }) => {
  const cliente = await rede!.criarCliente('Devolve')
  await dar(cliente, 100)
  const { comanda } = await atendimentoIniciado(cliente)
  await como(balcao!, browser, async p => {
    await p.goto(`/${slug}/pdv?comanda=${comanda}`)
    await chamarAcao(p, 'actions/pdv.ts', 'acrescentarProdutoNaComanda', `/${slug}/pdv`, [comanda, serum, 1, slug])
  })
  expect(await itensDa(comanda), 'o sérum entrou na comanda').toHaveLength(1)
  const antes = await estoque(serum)
  await como(balcao!, browser, async p => {
    await p.goto(`/${slug}/pdv?comanda=${comanda}`)
    const detalhe = p.locator('[data-comanda-aberta]')
    await detalhe.getByTestId('usar-pontos').locator('input[name="pontos"]').fill('100')
    await detalhe.getByRole('radio', { name: 'Pix' }).click()
    // 300 − R$ 5,00 dos pontos.
    await detalhe.getByRole('button', { name: /Receber R\$\s?295,00/ }).click()
    await expect(p.locator(`[data-lista-de-comandas] [data-comanda="${comanda}"]`)).toHaveCount(0)
  })
  expect(await estoque(serum)).toBe(antes - 1)
  const venda = (await itensDa(comanda))[0]!.product_sale_id!
  const tx = (await db().from('financial_transactions').select('id').eq('product_sale_id', venda).single<{ id: string }>()).data!
  const saldoAntes = await saldoDePontos(cliente)
  await como(balcao!, browser, async p => {
    await p.goto(`/${slug}/financeiro`)
    await chamarAcao(p, 'actions/financial.ts', 'reverseTransaction', `/${slug}/financeiro`, [tx.id, slug, 'Devolveu o sérum', true])
  })
  expect(await estoque(serum), 'o produto voltou ao estoque').toBe(antes)
  const { data: doEstorno } = await db().from('loyalty_transactions').select('kind, points')
    .in('kind', ['ESTORNO_RESGATE', 'ESTORNO_GANHO']).eq('loyalty_account_id',
      (await db().from('loyalty_accounts').select('id').eq('client_id', cliente).single<{ id: string }>()).data!.id)
  // R$ 5 dos pontos: 3,00 no atendimento (180/300) e 2,00 no produto → 40 pontos voltam;
  // o produto pagou 118,00 e tinha dado 118 pontos, que saem.
  expect((doEstorno ?? []).map(l => `${l.kind}:${n(l.points)}`).sort()).toEqual(['ESTORNO_GANHO:-118', 'ESTORNO_RESGATE:40'])
  expect(await saldoDePontos(cliente)).toBe(saldoAntes + 40 - 118)
})

test('as recusas: comanda paga, produto que não é de Venda direta, comanda que não existe, quem não recebe', async ({ browser }) => {
  const cliente = await rede!.criarCliente('Recusas')
  const { agendamento, comanda } = await atendimentoIniciado(cliente)
  const semCaixa = await criarMembro(`pdis${marca}`, {
    tenant: rede!.tenantId, branchId: rede!.branchId, rotulo: 'Só agenda',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'MANAGE' }],
  })
  try {
    await como(balcao!, browser, async p => {
      await p.goto(`/${slug}/pdv?comanda=${comanda}`)
      const insumoNao = await chamarAcao(p, 'actions/pdv.ts', 'acrescentarProdutoNaComanda', `/${slug}/pdv`, [comanda, insumo, 1, slug])
      expect(insumoNao.texto).toContain('não é de Venda direta')
      const naoExiste = await chamarAcao(p, 'actions/pdv.ts', 'acrescentarProdutoNaComanda', `/${slug}/pdv`, [crypto.randomUUID(), serum, 1, slug])
      expect(naoExiste.texto).toContain('Comanda não encontrada')
      const demais = await chamarAcao(p, 'actions/pdv.ts', 'acrescentarProdutoNaComanda', `/${slug}/pdv`, [comanda, serum, 99, slug])
      expect(demais.texto).toContain('Estoque insuficiente')
    })
    await como(semCaixa, browser, async p => {
      await p.goto(`/${slug}/agenda`)
      const r = await chamarAcao(p, 'actions/pdv.ts', 'acrescentarProdutoNaComanda', `/${slug}/pdv`, [comanda, serum, 1, slug])
      expect(r.texto).toContain('Sem permissão')
    })
    expect(await itensDa(comanda), 'nada foi acrescentado').toEqual([])
    // Controle: quem recebe acrescenta; paga, a comanda não aceita mais.
    expect((await db().rpc('confirmar_pagamento_do_atendimento', {
      p_agendamento: agendamento, p_tenant: rede!.tenantId, p_ator: null, p_ator_nome: null,
      p_dados: { metodo: 'PIX', valor_final: 180 },
    })).error).toBeNull()
    await como(balcao!, browser, async p => {
      await p.goto(`/${slug}/pdv`)
      const paga = await chamarAcao(p, 'actions/pdv.ts', 'acrescentarProdutoNaComanda', `/${slug}/pdv`, [comanda, serum, 1, slug])
      expect(paga.texto).toContain('já foi paga')
    })
    expect(await itensDa(comanda)).toEqual([])
  } finally {
    await semCaixa.limpar()
  }
})

test('FD2a na Nova venda: o produto vendido usa o voucher e os pontos, à vista', async ({ browser }) => {
  const cliente = await rede!.criarCliente('Vale')
  await dar(cliente, 300)
  const recompensa = (await db().from('loyalty_rewards').insert({
    tenant_id: rede!.tenantId, validity_days: 30, name: `${PREFIXO} Vale 10 ${marca}`, type: 'DESCONTO_VALOR', discount_value: 10, points_cost: 100,
  }).select('id').single<{ id: string }>()).data!.id
  const { data: voucherId, error } = await db().rpc('resgatar_recompensa', {
    p_tenant: rede!.tenantId, p_cliente: cliente, p_recompensa: recompensa, p_unidade: rede!.branchId, p_ator: 'e2e',
  })
  expect(error).toBeNull()
  const antes = await estoque(serum)
  await como(balcao!, browser, async p => {
    const venda = await abrirVendaNoPdv(p, `/${slug}`, cliente)
    const aba = venda.getByRole('button', { name: 'Produto' })
    if (await aba.count()) await aba.click()
    await venda.getByLabel('Produto', { exact: true }).selectOption(serum)
    const fid = venda.locator('[data-pontos-da-venda]')
    await fid.getByLabel('Aplicar voucher').selectOption(voucherId as string)
    // 120 − 10 do voucher = 110; 100 pontos = R$ 5,00.
    await fid.getByLabel('Pontos a usar').fill('100')
    await expect(fid).toContainText('5,00')
    await venda.getByRole('radio', { name: 'Pix', exact: true }).click()
    await euVendi(venda)
    await venda.getByRole('button', { name: /^Vender por R\$\s105,00$/ }).click()
    await expect(venda).toBeHidden()
  })
  const vendaId = (await db().from('product_sales').select('id').eq('client_id', cliente).single<{ id: string }>()).data!.id
  const { data: tx } = await db().from('financial_transactions').select('id, amount, loyalty_discount').eq('product_sale_id', vendaId)
  expect((tx ?? []).map(t => [n(t.amount), n(t.loyalty_discount)])).toEqual([[105, 15]])
  expect((await db().from('loyalty_vouchers').select('status, used_transaction_id').eq('id', voucherId as string).single()).data)
    .toEqual({ status: 'USADO', used_transaction_id: tx![0]!.id })
  const { data: resgate } = await db().from('loyalty_transactions').select('points').eq('transaction_id', tx![0]!.id).eq('kind', 'RESGATE')
  expect((resgate ?? []).map(l => n(l.points))).toEqual([-100])
  expect(await estoque(serum)).toBe(antes - 1)
})

test('FD2a na ficha: o voucher de desconto diz que se usa no PDV; FD2c: a Fidelidade diz "No PDV, ao receber"', async ({ browser }) => {
  const cliente = await rede!.criarCliente('Ficha Vale')
  await dar(cliente, 200)
  const recompensa = (await db().from('loyalty_rewards').insert({
    tenant_id: rede!.tenantId, validity_days: 30, name: `${PREFIXO} Vale ficha ${marca}`, type: 'DESCONTO_VALOR', discount_value: 10, points_cost: 100,
  }).select('id').single<{ id: string }>()).data!.id
  expect((await db().rpc('resgatar_recompensa', {
    p_tenant: rede!.tenantId, p_cliente: cliente, p_recompensa: recompensa, p_unidade: rede!.branchId, p_ator: 'e2e',
  })).error).toBeNull()
  const config = await criarMembro(`pdic${marca}`, {
    tenant: rede!.tenantId, rotulo: 'Configura',
    permissoes: [{ modulo: 'settings', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'loyalty', nivel: 'MANAGE' }],
  })
  try {
    await como(config, browser, async p => {
      await p.goto(`/admin/clients/${cliente}`)
      // A linha do voucher diz o que ele vale (o nome da recompensa fica no extrato).
      const vale = p.getByTestId('voucher').filter({ hasText: 'R$ 10,00 de desconto' })
      await expect(vale.locator('[data-voucher-no-pdv]')).toContainText('no PDV')

      await p.goto('/admin/settings?tab=fidelidade')
      const corpo = p.locator('main')
      await expect(corpo).toContainText('No PDV, ao receber')
      await expect(corpo).not.toContainText(/recepção/i)
    })
  } finally {
    await config.limpar()
  }
})
