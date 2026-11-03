import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { apagarAgendamentos } from './apoio/limpeza'
import { responderAnamnese } from './apoio/anamnese'

/**
 * A36 da 5ª simulação: no mapa de injetáveis o produto era texto livre e não
 * se ligava ao insumo — o mapa gravava 0,5 ml e o estoque baixava 1 ml, sem
 * aviso — e o mapa mostrava "0.5 ml" onde o painel dizia "0,5 ml".
 *
 * Agora o produto do ponto vem do ESTOQUE (os insumos da unidade), o
 * "Finalizar" compara a dose do mapa com a baixa e oferece baixar a do mapa,
 * e a dose sai com vírgula.
 */

test.describe.configure({ mode: 'serial', timeout: 120_000 })

const marca = Date.now().toString(36)
const db = () => banco()
const FICHA = `Ficha de toxina ${marca}`
let rede: OutraRede | null = null
let profissional: MembroDeTeste | null = null
let slug = ''
let fichaId = ''
let produto = ''
let nomeDoProduto = ''
const clientes: string[] = []

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: profissional!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

const ponto = (id: string, dose: number, unit: string, produtoNome = nomeDoProduto) =>
  ({ id, x: 0.4 + Math.random() * 0.2, y: 0.3, product: produtoNome, dose, unit, applied: null, view: 'rosto_f' })

async function comMapa(rotulo: string, pontos: unknown[]): Promise<{ id: string; cliente: string; mapa: string }> {
  const cliente = await rede!.criarCliente(rotulo)
  clientes.push(cliente)
  await responderAnamnese(cliente, rede!.tenantId)
  const { data: m, error: eM } = await db().from('injectable_maps').insert({
    tenant_id: rede!.tenantId, branch_id: rede!.branchId, client_id: cliente, name: `[e2e] Mapa ${rotulo} ${marca}`, view: 'rosto_f', points: pontos,
  }).select('id').single<{ id: string }>()
  expect(eM).toBeNull()
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: cliente, procedure_id: rede!.procedureId, professional_id: profissional!.userId,
    status: 'IN_PROGRESS', source: 'INTERNAL', duration_min: 30, price: 0,
    scheduled_at: new Date(Date.now() - 30 * 60_000).toISOString(), started_at: new Date(Date.now() - 20 * 60_000).toISOString(),
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  return { id: data!.id, cliente, mapa: m!.id }
}

test.beforeAll(async () => {
  test.setTimeout(180_000)
  rede = await criarOutraRede(`ie${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  const { data: ficha, error } = await db().from('forms').insert({
    tenant_id: rede.tenantId, name: FICHA, is_active: true, tipo: 'PROCEDIMENTO',
    schema: { rows: [{ id: 'r1', fields: [{ id: 'mapa', type: 'injectable_map', label: 'Planejador de injetáveis', options: [`Texto solto ${marca}`] }] }] },
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  fichaId = ficha!.id
  expect((await db().from('procedures').update({ form_id: fichaId, price: 0 }).eq('id', rede.procedureId)).error).toBeNull()
  // O insumo: frasco de 100 UI; o procedimento pede 30 UI por padrão.
  produto = await rede.criarProduto('Toxina', 5)
  nomeDoProduto = (await db().from('products').select('name').eq('id', produto).single<{ name: string }>()).data!.name
  expect((await db().from('products').update({ units_per_package: 100, consumption_unit: 'UI', uso: 'INSUMO', cost_price: 900 }).eq('id', produto)).error).toBeNull()
  expect((await db().from('procedure_products').insert({ procedure_id: rede.procedureId, product_id: produto, quantity: 30 })).error).toBeNull()
  profissional = await criarMembro(`iep${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Profissional',
    permissoes: [
      { modulo: 'agenda', nivel: 'MANAGE', escopo: 'OWN' },
      { modulo: 'clients', nivel: 'VIEW' },
      { modulo: 'medical_records', nivel: 'MANAGE', escopo: 'OWN' },
    ],
  })
  expect((await db().from('users').update({ provides_services: true }).eq('id', profissional.userId)).error).toBeNull()
})

test.afterAll(async () => {
  if (!rede) return
  if (clientes.length) await db().from('injectable_applications').delete().in('client_id', clientes)
  await db().from('injectable_maps').delete().eq('tenant_id', rede.tenantId)
  await db().from('treatment_plans').delete().eq('branch_id', rede.branchId)
  const { data: ags } = await db().from('appointments').select('id').eq('branch_id', rede.branchId)
  expect(await apagarAgendamentos((ags ?? []).map(a => a.id as string)), 'a limpeza tem de apagar tudo').toEqual([])
  await db().from('procedure_products').delete().eq('procedure_id', rede.procedureId)
  await db().from('procedures').update({ form_id: null }).eq('id', rede.procedureId)
  if (fichaId) await db().from('forms').delete().eq('id', fichaId)
  await profissional?.limpar()
  await rede.limpar()
})

test('o produto do ponto se escolhe entre os insumos do estoque, e a dose sai com vírgula', async ({ browser }) => {
  const { id } = await comMapa('Escolha', [ponto('p1', 0.5, 'ml')])
  await como(browser, async p => {
    await p.goto(`/${slug}/agenda/${id}`)
    const campo = p.locator('[data-campo="mapa"]')
    await campo.getByText(`[e2e] Mapa Escolha ${marca}`).click()
    // A dose com vírgula no total do planejamento ("0,5 ml", não "0.5 ml").
    await expect(campo.getByText(`${nomeDoProduto}: 0,5 ml`)).toBeVisible()
    await expect(campo.getByText('0.5 ml')).toHaveCount(0)
    // O produto é escolhido numa lista: os insumos do estoque.
    const produtoDoPonto = campo.getByRole('combobox', { name: 'Produto' }).first()
    await expect(produtoDoPonto).toHaveValue(nomeDoProduto)
    const opcoes = await produtoDoPonto.locator('option').allTextContents()
    expect(opcoes).toContain(nomeDoProduto)
    expect(opcoes, 'o texto solto da ficha não é um produto do estoque').not.toContain(`Texto solto ${marca}`)
  })
})

test('o "Finalizar" compara a dose do mapa com a baixa e baixa a do mapa', async ({ browser }) => {
  const { id } = await comMapa('Baixa', [ponto('p1', 4, 'UI'), ponto('p2', 4, 'UI')])
  await como(browser, async p => {
    await p.goto(`/${slug}/agenda/${id}`)
    const campo = p.locator('[data-campo="mapa"]')
    await campo.getByText(`[e2e] Mapa Baixa ${marca}`).click()
    await expect(campo.getByText(`${nomeDoProduto}: 8 UI`)).toBeVisible()
    await p.getByRole('button', { name: 'Finalizar atendimento' }).click()
    const aviso = p.locator('[data-dose-do-mapa]')
    await expect(aviso).toContainText(`O mapa soma 8 UI de ${nomeDoProduto}; a baixa está em 30 UI.`)
    await aviso.getByRole('button', { name: 'Baixar 8 UI, a dose do mapa' }).click()
    await expect(aviso).toHaveCount(0)
    await p.getByRole('button', { name: 'Confirmar conclusão' }).click()
    await expect.poll(async () => (await db().from('appointments').select('status').eq('id', id).single()).data?.status).toBe('COMPLETED')
  })
  const { data: mov } = await db().from('stock_movements').select('quantity').eq('appointment_id', id).eq('product_id', produto)
  expect(mov?.map(m => Number(m.quantity)), 'baixa a dose do mapa, não a do cadastro').toEqual([-8])
})
