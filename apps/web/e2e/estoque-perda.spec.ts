import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * A saída por PERDA (D-7, decisão do Heitor, 2026-10-29): "cria a saída por
 * perda, com motivo (vencido, quebrou, amostra, uso interno), sem gerar
 * despesa, e um relatório de perdas."
 *
 * A única saída era o ajuste ("o ajuste sobrescreve o estoque"), que não diz
 * por quê nem de qual lote, e baixava pelo lote que vence primeiro — o frasco
 * VENCIDO que foi para o lixo ficava no estoque, e saía o bom. Agora a perda
 * é um movimento próprio (LOSS), pelo LOTE escolhido (ou, sem lote, pelo que
 * vence primeiro), com o motivo, o custo do lote e nenhum lançamento; e
 * Relatórios → Estoque tem "Perdas no período" (quantidade e custo por motivo
 * e produto), do banco (metrics_perdas).
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let estoquista: MembroDeTeste | null = null
let slug = ''
const toxina = `${PREFIXO} Toxina perda ${marca}`
let produto = ''
const loteBom = `BOM-${marca}`
const loteVencido = `VENC-${marca}`
const emDias = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString()
const hojeBR = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: estoquista!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}
async function lotes() {
  const { data, error } = await db().from('product_batches').select('batch_number, quantity').eq('product_id', produto).order('batch_number')
  expect(error).toBeNull()
  return Object.fromEntries((data ?? []).map(l => [l.batch_number as string, Number(l.quantity)]))
}
async function saldo() {
  const { data } = await db().from('branch_product_stock').select('current_stock, current_rendimento')
    .eq('product_id', produto).eq('branch_id', rede!.branchId).single<{ current_stock: number; current_rendimento: number }>()
  return { embalagens: Number(data!.current_stock), rendimento: Number(data!.current_rendimento) }
}
async function escolherLote(modal: ReturnType<Page['locator']>, numero: string) {
  const campo = modal.getByLabel('Lote')
  const valor = await campo.locator('option', { hasText: numero }).getAttribute('value')
  await campo.selectOption(valor ?? '')
}
async function abrirPerda(p: Page) {
  await p.goto(`/${slug}/estoque`)
  await p.getByRole('row').filter({ hasText: toxina }).first().getByTitle('Gerenciar estoque').click()
  const modal = p.locator('dialog[open]').filter({ hasText: 'Gerenciar estoque' })
  await modal.getByRole('button', { name: 'Perda', exact: true }).click()
  return modal
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`per${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  const { data, error } = await db().from('products')
    .insert({ tenant_id: rede.tenantId, name: toxina, unit: 'frasco', consumption_unit: 'UI', units_per_package: 100 })
    .select('id').single<{ id: string }>()
  expect(error).toBeNull()
  produto = data!.id
  // Dois frascos bons a R$ 650 (vencem em 60 dias) e um VENCIDO a R$ 600.
  for (const [lote, qtd, custo, validade] of [[loteBom, 2, 650, emDias(60)], [loteVencido, 1, 600, emDias(-5)]] as const) {
    const r = await db().rpc('estoque_entrada', {
      p_produto: produto, p_unidade: rede.branchId, p_quantidade: qtd, p_custo: custo, p_observacao: 'e2e',
      p_lote: lote, p_validade: validade, p_autor: 'e2e',
    })
    expect(r.error).toBeNull()
  }
  estoquista = await criarMembro(`perm${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Estoque',
    permissoes: [{ modulo: 'stock', nivel: 'MANAGE' }, { modulo: 'reports', nivel: 'VIEW' }],
  })
  const aba = await db().from('role_report_tabs').insert({ tenant_id: rede.tenantId, role_id: estoquista.roleId, tab: 'estoque' })
  expect(aba.error).toBeNull()
})

