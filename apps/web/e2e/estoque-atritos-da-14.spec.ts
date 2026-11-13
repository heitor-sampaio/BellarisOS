import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * Os atritos de estoque da 14ª simulação (2026-11-12/13, F74), numa rede [e2e]
 * própria com duas unidades (a Centro e a Pampulha):
 *
 * - A12 (princípio 7): a entrada, a perda e o histórico moravam atrás de uma
 *   engrenagem sem texto — o botão diz "Entrada e perda"; e os Fornecedores
 *   ficam ao lado das Categorias para quem é da rede, nos DOIS portais (só o
 *   /admin os tinha: sobra da C76/F66).
 * - A13 (3): a perda que não tem "Desfazer perda" diz por quê.
 * - A14 (7): o "Fornecedor de costume" e o "Fornecedor desta entrada" dizem a
 *   diferença; a linha do lote mostra o fornecedor e a nota da entrada.
 * - A15 (3): o mínimo herdado do cadastro diz "(do cadastro)" na linha (sobra
 *   da D2 da 11ª: a nota morava só na aba "Estoque mínimo").
 * - A16 (7): com a tela filtrada numa unidade (`?unidade=`), a Entrada já vem
 *   com ela.
 */

test.setTimeout(180_000)

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede
let slug = ''
let pampulha = ''
let slugPampulha = ''
let dona: MembroDeTeste
let gerente: MembroDeTeste
let seringa = ''
let luva = ''
let gel = ''
const nomeSeringa = `${PREFIXO} Seringa ${marca}`
const nomeLuva = `${PREFIXO} Luva ${marca}`
const nomeGel = `${PREFIXO} Gel ${marca}`

async function como(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado, viewport: { width: 1440, height: 900 } })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}
const entrada = async (produto: string, unidade: string, qtd: number, lote: string | null, fornecedor: string | null = null, nota: string | null = null) => {
  const r = await db().rpc('estoque_entrada', {
    p_produto: produto, p_unidade: unidade, p_quantidade: qtd, p_custo: 10, p_observacao: null,
    p_lote: lote, p_validade: '2027-12-31', p_autor: 'e2e', p_fornecedor: fornecedor, p_nota_fiscal: nota,
  })
  expect(r.error, `entrada de ${qtd}`).toBeNull()
}
const perda = async (produto: string, qtd: number) => {
  const r = await db().rpc('estoque_perda_em', {
    p_produto: produto, p_unidade: rede.branchId, p_lote: null, p_quantidade: qtd, p_em_consumo: false,
    p_motivo: 'QUEBROU', p_observacao: null, p_autor: 'e2e',
  })
  expect(r.error, `perda de ${qtd}`).toBeNull()
}
const linhaDo = (p: Page, nome: string) => p.getByRole('row').filter({ hasText: nome }).first()

test.use({ storageState: { cookies: [], origins: [] } })

