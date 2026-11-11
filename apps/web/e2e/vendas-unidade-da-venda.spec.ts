import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { pagoNoPix } from './apoio/vender'

/**
 * D1 e A14 da 8ª simulação (2026-11-06): na ficha da rede (`/admin`), a venda
 * saía da unidade de CADASTRO da cliente — ou da primeira em ordem alfabética
 * — sem perguntar. A Patrícia (Água Verde) aparecia com "Hidratante — sem
 * estoque", e a venda no Batel só deu entrando pelo portal do Batel; o "Quem
 * vendeu" mostrava a equipe da Água Verde. O "+ Agendar" e o "Novo cliente"
 * começavam na primeira unidade em ordem alfabética.
 *
 * Agora, com mais de uma unidade, o "Vender" pergunta "Unidade da venda"
 * (nenhuma escolhida), e o catálogo, o estoque e a equipe são os da escolhida;
 * a venda grava nela. O agendar e o cadastro também nascem sem unidade
 * (H5: "nada se prende a clients.branch_id"; princípio 3).
 *
 * Numa rede [e2e] própria, com duas unidades.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let batel = ''
let recepcao: MembroDeTeste | null = null
let debora: MembroDeTeste | null = null
let cliente = ''
let hidratante = ''
const NOME_A = `${PREFIXO} Agua Verde ${marca}`
const NOME_B = `${PREFIXO} Batel ${marca}`
const PRODUTO = `${PREFIXO} Hidratante ${marca}`

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: recepcao!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  test.setTimeout(150_000)
  rede = await criarOutraRede(`vu${marca}`)
  // As duas unidades, criadas antes de qualquer tela abrir (o cache da lista).
  expect((await db().from('branches').update({ name: NOME_A }).eq('id', rede.branchId)).error).toBeNull()
  const b = await db().from('branches').insert({ tenant_id: rede.tenantId, name: NOME_B, slug: `e2e-vu-batel-${marca}` })
    .select('id').single<{ id: string }>()
  expect(b.error).toBeNull()
  batel = b.data!.id
  // A cliente é da Água Verde (a unidade de cadastro).
  cliente = await rede.criarCliente('Patricia')
  // O hidratante só tem estoque no Batel.
  const p = await db().from('products').insert({ tenant_id: rede.tenantId, name: PRODUTO, unit: 'un', uso: 'REVENDA', sale_price: 90 })
    .select('id').single<{ id: string }>()
  expect(p.error).toBeNull()
  hidratante = p.data!.id
  const e = await db().rpc('estoque_entrada', {
    p_produto: hidratante, p_unidade: batel, p_quantidade: 4, p_custo: 30, p_observacao: 'e2e', p_lote: null, p_validade: null, p_autor: 'e2e',
  })
  expect(e.error).toBeNull()
  // A recepção da rede (sem unidade fixa) recebe e agenda.
  recepcao = await criarMembro(`vur${marca}`, {
    tenant: rede.tenantId, rotulo: 'Recepcao da rede',
    permissoes: [{ modulo: 'cashier', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'financial', nivel: 'MANAGE' }],
  })
  // A Débora é a profissional do Batel (atende lá): só aparece em "Quem vendeu" de uma
  // venda do Batel. A42 da 11ª: "Quem vendeu" só traz quem VENDE (atende na unidade,
  // recebe, ou tem Vendas no cargo) — sem o "Atende", ela não entraria em lista nenhuma.
  debora = await criarMembro(`vud${marca}`, { tenant: rede.tenantId, branchId: batel, rotulo: 'Debora', permissoes: [] })
  expect((await db().from('users').update({ atende_em: [batel] }).eq('id', debora.userId)).error, 'a Débora atende no Batel').toBeNull()
})

test.afterAll(async () => {
  await debora?.limpar(); await recepcao?.limpar(); await rede?.limpar()
})

test('D1: o "Vender" da ficha da rede pergunta a unidade, e a venda sai da escolhida — estoque, equipe e caixa', async ({ browser }) => {
  await como(browser, async p => {
    await p.goto(`/admin/clients/${cliente}`)
    await p.getByRole('button', { name: 'Vender', exact: true }).click()
    const dlg = p.getByRole('dialog', { name: 'Vender' })
    const unidade = dlg.getByLabel('Unidade da venda')
    // Nenhuma pré-escolhida: nem a de cadastro (Água Verde), nem a primeira da lista.
    await expect(unidade).toHaveValue('')
    await expect(dlg.getByLabel('Produto'), 'sem a unidade, nada a vender ainda').toHaveCount(0)

    // Na Água Verde, a equipe é a dela: o hidratante sem estoque, e a Débora (do Batel) fora.
    await unidade.selectOption({ label: NOME_A })
    await dlg.getByRole('button', { name: 'Produto', exact: true }).click()
    await expect(dlg.getByLabel('Produto').locator('option', { hasText: PRODUTO })).toContainText('sem estoque')
    await expect(dlg.getByLabel('Quem vendeu').locator('option', { hasText: '(você)' }), 'a lista da Água Verde está lá').toHaveCount(1)
    await expect(dlg.getByLabel('Quem vendeu').locator('option', { hasText: 'Debora' })).toHaveCount(0)

    await unidade.selectOption({ label: NOME_B })
    await dlg.getByRole('button', { name: 'Produto', exact: true }).click()
    await expect(dlg.getByLabel('Produto').locator('option', { hasText: PRODUTO })).toContainText('4 un em estoque')
    // A equipe é a do Batel: a Débora está em "Quem vendeu" — e é ela quem vende.
    const opcaoDaDebora = dlg.getByLabel('Quem vendeu').locator('option', { hasText: 'Debora' })
    await expect(opcaoDaDebora).toHaveCount(1)
    await dlg.getByLabel('Quem vendeu').selectOption(await opcaoDaDebora.getAttribute('value') ?? '')
    await pagoNoPix(dlg)
    await dlg.getByRole('button', { name: /^Vender por R\$\s90,00$/ }).click()
    await expect(dlg).toBeHidden()
  })
  const { data: venda } = await db().from('product_sales').select('id, branch_id, sold_by').eq('tenant_id', rede!.tenantId).single()
  expect(venda!.branch_id, 'a venda é do Batel').toBe(batel)
  expect(venda!.sold_by, 'quem vendeu é a Débora: o servidor a aceita no Batel, a unidade escolhida').toBe(debora!.userId)
  const { data: lanc } = await db().from('financial_transactions').select('branch_id').eq('product_sale_id', venda!.id)
  expect(lanc!.map(l => l.branch_id), 'o dinheiro entra no caixa do Batel').toEqual([batel])
  const { data: saldo } = await db().from('branch_product_stock').select('current_stock').eq('product_id', hidratante).eq('branch_id', batel).single()
  expect(Number(saldo!.current_stock), 'o estoque baixa no Batel').toBe(3)
})

test('A14: o "+ Agendar" da ficha da rede e o "Novo cliente" nascem sem unidade escolhida', async ({ browser }) => {
  await como(browser, async p => {
    await p.goto(`/admin/clients/${cliente}`)
    await p.getByRole('button', { name: '+ Agendar' }).click()
    const modal = p.getByRole('dialog', { name: 'Novo agendamento' })
    await expect(modal.locator('#ag-unidade')).toHaveValue('')
    await expect(modal.locator('#ag-unidade option', { hasText: NOME_B })).toHaveCount(1)

    await p.goto('/admin/clients/new')
    await expect(p.getByLabel('Unidade de cadastro *')).toHaveValue('')
  })
})

test('D1: o crédito interno da ficha da rede pergunta a unidade — mesmo da cliente com unidade de cadastro', async ({ browser }) => {
  await como(browser, async p => {
    await p.goto(`/admin/clients/${cliente}?aba=financeiro`)
    await p.getByRole('button', { name: /Conceder crédito/ }).first().click()
    // Era o caixa da Água Verde (a de cadastro), calado.
    await expect(p.getByLabel('Unidade do crédito *')).toHaveValue('')
  })
})
