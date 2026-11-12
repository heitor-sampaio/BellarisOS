import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * Os atritos do Estoque da 10ª simulação (2026-11-10), da F51:
 * - A36: "Lotes esgotados" parecia um estado, e aparecia em produto que nunca
 *   teve lote — vira "Ver lotes esgotados", só quando há algum.
 * - A37: a Entrada não dizia que não gera despesa (a Perda diz) e não tinha
 *   fornecedor nem nota estruturados — os dois papéis do Time B lançaram a
 *   compra à mão.
 * - A38: o Ajuste negativo não escolhia o lote (desfazer duas entradas erradas
 *   zerou o lote real pelo FEFO), e não havia como desfazer uma entrada.
 * - A40: os cartões do topo saíam cortados a 1440 px, e o "Validade em 30
 *   dias" dizia só o produto, sem o lote nem a data.
 * - A41: salvar o estoque mínimo era um ícone sem rótulo nem confirmação.
 * - A39: o "abaixo do mínimo" não chegava ao dashboard da unidade.
 * Numa rede [e2e] própria, de uma unidade.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let slug = ''
let dona: MembroDeTeste | null = null
let gel = ''
let luva = ''
let mascara = ''
const nomeGel = `${PREFIXO} Gel ${marca}`
const nomeLuva = `${PREFIXO} Luva ${marca}`
const nomeMascara = `${PREFIXO} Mascara ${marca}`
const loteA = `UA-${marca}`
const loteB = `UB-${marca}`
const loteM = `UM-${marca}`
const loteC = `UC-${marca}`
const diaISO = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d)
const diaBR = (d: Date) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' }).format(d)
const emDias = (n: number) => new Date(Date.now() + n * 86_400_000)
const n = (v: unknown) => Number(v)

async function como(browser: Browser, m: { estado: string }, fn: (p: Page) => Promise<void>, viewport?: { width: number; height: number }) {
  const ctx = await browser.newContext({ storageState: m.estado, ...(viewport ? { viewport } : {}) })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}
const valorEmEstoque = async () => n((await db().rpc('metrics_valor_em_estoque', { p_branch_ids: [rede!.branchId] })).data)
const qtdDoLote = async (numero: string) => n((await db().from('product_batches').select('quantity').eq('batch_number', numero).single<{ quantity: number }>()).data!.quantity)
const saldo = async (produto: string) => n((await db().from('branch_product_stock').select('current_stock').eq('product_id', produto).eq('branch_id', rede!.branchId).single<{ current_stock: number }>()).data!.current_stock)

async function abrirGerenciar(p: Page, nome: string) {
  await p.goto(`/${slug}/estoque`)
  await p.getByRole('row').filter({ hasText: nome }).first().getByTitle('Gerenciar estoque').click()
  return p.locator('dialog[open]').filter({ hasText: 'Gerenciar estoque' })
}

