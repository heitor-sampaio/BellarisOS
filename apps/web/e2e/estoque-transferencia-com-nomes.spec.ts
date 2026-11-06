import { test, expect } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * D12 da 8ª simulação (2026-11-06): o histórico da transferência de estoque
 * dizia "Transferência → destino." e "← origem." — as duas palavras como
 * estão escritas, sem o nome da unidade (`estoque_transferir` concatenava o
 * texto fixo). Agora a nota diz "Transferência para Batel." na origem e
 * "Transferência de Água Verde." no destino. As linhas de antes não são
 * reescritas: a tela as resolve pela outra perna da transferência (o
 * `lib/estoque/transferencia.ts`, com o Vitest).
 *
 * Numa rede [e2e] própria, com duas unidades.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let gestor: MembroDeTeste | null = null
let batel = ''
let produto = ''
const AGUA_VERDE = `${PREFIXO} Agua Verde ${marca}`
const BATEL = `${PREFIXO} Batel ${marca}`
const PRODUTO = `Gel condutor tn${marca}`

test.beforeAll(async () => {
  test.setTimeout(150_000)
  rede = await criarOutraRede(`tn${marca}`)
  expect((await db().from('branches').update({ name: AGUA_VERDE }).eq('id', rede.branchId)).error).toBeNull()
  const b = await db().from('branches').insert({ tenant_id: rede.tenantId, name: BATEL, slug: `e2e-tn-batel-${marca}` }).select('id').single<{ id: string }>()
  expect(b.error).toBeNull()
  batel = b.data!.id
  const p = await db().from('products').insert({ tenant_id: rede.tenantId, name: `${PREFIXO} ${PRODUTO}`, unit: 'un' }).select('id').single<{ id: string }>()
  expect(p.error).toBeNull()
  produto = p.data!.id
  const e = await db().rpc('estoque_entrada', {
    p_produto: produto, p_unidade: rede.branchId, p_quantidade: 10, p_custo: 5, p_observacao: 'e2e', p_lote: null, p_validade: null, p_autor: 'e2e',
  })
  expect(e.error).toBeNull()
  gestor = await criarMembro(`tng${marca}`, { tenant: rede.tenantId, rotulo: 'Estoque', permissoes: [{ modulo: 'stock', nivel: 'MANAGE' }] })
})

test.afterAll(async () => {
  await gestor?.limpar(); await rede?.limpar()
})

test('D12: a transferência diz o nome das unidades — "para Batel" na origem, "de Água Verde" no destino', async ({ browser }) => {
  const t = await db().rpc('estoque_transferir', {
    p_produto: produto, p_origem: rede!.branchId, p_destino: batel, p_quantidade: 3, p_observacao: 'reposição', p_autor: 'e2e',
  })
  expect(t.error).toBeNull()
  const t2 = await db().rpc('estoque_transferir', {
    p_produto: produto, p_origem: batel, p_destino: rede!.branchId, p_quantidade: 1, p_observacao: null, p_autor: 'e2e',
  })
  expect(t2.error).toBeNull()
  const { data, error } = await db().from('stock_movements').select('type, notes, branch_id')
    .eq('product_id', produto).in('type', ['TRANSFER_OUT', 'TRANSFER_IN']).order('created_at')
  expect(error).toBeNull()
  expect((data ?? []).map(m => `${m.type}: ${m.notes}`).sort()).toEqual([
    `TRANSFER_OUT: Transferência para ${BATEL}. reposição`,
    `TRANSFER_IN: Transferência de ${AGUA_VERDE}. reposição`,
    `TRANSFER_OUT: Transferência para ${AGUA_VERDE}.`,
    `TRANSFER_IN: Transferência de ${BATEL}.`,
  ].sort())

  // A tela: o histórico do produto, na rede.
  const ctx = await browser.newContext({ storageState: gestor!.estado })
  try {
    const p = await ctx.newPage()
    await p.goto('/admin/estoque')
    const engrenagem = p.locator('tr, [role="row"], div').filter({ hasText: PRODUTO })
      .filter({ has: p.getByTitle('Gerenciar estoque') }).last().getByTitle('Gerenciar estoque')
    const modal = p.locator('dialog[open]').filter({ hasText: 'Gerenciar estoque' })
    await expect(async () => {
      await engrenagem.click()
      await expect(modal).toBeVisible({ timeout: 2_000 })
    }).toPass({ timeout: 30_000 })
    await modal.getByRole('button', { name: 'Histórico', exact: true }).click()
    await expect(modal.getByText(`Transferência para ${BATEL}. reposição`)).toBeVisible({ timeout: 15_000 })
    await expect(modal.getByText(`Transferência de ${AGUA_VERDE}. reposição`)).toBeVisible()
    await expect(modal.getByText(/→ destino|← origem/)).toHaveCount(0)
  } finally { await ctx.close() }
})

/**
 * A16 da 8ª simulação: a gerente de unidade fixa transferia e não tinha como
 * conferir o saldo do destino (a tela dela mostra só a unidade dela). Agora o
 * aviso de "deu certo" diz os dois saldos: "Batel agora tem 2 un".
 */
test('A16: a transferência diz o saldo do destino depois, também para a gerente de unidade fixa', async ({ browser }) => {
  const gerente = await criarMembro(`tnf${marca}`, {
    tenant: rede!.tenantId, branchId: rede!.branchId, rotulo: 'Gerente', permissoes: [{ modulo: 'stock', nivel: 'MANAGE' }],
  })
  const ctx = await browser.newContext({ storageState: gerente.estado })
  try {
    const antes = (await db().from('branch_product_stock').select('current_stock').eq('product_id', produto).eq('branch_id', batel).maybeSingle()).data
    const destinoDepois = Number(antes?.current_stock ?? 0) + 2
    const slug = (await db().from('branches').select('slug').eq('id', rede!.branchId).single<{ slug: string }>()).data!.slug
    const p = await ctx.newPage()
    await p.goto(`/${slug}/estoque`)
    const engrenagem = p.locator('tr, [role="row"], div').filter({ hasText: PRODUTO })
      .filter({ has: p.getByTitle('Gerenciar estoque') }).last().getByTitle('Gerenciar estoque')
    const modal = p.locator('dialog[open]').filter({ hasText: 'Gerenciar estoque' })
    await expect(async () => {
      await engrenagem.click()
      await expect(modal).toBeVisible({ timeout: 2_000 })
    }).toPass({ timeout: 30_000 })
    await modal.getByRole('button', { name: 'Transferência', exact: true }).click()
    await modal.locator('select[name="toBranchId"]').selectOption(batel)
    await modal.locator('input[name="quantity"]').fill('2')
    await modal.getByRole('button', { name: 'Confirmar transferência' }).click()
    await expect(p.getByText(`${BATEL} agora tem ${destinoDepois} un`)).toBeVisible({ timeout: 15_000 })
  } finally {
    await ctx.close()
    await gerente.limpar()
  }
})
