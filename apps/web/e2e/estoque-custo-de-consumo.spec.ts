import { test, expect, type Browser } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * O custo do insumo é o da UNIDADE DE CONSUMO, em todo lugar (D1, D2, D3 e
 * A39 da simulação de 2026-10-27).
 *
 * A simulação viu 5 ml de ácido (frasco de 100 ml a R$ 90) custarem R$ 450:
 * a conclusão gravava no movimento o preço do FRASCO, e a quantidade estava em
 * ml. Daí o consumo de R$ 450, o giro, o "Giro do mês", e a comissão com
 * "descontar insumos" descontaria R$ 450. A compra gravava 5 (frascos) e o
 * consumo −5 com saldo 495 (ml) — o mesmo histórico em duas unidades.
 *
 * Regra (decisões do Heitor): custo por unidade de consumo = custo da
 * embalagem ÷ o que ela rende; todo movimento e todo saldo do movimento na
 * unidade de consumo; o valor em estoque é o saldo em consumo × esse custo; o
 * gráfico de evolução não soma o consumo à despesa (o consumo é informativo, e
 * movimentação de estoque nunca gera despesa — D13 revisto, 2026-10-28).
 *
 * Numa rede [e2e] própria: a configuração de comissão é da rede.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let gestor: MembroDeTeste | null = null
let produto = ''
let procedimento = ''
let cliente = ''
let segunda = ''
let agendamento = ''

const n = (v: unknown) => Number(v ?? 0)
const NOME_DO_PROC = `${PREFIXO} Limpeza ${marca}`

test.beforeAll(async () => {
  rede = await criarOutraRede(`cq${marca}`)
  // Frasco de 100 ml a R$ 90 — R$ 0,90 o ml. Sem saldo: a entrada é do teste.
  produto = await rede.criarProduto('Ácido glicólico', 0)
  const { error: eP } = await db().from('products')
    .update({ unit: 'frasco', consumption_unit: 'ml', units_per_package: 100, cost_price: 90 }).eq('id', produto)
  expect(eP).toBeNull()

  const { data: proc, error: ePr } = await db().from('procedures').insert({
    tenant_id: rede.tenantId, name: NOME_DO_PROC, category: 'e2e', duration_min: 30,
    price: 180, labor_cost: 0, other_costs: 0, is_active: true,
  }).select('id').single<{ id: string }>()
  expect(ePr).toBeNull()
  procedimento = proc!.id
  const { error: ePp } = await db().from('procedure_products').insert({ procedure_id: procedimento, product_id: produto, quantity: 5 })
  expect(ePp).toBeNull()

  // 10% sobre o preço, descontando os insumos.
  await db().from('users').update({ provides_services: true }).eq('id', rede.professionalId)
  const { error: eR } = await db().from('commission_rules').insert({
    tenant_id: rede.tenantId, professional_id: rede.professionalId, procedure_id: null, type: 'PERCENTAGE', value: 10, is_active: true,
  })
  expect(eR).toBeNull()
  const { error: eC } = await db().from('commission_configs').upsert({
    tenant_id: rede.tenantId, modo: 'ATENDIMENTO', desconta_insumos: true, desconta_taxa: false,
    base_com_pontos: 'PRECO', periodo: 'MENSAL',
  }, { onConflict: 'tenant_id' })
  expect(eC).toBeNull()

  cliente = await rede.criarCliente('Insumo')
  const { data: b2, error: eB } = await db().from('branches')
    .insert({ tenant_id: rede.tenantId, name: `${PREFIXO} Segunda ${marca}`, slug: `e2e-cq2-${marca}` })
    .select('id').single<{ id: string }>()
  expect(eB).toBeNull()
  segunda = b2!.id

  gestor = await criarMembro(`cqg${marca}`, {
    tenant: rede.tenantId, rotulo: 'Gestora',
    permissoes: [
      { modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'MANAGE' },
      { modulo: 'medical_records', nivel: 'MANAGE' }, { modulo: 'stock', nivel: 'MANAGE' },
      { modulo: 'procedures', nivel: 'VIEW' }, { modulo: 'cashier', nivel: 'MANAGE' },
      { modulo: 'reports', nivel: 'VIEW' },
    ],
  })
  const { error: eA } = await db().from('role_report_tabs').insert([
    { tenant_id: rede.tenantId, role_id: gestor.roleId, tab: 'overview' },
    { tenant_id: rede.tenantId, role_id: gestor.roleId, tab: 'financeiro' },
  ])
  expect(eA).toBeNull()
})