test.afterAll(async () => {
  const falhas: string[] = []
  if (produto) {
    for (const t of ['product_batches', 'stock_movements', 'branch_product_stock']) {
      const r = await db().from(t).delete().eq('product_id', produto)
      if (r.error) falhas.push(`${t}: ${r.error.message}`)
    }
    await db().from('domain_events').delete().eq('entidade_id', produto)
    const r = await db().from('products').delete().eq('id', produto)
    if (r.error) falhas.push(`produto: ${r.error.message}`)
  }
  if (estoquista) await db().from('role_report_tabs').delete().eq('role_id', estoquista.roleId)
  if (rede) {
    const r = await db().from('financial_transactions').delete().eq('branch_id', rede.branchId)
    if (r.error) falhas.push(r.error.message)
  }
  await estoquista?.limpar(); await rede?.limpar()
  expect(falhas).toEqual([])
})

test.describe.serial('a saída por perda', () => {
  test('o frasco vencido sai pelo lote DELE, com o motivo e sem despesa', async ({ browser }) => {
    await como(browser, async p => {
      const modal = await abrirPerda(p)
      await escolherLote(modal, loteVencido)
      await modal.getByLabel('Quantidade').fill('1')
      await modal.getByLabel('Motivo').selectOption('VENCIDO')
      await modal.getByRole('button', { name: 'Registrar perda' }).click()
      await expect(modal).toBeHidden()
    })
    expect(await lotes(), 'saiu o vencido; o bom ficou').toEqual({ [loteBom]: 2, [loteVencido]: 0 })
    expect(await saldo()).toEqual({ embalagens: 2, rendimento: 200 })
    const { data: mov } = await db().from('stock_movements').select('type, quantity, unit_cost, motivo_da_perda')
      .eq('product_id', produto).eq('type', 'LOSS').single<{ type: string; quantity: number; unit_cost: number; motivo_da_perda: string }>()
    expect({ ...mov, quantity: Number(mov!.quantity), unit_cost: Number(mov!.unit_cost) })
      .toEqual({ type: 'LOSS', quantity: -100, unit_cost: 6, motivo_da_perda: 'VENCIDO' })
    const { count } = await db().from('financial_transactions').select('id', { count: 'exact', head: true }).eq('branch_id', rede!.branchId)
    expect(count, 'perda não gera despesa').toBe(0)
  })

  test('mais do que o lote tem é recusado; sem lote, sai o que vence primeiro', async ({ browser }) => {
    await como(browser, async p => {
      let modal = await abrirPerda(p)
      await escolherLote(modal, loteBom)
      await modal.getByLabel('Quantidade').fill('3')
      await modal.getByLabel('Motivo').selectOption('QUEBROU')
      await modal.getByRole('button', { name: 'Registrar perda' }).click()
      await expect(modal.getByText(/o lote tem só 2/i)).toBeVisible()
      await modal.getByRole('button', { name: 'Cancelar' }).click()

      modal = await abrirPerda(p)
      await modal.getByLabel('Quantidade').fill('0,5')
      await modal.getByLabel('Motivo').selectOption('AMOSTRA')
      await modal.getByRole('button', { name: 'Registrar perda' }).click()
      await expect(modal).toBeHidden()
    })
    expect(await lotes()).toEqual({ [loteBom]: 1.5, [loteVencido]: 0 })
    expect(await saldo()).toEqual({ embalagens: 2, rendimento: 150 })
  })

  test('o relatório de perdas: quantidade e custo por motivo, do banco', async ({ browser }) => {
    const dia = hojeBR()
    const { data, error } = await db().rpc('metrics_perdas', {
      p_tenant: rede!.tenantId, p_branch_ids: [rede!.branchId],
      p_from: `${dia}T00:00:00-03:00`, p_to: `${dia}T23:59:59-03:00`,
    })
    expect(error).toBeNull()
    const porMotivo = Object.fromEntries((data as { motivo: string | null; product_id: string | null; custo: number }[])
      .filter(l => l.motivo && !l.product_id).map(l => [l.motivo, Number(l.custo)]))
    expect(porMotivo).toEqual({ VENCIDO: 600, AMOSTRA: 325 })

    await como(browser, async p => {
      await p.goto(`/${slug}/reports?tab=estoque&period=today`)
      const card = p.locator('[data-perdas]')
      await expect(card).toContainText('Vencido')
      await expect(card).toContainText('R$ 600,00')
      await expect(card).toContainText('Amostra')
      await expect(card).toContainText('R$ 325,00')
      await expect(card).toContainText('R$ 925,00')
    })
  })
})
