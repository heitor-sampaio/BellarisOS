import { test, expect } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * A48 da 11ª simulação (2026-11-10): o dashboard da Gisele dizia "2" no
 * mínimo ou abaixo, e o sino "Tudo em dia". O job `estoque-minimo` avisava só
 * pelo evento do gatilho, que compara as EMBALAGENS (o frasco aberto conta
 * inteiro) e só o "abaixo" estrito: a Lâmina com 190 un (3,8 caixas) contra o
 * mínimo de 4 caixas nunca cruzava. Agora o job usa a régua da tela
 * (`situacaoDoEstoque`: no rendimento, "No mínimo" conta) e avisa quem tem o
 * Estoque em Gerenciar na unidade UMA vez por cruzamento — a linha que sai do
 * mínimo volta a poder avisar. Chama o cron (COMPARTILHADO), recortado à rede
 * [e2e] pelo `?rede=`.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let estoquista: MembroDeTeste | null = null
let olheiro: MembroDeTeste | null = null
let lamina = ''
const nomeLamina = `${PREFIXO} Lâmina ${marca}`

test.beforeAll(async () => {
  test.setTimeout(150_000)
  rede = await criarOutraRede(`em11${marca}`)
  estoquista = await criarMembro(`em11e${marca}`, { tenant: rede.tenantId, rotulo: 'Estoquista', permissoes: [{ modulo: 'stock', nivel: 'MANAGE' }] })
  olheiro = await criarMembro(`em11o${marca}`, { tenant: rede.tenantId, rotulo: 'Olheiro', permissoes: [{ modulo: 'stock', nivel: 'VIEW' }] })
  const { data: p, error } = await db().from('products').insert({
    tenant_id: rede.tenantId, name: nomeLamina, unit: 'caixa', consumption_unit: 'un', units_per_package: 50, min_stock: 4, uso: 'INSUMO', cost_price: 25,
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  lamina = p!.id
  // 4 caixas, e um inventário que achou 190 un (3,8 caixas): a linha fica com
  // 4 caixas arredondadas (= o mínimo) e 190 un no rendimento (abaixo dele).
  expect((await db().rpc('estoque_entrada', {
    p_produto: lamina, p_unidade: rede.branchId, p_quantidade: 4, p_custo: 25, p_observacao: null,
    p_lote: null, p_validade: null, p_autor: 'e2e',
  })).error).toBeNull()
  expect((await db().from('branch_product_stock').update({ min_stock: 4 }).eq('product_id', lamina).eq('branch_id', rede.branchId)).error).toBeNull()
  expect((await db().rpc('estoque_ajuste_com_lote', {
    p_produto: lamina, p_unidade: rede.branchId, p_contagem: 190, p_em_consumo: true, p_motivo: 'Inventário', p_autor: 'e2e',
    p_lote: null, p_lote_numero: null, p_lote_validade: null,
  })).error).toBeNull()
})

test.afterAll(async () => {
  await estoquista?.limpar(); await olheiro?.limpar(); await rede?.limpar()
})

test('A48: o estoque no mínimo ou abaixo chega ao sino de quem cuida do estoque, uma vez por cruzamento', async ({ request }) => {
  const segredo = process.env.CRON_SECRET
  test.skip(!segredo, 'sem CRON_SECRET')
  const rodar = async () => {
    const r = await request.get(`/api/cron/estoque-minimo?rede=${rede!.tenantId}`, { headers: { authorization: `Bearer ${segredo}` } })
    expect(r.ok(), await r.text()).toBe(true)
  }
  const avisos = async () => ((await db().from('user_notifications').select('user_id, title, body')
    .eq('type', 'stock_below_minimum').filter('data->>produto_id', 'eq', lamina)).data ?? []) as { user_id: string; title: string; body: string }[]

  await rodar()
  await expect.poll(async () => (await avisos()).map(a => a.user_id), 'a Lâmina com 190 un de 200 avisa').toContain(estoquista!.userId)
  const primeira = await avisos()
  expect(primeira.map(a => a.user_id), 'quem só vê o estoque não é interrompido').not.toContain(olheiro!.userId)
  expect(primeira[0]!.body).toContain(nomeLamina)
  expect(primeira[0]!.body).toContain('190 un')

  await rodar()
  expect((await avisos()).length, 'o mesmo cruzamento não avisa duas vezes').toBe(primeira.length)

  // Repôs (sai do mínimo) e baixou de novo: é outro cruzamento.
  expect((await db().rpc('estoque_entrada', {
    p_produto: lamina, p_unidade: rede!.branchId, p_quantidade: 5, p_custo: 25, p_observacao: null,
    p_lote: null, p_validade: null, p_autor: 'e2e',
  })).error).toBeNull()
  await rodar()
  expect((await avisos()).length, 'acima do mínimo, nada').toBe(primeira.length)
  expect((await db().rpc('estoque_ajuste_com_lote', {
    p_produto: lamina, p_unidade: rede!.branchId, p_contagem: 150, p_em_consumo: true, p_motivo: 'Inventário', p_autor: 'e2e',
    p_lote: null, p_lote_numero: null, p_lote_validade: null,
  })).error).toBeNull()
  await rodar()
  await expect.poll(async () => (await avisos()).length, 'o novo cruzamento avisa de novo').toBe(primeira.length * 2)
})