test.beforeAll(async () => {
  test.setTimeout(150_000)
  rede = await criarOutraRede(`eu10${marca}`)
  const b = db()
  expect((await b.from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  slug = (await b.from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  dona = await criarMembro(`eu10d${marca}`, { tenant: rede.tenantId, donoDaRede: true, rotulo: 'Dona', permissoes: [] })
  const produtos = await b.from('products').insert([
    { tenant_id: rede.tenantId, name: nomeGel, unit: 'un', uso: 'INSUMO', supplier: 'Distribuidora Sul' },
    { tenant_id: rede.tenantId, name: nomeLuva, unit: 'cx', uso: 'INSUMO' },
    { tenant_id: rede.tenantId, name: nomeMascara, unit: 'pote', uso: 'INSUMO' },
  ]).select('id, name')
  expect(produtos.error).toBeNull()
  const id = (nome: string) => produtos.data!.find(p => p.name === nome)!.id as string
  gel = id(nomeGel); luva = id(nomeLuva); mascara = id(nomeMascara)
  const entrada = async (produto: string, qtd: number, custo: number, lote: string | null, dias: number | null) =>
    expect((await b.rpc('estoque_entrada', {
      p_produto: produto, p_unidade: rede!.branchId, p_quantidade: qtd, p_custo: custo, p_observacao: null,
      p_lote: lote, p_validade: dias == null ? null : diaISO(emDias(dias)), p_autor: 'e2e',
    })).error).toBeNull()
  // Gel: 10 un a R$ 22 (lote A, vence em 20 dias) e 6 un a R$ 24 (lote B, em 90).
  await entrada(gel, 10, 22, loteA, 20)
  await entrada(gel, 6, 24, loteB, 90)
  // Luva: entrada sem lote (nunca teve lote).
  await entrada(luva, 5, 30, null, null)
  // Máscara: um lote que acabou (perda de tudo) — o esgotado.
  await entrada(mascara, 2, 19.5, loteM, 60)
  const idM = (await b.from('product_batches').select('id').eq('batch_number', loteM).single<{ id: string }>()).data!.id
  expect((await b.rpc('estoque_perda', {
    p_produto: mascara, p_unidade: rede.branchId, p_lote: idM, p_quantidade: 2, p_motivo: 'QUEBROU', p_observacao: null, p_autor: 'e2e',
  })).error).toBeNull()
  // A38: uma entrada de 3 un a R$ 20 lançada errada (o lote C, sem saída).
  await entrada(gel, 3, 20, loteC, 120)
  // A39: o mínimo do Gel acima do saldo.
  expect((await b.from('branch_product_stock').update({ min_stock: 20 }).eq('product_id', gel).eq('branch_id', rede.branchId)).error).toBeNull()
})

test.afterAll(async () => {
  await dona?.limpar(); await rede?.limpar()
})

test('A36: "Ver lotes esgotados" só no produto que tem lote esgotado', async ({ browser }) => {
  await como(browser, dona!, async p => {
    await p.goto(`/${slug}/estoque`)
    await p.getByRole('row').filter({ hasText: nomeLuva }).first().click()
    await expect(p.locator('td[colspan]').first()).toBeVisible()
    await expect(p.getByRole('button', { name: /lotes esgotados/i }), 'a luva nunca teve lote').toHaveCount(0)
    await p.getByRole('row').filter({ hasText: nomeMascara }).first().click()
    await expect(p.getByRole('button', { name: 'Ver lotes esgotados' })).toBeVisible()
  })
})

test('A40: os cartões do topo cabem a 1440 px, e o "Validade em 30 dias" diz o lote e a data', async ({ browser }) => {
  await como(browser, dona!, async p => {
    await p.goto(`/${slug}/estoque`)
    const validade = p.locator('[data-kpi="validade"]')
    await expect(validade).toContainText(`lote ${loteA}`)
    await expect(validade).toContainText(diaBR(emDias(20)).slice(0, 5))
    const cortados = await p.locator('[data-kpis-do-estoque] *').evaluateAll(els =>
      els.filter(e => (e as HTMLElement).scrollWidth > (e as HTMLElement).clientWidth + 1).map(e => e.textContent))
    expect(cortados, 'nada cortado nos cartões').toEqual([])
  }, { width: 1440, height: 900 })
})

test('A41: o mínimo se salva por um botão com nome, e a tela confirma', async ({ browser }) => {
  await como(browser, dona!, async p => {
    const modal = await abrirGerenciar(p, nomeLuva)
    await modal.getByRole('button', { name: 'Estoque mínimo' }).click()
    await modal.getByLabel(/Estoque mínimo em/).fill('2')
    await modal.getByRole('button', { name: 'Salvar mínimo' }).click()
    await expect(modal.getByText('Mínimo salvo')).toBeVisible()
  })
  await expect.poll(async () => n((await db().from('branch_product_stock').select('min_stock').eq('product_id', luva).single<{ min_stock: number }>()).data!.min_stock)).toBe(2)
})

test('A37: a Entrada diz que não gera despesa e guarda o fornecedor e a nota', async ({ browser }) => {
  const antes = await saldo(gel)
  await como(browser, dona!, async p => {
    const modal = await abrirGerenciar(p, nomeGel)
    await expect(modal.locator('[data-entrada-sem-despesa]')).toContainText('Não gera despesa')
    await modal.getByLabel('Quantidade').fill('3')
    await modal.getByLabel('Custo unitário').fill('20')
    await modal.getByLabel('Nº do lote').fill(`UD-${marca}`)
    // C76 (F66): o de costume vem escolhido na LISTA de fornecedores da rede.
    await expect(modal.getByLabel('Fornecedor').locator('option:checked')).toHaveText('Distribuidora Sul')
    await modal.getByLabel('Nota fiscal').fill('004630')
    await modal.getByRole('button', { name: 'Registrar entrada' }).click()
    await expect.poll(() => saldo(gel)).toBe(antes + 3)
  })
  const { data: mov, error } = await db().from('stock_movements').select('fornecedor, nota_fiscal').eq('product_id', gel).eq('type', 'PURCHASE').eq('nota_fiscal', '004630').single()
  expect(error).toBeNull()
  expect(mov).toEqual({ fornecedor: 'Distribuidora Sul', nota_fiscal: '004630' })
  await como(browser, dona!, async p => {
    const modal = await abrirGerenciar(p, nomeGel)
    await modal.getByRole('button', { name: 'Histórico' }).click()
    await expect(modal.locator('[data-movimento]').filter({ hasText: 'NF 004630' })).toContainText('Distribuidora Sul')
  })
})

test('A38: o ajuste a menos escolhe o lote de onde sai', async ({ browser }) => {
  const antes = await saldo(gel)
  const [a, b] = [await qtdDoLote(loteA), await qtdDoLote(loteB)]
  await como(browser, dona!, async p => {
    const modal = await abrirGerenciar(p, nomeGel)
    await modal.getByRole('button', { name: 'Ajuste', exact: true }).click()
    await modal.getByLabel('Novo estoque').fill(String(antes - 1))
    const idB = (await db().from('product_batches').select('id').eq('batch_number', loteB).single<{ id: string }>()).data!.id
    await modal.getByLabel('De qual lote sai a diferença').selectOption(idB)
    await modal.getByLabel('Motivo').fill('Inventário: 1 do lote B sumiu')
    await modal.getByRole('checkbox').check()
    await modal.getByRole('button', { name: 'Aplicar ajuste' }).click()
    await expect.poll(() => saldo(gel)).toBe(antes - 1)
  })
  expect(await qtdDoLote(loteB), 'saiu do lote B, o escolhido').toBe(b - 1)
  expect(await qtdDoLote(loteA), 'o A, que vence antes, ficou').toBe(a)
})

test('A38: "Desfazer entrada" enquanto o lote não teve saída, e só nela', async ({ browser }) => {
  // O lote B já teve saída: uma perda de 1.
  const idB = (await db().from('product_batches').select('id').eq('batch_number', loteB).single<{ id: string }>()).data!.id
  expect((await db().rpc('estoque_perda', {
    p_produto: gel, p_unidade: rede!.branchId, p_lote: idB, p_quantidade: 1, p_motivo: 'QUEBROU', p_observacao: null, p_autor: 'e2e',
  })).error).toBeNull()
  const antes = await valorEmEstoque()
  const saldoAntes = await saldo(gel)
  await como(browser, dona!, async p => {
    const modal = await abrirGerenciar(p, nomeGel)
    await modal.getByRole('button', { name: 'Histórico' }).click()
    const entradaC = modal.locator('[data-movimento]').filter({ hasText: `Lote ${loteC}` }).filter({ hasText: 'Entrada' }).first()
    const entradaB = modal.locator('[data-movimento]').filter({ hasText: `Lote ${loteB}` }).filter({ hasText: 'Entrada' }).first()
    await expect(entradaB, 'o lote B já teve saída').toBeVisible()
    await expect(entradaB.getByRole('button', { name: 'Desfazer entrada' })).toHaveCount(0)
    await entradaC.getByRole('button', { name: 'Desfazer entrada' }).click()
    const janela = p.locator('dialog[open]').filter({ hasText: 'Desfazer a entrada' }).last()
    await janela.getByLabel('Motivo').fill('Lançada em dobro')
    await janela.getByRole('button', { name: 'Desfazer entrada' }).click()
    await expect.poll(() => saldo(gel)).toBe(saldoAntes - 3)
  })
  expect(await qtdDoLote(loteC)).toBe(0)
  expect(await valorEmEstoque(), 'o valor em estoque perde os 3 × R$ 20').toBe(Math.round((antes - 60) * 100) / 100)
  const idC = (await db().from('product_batches').select('id').eq('batch_number', loteC).single<{ id: string }>()).data!.id
  const { data: ligacoes } = await db().from('stock_movement_batches').select('movement_id, stock_movements(type, quantity)').eq('batch_id', idC)
  const id = ((ligacoes ?? []) as unknown as { movement_id: string; stock_movements: { quantity: number } }[]).find(l => n(l.stock_movements.quantity) > 0)!.movement_id
  const { data: orig } = await db().from('stock_movements').select('desfeita_em, desfeita_motivo').eq('id', id).single()
  expect(orig!.desfeita_em).not.toBeNull()
  expect(orig!.desfeita_motivo).toBe('Lançada em dobro')
  // Não é perda.
  const { data: perdas } = await db().rpc('metrics_perdas', {
    p_tenant: rede!.tenantId, p_branch_ids: [rede!.branchId], p_from: new Date(Date.now() - 864e5).toISOString(), p_to: new Date(Date.now() + 864e5).toISOString(),
  })
  const doGel = ((perdas ?? []) as { product_id: string | null; custo: number }[]).filter(l => l.product_id === gel)
  expect(doGel.some(l => n(l.custo) >= 60), 'desfazer não é perda').toBe(false)
  // Desfazer de novo é recusado pelo banco.
  const deNovo = await db().rpc('estoque_desfazer_entrada', { p_tenant: rede!.tenantId, p_movimento: id, p_motivo: 'de novo', p_autor: 'e2e' })
  expect(deNovo.error?.message).toContain('já foi desfeita')
})

test('A39: o dashboard da unidade diz o produto abaixo do mínimo', async ({ browser }) => {
  await como(browser, dona!, async p => {
    await p.goto(`/${slug}/dashboard`)
    const quadro = p.locator('[data-estoque-abaixo-do-minimo]')
    await expect(quadro).toContainText(nomeGel)
    await expect(quadro).toContainText('mín. 20')
  })
})

