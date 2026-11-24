import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'

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
      await modal.getByLabel('Motivo').selectOption({ label: 'Vencido' })
      await modal.getByRole('button', { name: 'Registrar perda' }).click()
      await expect(modal).toBeHidden()
    })
    expect(await lotes(), 'saiu o vencido; o bom ficou').toEqual({ [loteBom]: 2, [loteVencido]: 0 })
    expect(await saldo()).toEqual({ embalagens: 2, rendimento: 200 })
    const { data: mov } = await db().from('stock_movements').select('type, quantity, unit_cost, motivo_da_perda')
      .eq('product_id', produto).eq('type', 'LOSS').single<{ type: string; quantity: number; unit_cost: number; motivo_da_perda: string }>()
    expect({ ...mov, quantity: Number(mov!.quantity), unit_cost: Number(mov!.unit_cost) })
      .toEqual({ type: 'LOSS', quantity: -100, unit_cost: 6, motivo_da_perda: 'Vencido' })
    const { count } = await db().from('financial_transactions').select('id', { count: 'exact', head: true }).eq('branch_id', rede!.branchId)
    expect(count, 'perda não gera despesa').toBe(0)
  })

  test('mais do que o lote tem é recusado; sem lote, sai o que vence primeiro', async ({ browser }) => {
    await como(browser, async p => {
      let modal = await abrirPerda(p)
      await escolherLote(modal, loteBom)
      await modal.getByLabel('Quantidade').fill('3')
      await modal.getByLabel('Motivo').selectOption({ label: 'Quebrou' })
      await modal.getByRole('button', { name: 'Registrar perda' }).click()
      await expect(modal.getByText(/o lote tem só 2/i)).toBeVisible()
      await modal.getByRole('button', { name: 'Cancelar' }).click()

      modal = await abrirPerda(p)
      await modal.getByLabel('Quantidade').fill('0,5')
      await modal.getByLabel('Motivo').selectOption({ label: 'Amostra' })
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
    expect(porMotivo).toEqual({ Vencido: 600, Amostra: 325 })

    await como(browser, async p => {
      await p.goto(`/${slug}/reports?tab=estoque&period=today`)
      const card = p.locator('[data-perdas]')
      await expect(card).toContainText('Vencido')
      await expect(card).toContainText('R$ 600,00')
      await expect(card).toContainText('Amostra')
      await expect(card).toContainText('R$ 325,00')
      await expect(card).toContainText('R$ 925,00')
      // est-04/est-05 (revisão de 2026-11-02): a perda é MÉTRICA — "já foi paga
      // na compra", não sai do lucro nem do caixa —, e o relatório dá o custo
      // com perdas para análise: o consumo (zero aqui) + as perdas.
      const kpi = (r: string) => p.getByText(r, { exact: true }).first().locator('xpath=ancestor::div[contains(@class,"card")][1]')
      await expect(kpi('Perdas no período')).toContainText('925,00')
      // A regra mora na dica do cartão (2026-11-16).
      await kpi('Perdas no período').locator('[data-dica-botao]').hover()
      await expect(kpi('Perdas no período')).toContainText('não entra no lucro')
      await expect(kpi('Consumo com perdas')).toContainText('925,00')
    })
  })
})

/**
 * Os motivos da perda e as movimentações do período, numa rede [e2e] própria
 * de uma unidade (a da perda acima não se mexe: o relatório dela soma só os
 * motivos dela).
 *
 * - Os motivos da perda são um cadastro da REDE (o Heitor, 18/11: "motivos de
 *   perda configuraveis, poder adicionar/editar/excluir"; atendimento.md
 *   §9.5), ao lado das categorias, das marcas e dos fornecedores. A rede nasce
 *   com os quatro de antes (Vencido, Quebrou, Amostra, Uso interno),
 *   editáveis. Quem mexe é quem tem o Estoque em Gerenciar (decisão do Claude,
 *   pela regra das outras três listas). Excluir um motivo usado não apaga a
 *   história: a perda guarda o nome.
 * - Relatórios → Estoque lista as movimentações do período (o Heitor, 18/11:
 *   "ok"; indicadores.md) — data, produto, tipo, quantidade, lote/validade,
 *   unidade, quem fez e custo —, paginada no banco; e a tabela de perdas diz
 *   o lote.
 */