test.afterAll(async () => {
  if (gestor) {
    await db().from('role_report_tabs').delete().eq('role_id', gestor.roleId)
    await gestor.limpar()
  }
  if (!rede) return
  await db().from('procedure_products').delete().eq('procedure_id', procedimento)
  if (segunda) {
    await db().from('stock_movements').delete().eq('branch_id', segunda)
    await db().from('product_batches').delete().eq('branch_id', segunda)
    await db().from('branch_product_stock').delete().eq('branch_id', segunda)
  }
  await rede.limpar()
  if (segunda) {
    const { error } = await db().from('branches').delete().eq('id', segunda)
    expect(error).toBeNull()
    await db().from('tenants').delete().eq('id', rede.tenantId)
  }
})

async function movimentos() {
  const { data, error } = await db().from('stock_movements')
    .select('type, quantity, balance_after, unit_cost, branch_id')
    .eq('product_id', produto).order('created_at').order('type')
  expect(error).toBeNull()
  return (data ?? []).map(m => ({
    tipo: m.type as string, qtd: n(m.quantity), saldo: n(m.balance_after),
    custo: m.unit_cost == null ? null : n(m.unit_cost), unidade: m.branch_id === segunda ? 'segunda' : 'primeira',
  }))
}

async function finalizarPelaTela(browser: Browser, ap: string) {
  const ctx = await browser.newContext({ storageState: gestor!.estado })
  try {
    const p = await ctx.newPage()
    await p.goto(`/admin/agenda/${ap}`)
    await p.getByRole('button', { name: 'Finalizar atendimento' }).click()
    await p.locator('textarea[name="notes"]').fill(`${PREFIXO} custo do insumo`)
    await p.getByRole('button', { name: 'Confirmar conclusão' }).click()
    await expect.poll(async () => (await db().from('appointments').select('status').eq('id', ap).single()).data?.status,
      { message: 'a tela conclui', timeout: 20_000 }).toBe('COMPLETED')
  } finally { await ctx.close() }
}

const janela = () => {
  const agora = Date.now()
  return { de: new Date(agora - 86_400_000).toISOString(), ate: new Date(agora + 3_600_000).toISOString() }
}