test.beforeAll(async () => {
  rede = await criarOutraRede(`es14${marca}`)
  const b = db()
  expect((await b.from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  slug = (await b.from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  slugPampulha = `e2e-pampulha-${marca}`
  const un = await b.from('branches').insert({ tenant_id: rede.tenantId, name: `${PREFIXO} Pampulha ${marca}`, slug: slugPampulha }).select('id').single<{ id: string }>()
  expect(un.error).toBeNull()
  pampulha = un.data!.id
  const produtos = await b.from('products').insert([
    { tenant_id: rede.tenantId, name: nomeSeringa, unit: 'seringa', cost_price: 10, uso: 'INSUMO', min_stock: 5 },
    { tenant_id: rede.tenantId, name: nomeLuva, unit: 'cx', cost_price: 10, uso: 'INSUMO', min_stock: 0 },
    { tenant_id: rede.tenantId, name: nomeGel, unit: 'un', cost_price: 10, uso: 'INSUMO', min_stock: 0 },
  ]).select('id, name')
  expect(produtos.error).toBeNull()
  const id = (n: string) => produtos.data!.find(p => p.name === n)!.id as string
  seringa = id(nomeSeringa); luva = id(nomeLuva); gel = id(nomeGel)
  // A Pampulha herda o mínimo do cadastro (5); a Centro tem o dela (3).
  await entrada(seringa, pampulha, 2, null)
  await entrada(seringa, rede.branchId, 2, null)
  expect((await b.from('branch_product_stock').update({ min_stock: 3 }).eq('product_id', seringa).eq('branch_id', rede.branchId)).error).toBeNull()
  // Duas perdas da luva: só a mais nova se desfaz.
  await entrada(luva, rede.branchId, 5, `LV${marca}`)
  await perda(luva, 1)
  await perda(luva, 2)
  // O gel com o fornecedor e a nota da entrada.
  await entrada(gel, rede.branchId, 4, `GE${marca}`, 'Distribuidora Sul', '004630')
  dona = await criarMembro(`es14d${marca}`, { tenant: rede.tenantId, donoDaRede: true, rotulo: 'Dona', permissoes: [] })
  gerente = await criarMembro(`es14g${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Gerente', permissoes: [{ modulo: 'stock', nivel: 'MANAGE' }],
  })
})

test.afterAll(async () => {
  await db().from('fornecedores').delete().eq('tenant_id', rede?.tenantId ?? '')
  await gerente?.limpar(); await dona?.limpar(); await rede?.limpar()
})

test('A12: o botão diz "Entrada e perda", e os Fornecedores ficam ao lado das Categorias nos dois portais — para quem é da rede', async ({ browser }) => {
  await como(browser, dona, async p => {
    for (const rota of [`/${slug}/estoque`, '/admin/estoque']) {
      await p.goto(rota)
      await expect(p.getByRole('button', { name: 'Fornecedores' }), rota).toBeVisible()
      const botao = linhaDo(p, nomeLuva).getByRole('button', { name: 'Entrada e perda' })
      await expect(botao, rota).toBeVisible()
      await botao.click()
      await expect(p.locator('dialog[open]').filter({ hasText: 'Gerenciar estoque' })).toBeVisible()
    }
  })
  // Quem tem unidade fixa não mexe na lista da rede (recusaDaConfigDaClinica).
  await como(browser, gerente, async p => {
    await p.goto(`/${slug}/estoque`)
    await expect(linhaDo(p, nomeLuva).getByRole('button', { name: 'Entrada e perda' })).toBeVisible()
    await expect(p.getByRole('button', { name: 'Fornecedores' })).toHaveCount(0)
  })
})

test('A13: a perda que não se desfaz diz por quê', async ({ browser }) => {
  await como(browser, dona, async p => {
    await p.goto(`/${slug}/estoque`)
    await linhaDo(p, nomeLuva).getByRole('button', { name: 'Entrada e perda' }).click()
    const modal = p.locator('dialog[open]').filter({ hasText: 'Gerenciar estoque' })
    await modal.getByRole('button', { name: 'Histórico' }).click()
    await expect(modal.getByRole('button', { name: 'Desfazer perda' })).toHaveCount(1)
    const semBotao = modal.locator('[data-sem-desfazer]')
    await expect(semBotao).toHaveCount(1)
    await expect(semBotao).toContainText('desfaça antes as mais novas')
  })
})

test('A14: os dois fornecedores dizem a diferença, e a linha do lote mostra o fornecedor e a nota', async ({ browser }) => {
  await como(browser, dona, async p => {
    await p.goto(`/${slug}/estoque`)
    await linhaDo(p, nomeGel).click()
    const lote = p.locator('[data-lotes-do-produto]').filter({ hasText: `GE${marca}` })
    await expect(lote).toContainText('NF 004630')
    await expect(lote).toContainText('Distribuidora Sul')

    await p.getByRole('button', { name: 'Novo produto' }).first().click()
    await expect(p.locator('[data-dica-fornecedor="costume"]')).toContainText('vem sugerido nas próximas entradas')
    await p.getByRole('switch', { name: /Adicionar estoque inicial/ }).click()
    await expect(p.locator('[data-dica-fornecedor="entrada"]')).toContainText('só desta entrada')
  })
})

test('A15: o mínimo herdado do cadastro diz "(do cadastro)" na linha; o da unidade, não', async ({ browser }) => {
  await como(browser, dona, async p => {
    await p.goto(`/admin/estoque?unidade=${slugPampulha}`)
    const naPampulha = linhaDo(p, nomeSeringa)
    await expect(naPampulha).toContainText('5 seringas (do cadastro)')
    await p.goto(`/admin/estoque?unidade=${slug}`)
    const naCentro = linhaDo(p, nomeSeringa)
    await expect(naCentro).toContainText('3 seringas')
    await expect(naCentro).not.toContainText('(do cadastro)')
    // No consolidado, a linha aberta de cada unidade diz o mesmo.
    await p.goto('/admin/estoque')
    await linhaDo(p, nomeSeringa).click()
    await expect(p.getByText('mín. 5 seringas (do cadastro)')).toBeVisible()
    await expect(p.getByText('mín. 3 seringas', { exact: true })).toBeVisible()
  })
})

test('A16: com a tela filtrada numa unidade, a Entrada e a Perda já vêm com ela', async ({ browser }) => {
  await como(browser, dona, async p => {
    await p.goto(`/admin/estoque?unidade=${slugPampulha}`)
    await linhaDo(p, nomeSeringa).getByRole('button', { name: 'Entrada e perda' }).click()
    const modal = p.locator('dialog[open]').filter({ hasText: 'Gerenciar estoque' })
    await expect(modal.locator('select[name="branchId"]')).toHaveValue(pampulha)
    await modal.getByRole('button', { name: 'Perda' }).click()
    await expect(modal.locator('select[name="branchId"]')).toHaveValue(pampulha)
  })
})