test.describe.serial('os motivos de perda da rede e as movimentações do período', () => {
  test.describe.configure({ timeout: 240_000 })
  test.use({ storageState: { cookies: [], origins: [] } })

  let outra: OutraRede
  let slugDaOutra = ''
  let quemGerencia: MembroDeTeste
  let quemVe: MembroDeTeste
  let acido = ''
  const nomeDoAcido = `${PREFIXO} Ácido mm ${marca}`
  const lote = `MM-${marca}`
  const motivo = `${PREFIXO} Frasco aberto ${marca}`
  const validade = new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10)
  const validadeBR = validade.split('-').reverse().join('/')

  async function comoMembro(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<void>) {
    const ctx = await browser.newContext({ storageState: m.estado, viewport: { width: 1440, height: 900 } })
    try { await fn(await ctx.newPage()) } finally { await ctx.close() }
  }
  async function motivosDaRede(): Promise<{ id: string; nome: string }[]> {
    const { data, error } = await db().from('estoque_motivos_de_perda').select('id, nome').eq('tenant_id', outra.tenantId).order('nome')
    expect(error).toBeNull()
    return (data ?? []) as { id: string; nome: string }[]
  }
  async function abrirPerdaDoAcido(p: Page) {
    await p.goto(`/${slugDaOutra}/estoque`)
    await p.getByRole('row').filter({ hasText: nomeDoAcido }).first().getByTitle('Gerenciar estoque').click()
    const modal = p.locator('dialog[open]').filter({ hasText: 'Gerenciar estoque' })
    await modal.getByRole('button', { name: 'Perda', exact: true }).click()
    return modal
  }

  test.beforeAll(async () => {
    outra = await criarOutraRede(`emm${marca}`)
    const b = db()
    expect((await b.from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', outra.tenantId)).error).toBeNull()
    slugDaOutra = (await b.from('branches').select('slug').eq('id', outra.branchId).single<{ slug: string }>()).data!.slug
    const { data, error } = await b.from('products')
      .insert({ tenant_id: outra.tenantId, name: nomeDoAcido, unit: 'un', cost_price: 40, uso: 'INSUMO', min_stock: 0 })
      .select('id').single<{ id: string }>()
    expect(error).toBeNull()
    acido = data!.id
    const r = await b.rpc('estoque_entrada', {
      p_produto: acido, p_unidade: outra.branchId, p_quantidade: 10, p_custo: 40, p_observacao: 'e2e',
      p_lote: lote, p_validade: validade, p_autor: 'e2e',
    })
    expect(r.error).toBeNull()
    quemGerencia = await criarMembro(`emme${marca}`, {
      tenant: outra.tenantId, branchId: outra.branchId, rotulo: 'Estoque',
      permissoes: [{ modulo: 'stock', nivel: 'MANAGE' }, { modulo: 'reports', nivel: 'VIEW' }],
    })
    expect((await b.from('role_report_tabs').insert({ tenant_id: outra.tenantId, role_id: quemGerencia.roleId, tab: 'estoque' })).error).toBeNull()
    quemVe = await criarMembro(`emmv${marca}`, {
      tenant: outra.tenantId, branchId: outra.branchId, rotulo: 'Estoque em Ver', permissoes: [{ modulo: 'stock', nivel: 'VIEW' }],
    })
  })

  test.afterAll(async () => {
    const falhas: string[] = []
    if (acido) {
      for (const t of ['product_batches', 'stock_movements', 'branch_product_stock']) {
        const r = await db().from(t).delete().eq('product_id', acido)
        if (r.error) falhas.push(`${t}: ${r.error.message}`)
      }
      await db().from('domain_events').delete().eq('entidade_id', acido)
      const r = await db().from('products').delete().eq('id', acido)
      if (r.error) falhas.push(`produto: ${r.error.message}`)
    }
    if (quemGerencia) await db().from('role_report_tabs').delete().eq('role_id', quemGerencia.roleId)
    await quemGerencia?.limpar(); await quemVe?.limpar(); await outra?.limpar()
    expect(falhas).toEqual([])
  })

  test('a rede nasce com os quatro motivos de antes, editáveis', async () => {
    expect((await motivosDaRede()).map(m => m.nome).sort()).toEqual(['Amostra', 'Quebrou', 'Uso interno', 'Vencido'])
  })

  test('quem só vê o Estoque não cria nem exclui motivo (o cadastro é de quem tem o Estoque em Gerenciar)', async ({ browser }) => {
    const alvo = (await motivosDaRede()).find(m => m.nome === 'Amostra')!
    await comoMembro(browser, quemVe, async p => {
      const c = await chamarAcao(p, 'actions/stock.ts', 'criarItemDoEstoque', `/${slugDaOutra}/estoque`, ['motivos', `${motivo} de quem vê`])
      expect(c.texto).not.toContain('"id"')
      const e = await chamarAcao(p, 'actions/stock.ts', 'excluirItemDoEstoque', `/${slugDaOutra}/estoque`, ['motivos', alvo.id])
      expect(e.texto).not.toContain('"success":true')
      await p.goto(`/${slugDaOutra}/estoque`)
      await expect(p.getByRole('button', { name: 'Motivos de perda', exact: true })).toHaveCount(0)
    })
    expect((await motivosDaRede()).map(m => m.nome)).toContain('Amostra')
    expect((await motivosDaRede()).map(m => m.nome)).not.toContain(`${motivo} de quem vê`)
  })

  test('na tela: cria, renomeia e usa o motivo na perda; excluído, a perda guarda o nome', async ({ browser }) => {
    await comoMembro(browser, quemGerencia, async p => {
      await p.goto(`/${slugDaOutra}/estoque`)
      await p.getByRole('button', { name: 'Motivos de perda', exact: true }).click()
      const janela = p.getByRole('dialog', { name: 'Motivos de perda' })
      for (const nome of ['Vencido', 'Quebrou', 'Amostra', 'Uso interno']) {
        await expect(janela.locator(`[data-item-da-lista="${nome}"]`), nome).toBeVisible()
      }
      await janela.getByLabel('Novo motivo').fill(`${motivo} rascunho`)
      await janela.getByRole('button', { name: 'Adicionar' }).click()
      const linha = janela.locator(`[data-item-da-lista="${motivo} rascunho"]`)
      await expect(linha).toBeVisible()
      await linha.getByRole('button', { name: `Renomear ${motivo} rascunho` }).click()
      await janela.getByLabel(`Novo nome de ${motivo} rascunho`).fill(motivo)
      await janela.getByRole('button', { name: 'Salvar' }).click()
      await expect(janela.locator(`[data-item-da-lista="${motivo}"]`)).toBeVisible()

      const modal = await abrirPerdaDoAcido(p)
      await modal.getByLabel('Quantidade').fill('2')
      await modal.getByLabel('Motivo').selectOption({ label: motivo })
      await modal.getByRole('button', { name: 'Registrar perda' }).click()
      await expect(modal).toBeHidden()
    })
    const id = (await motivosDaRede()).find(m => m.nome === motivo)!.id
    const { data: mov } = await db().from('stock_movements').select('quantity, motivo_da_perda, motivo_da_perda_id')
      .eq('product_id', acido).eq('type', 'LOSS').single<{ quantity: number; motivo_da_perda: string; motivo_da_perda_id: string | null }>()
    expect({ ...mov, quantity: Number(mov!.quantity) }).toEqual({ quantity: -2, motivo_da_perda: motivo, motivo_da_perda_id: id })

    // Excluir o motivo usado: sai das opções, a perda fica com o nome.
    await comoMembro(browser, quemGerencia, async p => {
      await p.goto(`/${slugDaOutra}/estoque`)
      await p.getByRole('button', { name: 'Motivos de perda', exact: true }).click()
      const janela = p.getByRole('dialog', { name: 'Motivos de perda' })
      const linha = janela.locator(`[data-item-da-lista="${motivo}"]`)
      await linha.getByRole('button', { name: `Excluir ${motivo}` }).click()
      await linha.getByRole('button', { name: 'Excluir', exact: true }).click()
      await expect(linha).toHaveCount(0)
      const modal = await abrirPerdaDoAcido(p)
      await expect(modal.getByLabel('Motivo').locator('option', { hasText: motivo })).toHaveCount(0)
    })
    const { data: depois } = await db().from('stock_movements').select('motivo_da_perda, motivo_da_perda_id')
      .eq('product_id', acido).eq('type', 'LOSS').single<{ motivo_da_perda: string; motivo_da_perda_id: string | null }>()
    expect(depois).toEqual({ motivo_da_perda: motivo, motivo_da_perda_id: null })
  })

  test('no relatório: a perda por motivo com o lote, e as movimentações do período', async ({ browser }) => {
    await comoMembro(browser, quemGerencia, async p => {
      await p.goto(`/${slugDaOutra}/reports?tab=estoque&period=today`)
      const perdas = p.locator('[data-perdas]')
      await expect(perdas).toContainText(motivo)
      await expect(perdas).toContainText(lote)
      await expect(perdas).toContainText('R$ 80,00')

      const lista = p.locator('[data-movimentos-do-estoque]')
      await expect(lista).toContainText('Movimentações do período')
      // Uma unidade só: a coluna Unidade fica guardada (princípio 7).
      for (const col of ['Data', 'Produto', 'Tipo', 'Quantidade', 'Lote', 'Quem fez', 'Custo']) {
        await expect(lista.getByRole('columnheader', { name: col, exact: true }), col).toBeVisible()
      }
      await expect(lista.getByRole('columnheader', { name: 'Unidade', exact: true })).toHaveCount(0)

      const perda = lista.locator('tr[data-movimento="PERDA"]').filter({ hasText: nomeDoAcido })
      await expect(perda).toContainText(`Perda: ${motivo}`)
      await expect(perda).toContainText('-2')
      await expect(perda).toContainText(`${lote} · val. ${validadeBR}`)
      await expect(perda).toContainText(`${PREFIXO} Estoque emme${marca}`)
      await expect(perda).toContainText('R$ 80,00')

      const entrada = lista.locator('tr[data-movimento="ENTRADA"]').filter({ hasText: nomeDoAcido })
      await expect(entrada).toContainText('Entrada')
      await expect(entrada).toContainText('+10')
      await expect(entrada).toContainText(lote)
      await expect(entrada).toContainText('R$ 400,00')
    })
  })

  test('a lista pagina no banco (50 por página), com o total', async ({ browser }) => {
    for (let i = 0; i < 50; i++) {
      const r = await db().rpc('estoque_entrada', {
        p_produto: acido, p_unidade: outra.branchId, p_quantidade: 1, p_custo: 40, p_observacao: 'e2e',
        p_lote: null, p_validade: null, p_autor: 'e2e',
      })
      expect(r.error, `entrada ${i}`).toBeNull()
    }
    const { count } = await db().from('stock_movements').select('id', { count: 'exact', head: true }).eq('product_id', acido)
    await comoMembro(browser, quemGerencia, async p => {
      await p.goto(`/${slugDaOutra}/reports?tab=estoque&period=today`)
      const lista = p.locator('[data-movimentos-do-estoque]')
      await expect(lista.locator('[data-movimentos-pagina]')).toHaveText(`1–50 de ${count}`)
      await expect(lista.locator('tbody tr')).toHaveCount(50)
      await lista.getByRole('button', { name: 'Próxima' }).click()
      await expect(p).toHaveURL(/pagina=2/)
      await expect(lista.locator('[data-movimentos-pagina]')).toHaveText(`51–${count} de ${count}`)
      await expect(lista.locator('tbody tr')).toHaveCount(count! - 50)
      await expect(lista.getByRole('button', { name: 'Próxima' })).toBeDisabled()
    })
  })
})
