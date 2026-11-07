import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * A rastreabilidade do lote na 9ª simulação (2026-11-07), da F42:
 * - D6: o "Aplicado em" do lote mostrava a dose do ATENDIMENTO inteiro — a
 *   Carolina recebeu 50 U (44 do TOX-A1 e 6 do TOX-B2) e o TOX-B2 dizia
 *   "Carolina · 50 U". É a dose que saiu DAQUELE lote (`stock_movement_batches`).
 * - D15: o lote esgotado sumia do Estoque e levava junto o "Aplicado em" — e o
 *   recall é justamente do lote que acabou. "Lotes esgotados" no produto.
 * - A12: o "Aplicado em" dizia a hora MARCADA (02:00), não a da aplicação
 *   (00:15, a conclusão). Para o recall vale a hora real (princípio 3).
 * - A13: o giro do Estoque (R$ 243) e os "insumos e produtos" do Financeiro
 *   (R$ 288) diferem pelo custo da revenda, e o Estoque não dizia que conta só
 *   os insumos dos atendimentos.
 *
 * Numa rede [e2e] própria.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let gerente: MembroDeTeste | null = null
let toxina = ''
const nomeDaToxina = `${PREFIXO} Toxina ${marca}`
const loteA = `TOX-A1-${marca}`
const loteB = `TOX-B2-${marca}`
const diaISO = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d)
const emDias = (n: number) => new Date(Date.now() + n * 86_400_000)
const naTela = (iso: string) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

// A Marina foi marcada para as 02:00 de ontem e atendida às 00:15 (antes da hora).
const ontem = emDias(-1)
const marcadoMarina = new Date(`${diaISO(ontem)}T02:00:00-03:00`).toISOString()
const concluidoMarina = new Date(`${diaISO(ontem)}T00:15:00-03:00`).toISOString()
const marcadoCarolina = new Date(`${diaISO(ontem)}T10:00:00-03:00`).toISOString()
const concluidoCarolina = new Date(`${diaISO(ontem)}T10:40:00-03:00`).toISOString()

async function como(browser: Browser, quem: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: quem.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

async function aplicacao(rotulo: string, dose: number, marcado: string, concluido: string) {
  const cliente = await rede!.criarCliente(rotulo)
  const ag = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: cliente, procedure_id: rede!.procedureId, professional_id: rede!.professionalId,
    status: 'COMPLETED', source: 'INTERNAL', duration_min: 30, price: 0, scheduled_at: marcado, completed_at: concluido,
  }).select('id').single<{ id: string }>()
  expect(ag.error).toBeNull()
  // A baixa do atendimento: o gatilho do lote tira pelo FEFO e liga a cada lote.
  expect((await db().from('stock_movements').insert({
    branch_id: rede!.branchId, product_id: toxina, type: 'PROCEDURE_USAGE', quantity: -dose, balance_after: 0,
    appointment_id: ag.data!.id, created_by: 'e2e', created_at: concluido,
  })).error).toBeNull()
}

test.beforeAll(async () => {
  test.setTimeout(150_000)
  rede = await criarOutraRede(`el9${marca}`)
  const { data: p, error } = await db().from('products')
    .insert({ tenant_id: rede.tenantId, name: nomeDaToxina, unit: 'frasco', consumption_unit: 'U', units_per_package: 100 })
    .select('id').single<{ id: string }>()
  expect(error).toBeNull()
  toxina = p!.id
  // 1 frasco do TOX-A1 (vence antes) e 2 do TOX-B2.
  for (const [lote, qtd, dias] of [[loteA, 1, 19], [loteB, 2, 120]] as const) {
    expect((await db().rpc('estoque_entrada', {
      p_produto: toxina, p_unidade: rede.branchId, p_quantidade: qtd, p_custo: 980, p_observacao: null,
      p_lote: lote, p_validade: diaISO(emDias(dias)), p_autor: 'e2e',
    })).error).toBeNull()
  }
  // Marina 56 U (todos do A1); Carolina 50 U: 44 do A1, que acaba, e 6 do B2.
  await aplicacao('Marina', 56, marcadoMarina, concluidoMarina)
  await aplicacao('Carolina', 50, marcadoCarolina, concluidoCarolina)
  gerente = await criarMembro(`el9g${marca}`, {
    tenant: rede.tenantId, rotulo: 'Gerente',
    permissoes: [{ modulo: 'stock', nivel: 'VIEW' }, { modulo: 'clients', nivel: 'VIEW' }],
  })
})

test.afterAll(async () => {
  if (rede) await db().from('appointments').delete().eq('branch_id', rede.branchId)
  await gerente?.limpar(); await rede?.limpar()
})

async function abrirProduto(p: Page) {
  await p.goto('/admin/estoque')
  await p.getByRole('row').filter({ hasText: nomeDaToxina }).first().click()
}

test('D6: o "Aplicado em" do lote diz a dose que saiu DAQUELE lote', async ({ browser }) => {
  await como(browser, gerente!, async p => {
    await abrirProduto(p)
    const linha = p.locator('[data-lotes-do-produto]').filter({ hasText: loteB })
    await linha.getByRole('button', { name: 'Aplicado em' }).click()
    const janela = p.getByRole('dialog', { name: /Aplicado em/ })
    const carolina = janela.locator('[data-aplicacao-do-lote]').filter({ hasText: 'Carolina' })
    await expect(carolina).toContainText('6 U')
    await expect(carolina).not.toContainText('50 U')
    await expect(janela.locator('[data-aplicacao-do-lote]').filter({ hasText: 'Marina' })).toHaveCount(0)
  })
})

test('D15 e A12: o lote esgotado continua com o "Aplicado em", e a hora é a da aplicação', async ({ browser }) => {
  await como(browser, gerente!, async p => {
    await abrirProduto(p)
    await expect(p.locator('[data-lotes-do-produto]').filter({ hasText: loteA }), 'o A1 não tem saldo').toHaveCount(0)
    await p.getByRole('button', { name: /Lotes esgotados/ }).click()
    const esgotado = p.locator('[data-lote-esgotado]').filter({ hasText: loteA })
    await expect(esgotado).toBeVisible()
    await esgotado.getByRole('button', { name: 'Aplicado em' }).click()
    const janela = p.getByRole('dialog', { name: /Aplicado em/ })
    const marina = janela.locator('[data-aplicacao-do-lote]').filter({ hasText: 'Marina' })
    await expect(marina).toContainText('56 U')
    await expect(janela.locator('[data-aplicacao-do-lote]').filter({ hasText: 'Carolina' })).toContainText('44 U')
    // A12: a hora da aplicação (a conclusão, 00:15), não a marcada (02:00).
    await expect(marina).toContainText(naTela(concluidoMarina))
    await expect(marina).not.toContainText(naTela(marcadoMarina))
  })
})

test('A13: o giro do Estoque diz que conta só os insumos dos atendimentos', async ({ browser }) => {
  await como(browser, gerente!, async p => {
    await p.goto('/admin/estoque')
    await expect(p.locator('[data-kpi="giro"]')).toContainText('insumos dos atendimentos')
  })
})
