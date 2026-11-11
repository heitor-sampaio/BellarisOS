import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * Os atritos de estoque da 12ª simulação (2026-11-11), numa rede [e2e] própria:
 * - A40: o brinde da fidelidade saía do estoque (55 → 54) e entrava em "Perdas
 *   no período" como "Inventário" — agora é "Brinde da fidelidade", pelo custo
 *   do lote de onde saiu (princípio 3).
 * - A48: o "Motivo" do "Desfazer ajuste" não tinha asterisco, e o botão ficava
 *   desligado sem dizer por quê.
 * - A49: a embalagem no singular — "3 frasco", "Saem 13.500 ml (27 frasco)".
 */

test.setTimeout(180_000)

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede
let slug = ''
let dona: MembroDeTeste
let mascara = ''
let gel = ''
const nomeMascara = `${PREFIXO} Máscara ${marca}`
const nomeGel = `${PREFIXO} Gel ${marca}`

async function como(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado, viewport: { width: 1440, height: 900 } })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}
async function abrirGerenciar(p: Page, nome: string) {
  await p.goto(`/${slug}/estoque`)
  await p.getByRole('row').filter({ hasText: nome }).first().getByTitle('Gerenciar estoque').click()
  return p.locator('dialog[open]').filter({ hasText: 'Gerenciar estoque' })
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`es12${marca}`)
  const b = db()
  expect((await b.from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  slug = (await b.from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  dona = await criarMembro(`es12d${marca}`, { tenant: rede.tenantId, donoDaRede: true, rotulo: 'Dona', permissoes: [] })
  const produtos = await b.from('products').insert([
    // A máscara do brinde: o lote custa R$ 6,50 (a última compra, R$ 7,00).
    { tenant_id: rede.tenantId, name: nomeMascara, unit: 'un', uso: 'INSUMO', cost_price: 7 },
    // O gel em frascos de 500 ml (A49).
    { tenant_id: rede.tenantId, name: nomeGel, unit: 'frasco', consumption_unit: 'ml', units_per_package: 500, uso: 'INSUMO', cost_price: 20 },
  ]).select('id, name')
  expect(produtos.error).toBeNull()
  mascara = produtos.data!.find(p => p.name === nomeMascara)!.id as string
  gel = produtos.data!.find(p => p.name === nomeGel)!.id as string
  expect((await b.rpc('estoque_entrada', {
    p_produto: mascara, p_unidade: rede.branchId, p_quantidade: 55, p_custo: 6.5, p_observacao: null,
    p_lote: `MA-${marca}`, p_validade: '2027-12-31', p_autor: 'e2e',
  })).error).toBeNull()
  expect((await b.from('products').update({ cost_price: 7 }).eq('id', mascara)).error).toBeNull()
  expect((await b.rpc('estoque_entrada', {
    p_produto: gel, p_unidade: rede.branchId, p_quantidade: 30, p_custo: 20, p_observacao: null,
    p_lote: `GE-${marca}`, p_validade: '2027-12-31', p_autor: 'e2e',
  })).error).toBeNull()
  // A48 e A49: um inventário que achou 3 frascos a menos (27 → 13.500 ml), para desfazer.
  expect((await b.rpc('estoque_ajuste_com_lote', {
    p_produto: gel, p_unidade: rede.branchId, p_contagem: 27, p_em_consumo: false, p_motivo: 'Contagem [e2e]', p_autor: 'e2e',
    p_lote: null, p_lote_numero: null, p_lote_validade: null,
  })).error).toBeNull()
})

test.afterAll(async () => {
  await dona?.limpar(); await rede?.limpar()
})

test('A40: o brinde entregue entra em Perdas como "Brinde da fidelidade", pelo custo do lote', async () => {
  const b = db()
  const cliente = { id: await rede.criarCliente('Ana') }
  const { data: recompensa, error: eR } = await b.from('loyalty_rewards').insert({
    tenant_id: rede.tenantId, name: 'Máscara cortesia', type: 'PRODUTO', points_cost: 500, product_id: mascara,
  }).select('id').single<{ id: string }>()
  expect(eR).toBeNull()
  const { data: voucher, error: eV } = await b.from('loyalty_vouchers').insert({
    tenant_id: rede.tenantId, client_id: cliente!.id, branch_id: rede.branchId, reward_id: recompensa!.id, type: 'PRODUTO', name: 'Máscara cortesia',
    product_id: mascara, points_cost: 500, status: 'ATIVO', expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString(), created_by: 'e2e',
  }).select('id').single<{ id: string }>()
  expect(eV).toBeNull()
  // A entrega de sempre: uma embalagem sai (o app calcula; o banco confere o saldo lido).
  expect((await b.rpc('entregar_voucher_produto', {
    p_tenant: rede.tenantId, p_voucher: voucher!.id, p_unidade: rede.branchId, p_ator: 'e2e',
    p_dados: { quantidade: -1, saldo_apos: 54, embalagens: 54, rendimento: null, minimo: 0, antes_embalagens: 55, antes_rendimento: null },
  })).error).toBeNull()

  const { data: perdas, error } = await b.rpc('metrics_perdas', {
    p_tenant: rede.tenantId, p_branch_ids: [rede.branchId],
    p_from: new Date(Date.now() - 3_600_000).toISOString(), p_to: new Date(Date.now() + 3_600_000).toISOString(),
  })
  expect(error).toBeNull()
  const linhas = (perdas ?? []) as { motivo: string | null; product_id: string | null; custo: number; embalagens: number | null }[]
  const doBrinde = linhas.find(l => l.motivo === 'BRINDE' && l.product_id === mascara)
  expect(doBrinde, 'o brinde é "Brinde da fidelidade", não "Inventário"').toBeTruthy()
  expect(Number(doBrinde!.custo), 'pelo custo do lote (R$ 6,50), não o último (R$ 7,00)').toBe(6.5)
  expect(linhas.find(l => l.motivo === 'INVENTARIO' && l.product_id === mascara)).toBeFalsy()
})

test('A48 e A49: o "Desfazer ajuste" diz que o motivo é obrigatório, e a embalagem vem no plural', async ({ browser }) => {
  await como(browser, dona, async p => {
    const modal = await abrirGerenciar(p, nomeGel)
    // A49: o saldo e o mínimo no plural.
    await modal.getByRole('button', { name: 'Estoque mínimo' }).click()
    await expect(modal.getByText(/Atual: 27 frascos/)).toBeVisible()
    await modal.getByRole('button', { name: 'Histórico' }).click()
    await modal.getByRole('button', { name: 'Desfazer ajuste' }).first().click()
    const janela = p.locator('dialog[open]').filter({ hasText: 'Desfazer o ajuste' }).last()
    // A49: "Voltam 1.500 ml (3 frascos)".
    await expect(janela).toContainText('(3 frascos)')
    // A48: o asterisco, e o porquê do botão desligado.
    await expect(janela.getByText('Motivo *')).toBeVisible()
    await expect(janela.getByRole('button', { name: 'Desfazer ajuste' })).toBeDisabled()
    await expect(janela.locator('[data-motivo-obrigatorio]')).toContainText('Escreva o motivo para desfazer')
    await janela.getByLabel('Motivo').fill('Contei errado [e2e]')
    await expect(janela.locator('[data-motivo-obrigatorio]')).toHaveCount(0)
    await expect(janela.getByRole('button', { name: 'Desfazer ajuste' })).toBeEnabled()
  })
})