test.describe.serial('o custo do insumo, na unidade de consumo', () => {
  test('a entrada de 5 frascos de 100 ml grava 500 ml, a R$ 0,90 o ml', async () => {
    const { error } = await db().rpc('estoque_entrada', {
      p_produto: produto, p_unidade: rede!.branchId, p_quantidade: 5, p_custo: 90,
      p_observacao: null, p_lote: null, p_validade: null, p_autor: 'e2e',
    })
    expect(error).toBeNull()
    expect(await movimentos()).toEqual([{ tipo: 'PURCHASE', qtd: 500, saldo: 500, custo: 0.9, unidade: 'primeira' }])
    // O saldo continua contado nas duas: 5 frascos, 500 ml. E o custo do
    // cadastro segue sendo o da EMBALAGEM.
    const { data: s } = await db().from('branch_product_stock').select('current_stock, current_rendimento')
      .eq('product_id', produto).eq('branch_id', rede!.branchId).single()
    expect([n(s!.current_stock), n(s!.current_rendimento)]).toEqual([5, 500])
    const { data: p } = await db().from('products').select('cost_price').eq('id', produto).single()
    expect(n(p!.cost_price)).toBe(90)
  })

  test('5 ml custam R$ 4,50: no movimento, no giro, no relatório, na margem e na comissão', async ({ browser }) => {
    const { data: ap, error } = await db().from('appointments').insert({
      branch_id: rede!.branchId, client_id: cliente, professional_id: rede!.professionalId, procedure_id: procedimento,
      scheduled_at: new Date().toISOString(), duration_min: 30, price: 180, status: 'IN_PROGRESS', source: 'INTERNAL',
    }).select('id').single<{ id: string }>()
    expect(error).toBeNull()
    agendamento = ap!.id
    await finalizarPelaTela(browser, agendamento)

    // O movimento: −5 ml, saldo 495 ml, R$ 0,90 o ml.
    const consumo = (await movimentos()).find(m => m.tipo === 'PROCEDURE_USAGE')
    expect(consumo).toEqual({ tipo: 'PROCEDURE_USAGE', qtd: -5, saldo: 495, custo: 0.9, unidade: 'primeira' })

    // O giro (dashboard e estoque).
    const { de, ate } = janela()
    const { data: giro, error: eG } = await db().rpc('metrics_giro_estoque', { p_branch_ids: [rede!.branchId], p_from: de, p_to: ate })
    expect(eG).toBeNull()
    expect(n(giro)).toBe(4.5)

    // O relatório: o consumo e a margem por faixa etária.
    const relatorio = async (aba: string) => {
      const { data, error: e } = await db().rpc('metrics_relatorio', {
        p_tenant: rede!.tenantId, p_branch_ids: [rede!.branchId], p_from: de, p_to: ate,
        p_prev_from: de, p_prev_to: de, p_aba: aba, p_granularidade: 'day',
      })
      expect(e).toBeNull()
      return data as Record<string, unknown>
    }
    const fin = await relatorio('financeiro')
    expect(n(fin.consumo_total)).toBe(4.5)
    const procs = await relatorio('procedimentos')
    const margem = (procs.margem_por_faixa as { nome: string; margem: number }[]).find(x => x.nome === NOME_DO_PROC)
    expect(margem, 'o procedimento tem margem').toBeTruthy()
    expect(Math.round(n(margem!.margem) * 100) / 100).toBe(97.5)

    // A margem do dashboard: a MESMA conta.
    const { data: mg, error: eM } = await db().rpc('metrics_margem_procedimentos', { p_tenant: rede!.tenantId, p_limit: 10 })
    expect(eM).toBeNull()
    const linha = (mg as { procedure_name: string; cost: number; margin_pct: number }[]).find(x => x.procedure_name === NOME_DO_PROC)
    expect([n(linha!.cost), n(linha!.margin_pct)]).toEqual([4.5, 97.5])

    // A comissão com "descontar insumos": (180 − 4,50) × 10% = 17,55.
    const { data: cl } = await db().from('commission_lines').select('id, custo_insumos').eq('appointment_id', agendamento).single()
    expect(n(cl!.custo_insumos)).toBe(4.5)
    const { data: extrato } = await db().from('commissions').select('amount').eq('line_id', cl!.id)
    expect((extrato ?? []).map(c => n(c.amount))).toEqual([17.55])
  })

  test('o valor em estoque é o saldo em ml × o custo do ml: 495 × R$ 0,90', async () => {
    const { data, error } = await db().rpc('metrics_valor_em_estoque', { p_branch_ids: [rede!.branchId] })
    expect(error).toBeNull()
    expect(n(data)).toBe(445.5)
  })

  test('ajuste e transferência também gravam em ml', async () => {
    // Ajuste para 4 frascos: o aberto continua aberto — 395 ml (4 × 100 − os 5 usados).
    const { error: eA } = await db().rpc('estoque_ajuste', {
      p_produto: produto, p_unidade: rede!.branchId, p_novo_saldo: 4, p_motivo: 'contagem', p_autor: 'e2e',
    })
    expect(eA).toBeNull()
    // Um frasco para a segunda unidade: 100 ml saem, 100 ml entram.
    const { error: eT } = await db().rpc('estoque_transferir', {
      p_produto: produto, p_origem: rede!.branchId, p_destino: segunda, p_quantidade: 1, p_observacao: null, p_autor: 'e2e',
    })
    expect(eT).toBeNull()
    const ms = await movimentos()
    expect(ms.filter(m => m.tipo !== 'PURCHASE' && m.tipo !== 'PROCEDURE_USAGE').map(m => ({ tipo: m.tipo, qtd: m.qtd, saldo: m.saldo, unidade: m.unidade }))).toEqual([
      { tipo: 'MANUAL_ADJUSTMENT', qtd: -100, saldo: 395, unidade: 'primeira' },
      { tipo: 'TRANSFER_IN', qtd: 100, saldo: 100, unidade: 'segunda' },
      { tipo: 'TRANSFER_OUT', qtd: -100, saldo: 295, unidade: 'primeira' },
    ])
  })

  test('a tela: o gráfico não soma o consumo à despesa, e o DRE não tem a linha fixa em zero', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: gestor!.estado })
    try {
      const p = await ctx.newPage()
      const brl = (t: string) => Number((/R\$\s*(-?[\d.]+,\d{2})/.exec(t)?.[1] ?? 'NaN').replace(/\./g, '').replace(',', '.'))

      await p.goto('/admin/reports?period=month')
      const despesas = p.getByText('Despesas', { exact: true }).first()
      await expect(despesas).toBeVisible()
      const cartao = despesas.locator('xpath=ancestor::div[contains(@class,"card")][1]')
      // Nenhuma despesa paga nesta rede: o cartão diz zero (o número é animado).
      await expect.poll(async () => brl(await cartao.innerText()), { timeout: 10_000 }).toBe(0)
      const grafico = p.locator('div.card').filter({ hasText: 'Evolução do Período' }).first()
      const custo = grafico.getByText('Custo', { exact: true }).locator('xpath=following-sibling::p[1]')
      expect(brl(await custo.innerText()), 'o custo do gráfico é a despesa paga — o consumo não entra').toBe(0)

      await p.goto('/admin/reports?period=month&tab=financeiro')
      await expect(p.getByText('Consumo de insumos', { exact: true })).toBeVisible()
      await expect(p.getByText(/Custo de Insumos/)).toHaveCount(0)
      // O consumo é informativo: o estoque não gera despesa (D13 revisto).
      await expect(p.getByText('Informativo: não entra no lucro', { exact: true })).toBeVisible()
      await expect(p.getByText(/a compra já está nas despesas/i)).toHaveCount(0)
    } finally { await ctx.close() }
  })

  test('o histórico do estoque mostra os movimentos em ml', async ({ browser }) => {
    test.setTimeout(120_000)
    const ctx = await browser.newContext({ storageState: gestor!.estado })
    try {
      const p = await ctx.newPage()
      await p.goto('/admin/estoque')
      const engrenagem = p.locator('tr, [role="row"], div').filter({ hasText: `Ácido glicólico cq${marca}` })
        .filter({ has: p.getByTitle('Gerenciar estoque') }).last()
        .getByTitle('Gerenciar estoque')
      const modal = p.locator('dialog[open]').filter({ hasText: 'Gerenciar estoque' })
      // No next dev o clique pode chegar antes da hidratação: tenta de novo até abrir.
      await expect(async () => {
        await engrenagem.click()
        await expect(modal).toBeVisible({ timeout: 2_000 })
      }).toPass({ timeout: 30_000 })
      await modal.getByRole('button', { name: 'Histórico', exact: true }).click()
      // A compra de 5 frascos: +500 ml; o consumo: −5 ml, com o saldo em ml e em frascos.
      await expect(modal.getByText('+500 ml', { exact: true })).toBeVisible()
      await expect(modal.getByText('-5 ml', { exact: true })).toBeVisible()
      await expect(modal.getByText('saldo 495 ml · 4,95 frasco', { exact: true })).toBeVisible()
    } finally { await ctx.close() }
  })
})
