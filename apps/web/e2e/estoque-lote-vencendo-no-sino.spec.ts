import { test, expect } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * A39 da 10ª simulação (2026-11-10): o lote a vencer aparecia no Estoque e no
 * dashboard, mas não chegava ao sino. O job do estoque mínimo passa também
 * pelos lotes que vencem em 30 dias e avisa quem responde pelo Estoque na
 * unidade, UMA vez por lote. Chama o cron (COMPARTILHADO), recortado à rede
 * [e2e] pelo `?rede=`.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let estoquista: MembroDeTeste | null = null
let olheiro: MembroDeTeste | null = null
let loteId = ''
const diaISO = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d)

test.beforeAll(async () => {
  test.setTimeout(150_000)
  rede = await criarOutraRede(`ls10${marca}`)
  estoquista = await criarMembro(`ls10e${marca}`, { tenant: rede.tenantId, rotulo: 'Estoquista', permissoes: [{ modulo: 'stock', nivel: 'MANAGE' }] })
  olheiro = await criarMembro(`ls10o${marca}`, { tenant: rede.tenantId, rotulo: 'Olheiro', permissoes: [{ modulo: 'stock', nivel: 'VIEW' }] })
  const { data: p, error } = await db().from('products').insert({ tenant_id: rede.tenantId, name: `${PREFIXO} Toxina ${marca}`, unit: 'frasco', uso: 'INSUMO' })
    .select('id').single<{ id: string }>()
  expect(error).toBeNull()
  expect((await db().rpc('estoque_entrada', {
    p_produto: p!.id, p_unidade: rede.branchId, p_quantidade: 2, p_custo: 600, p_observacao: null,
    p_lote: `TX-${marca}`, p_validade: diaISO(new Date(Date.now() + 10 * 86_400_000)), p_autor: 'e2e',
  })).error).toBeNull()
  loteId = (await db().from('product_batches').select('id').eq('batch_number', `TX-${marca}`).single<{ id: string }>()).data!.id
})

test.afterAll(async () => {
  await estoquista?.limpar(); await olheiro?.limpar(); await rede?.limpar()
})

test('A39: o lote que vence em 30 dias chega ao sino de quem cuida do estoque, uma vez', async ({ request }) => {
  const segredo = process.env.CRON_SECRET
  test.skip(!segredo, 'sem CRON_SECRET')
  const avisos = async () => ((await db().from('user_notifications').select('user_id, title, body')
    .eq('type', 'batch_expiring').filter('data->>lote_id', 'eq', loteId)).data ?? []) as { user_id: string; title: string; body: string }[]

  const r = await request.get(`/api/cron/estoque-minimo?rede=${rede!.tenantId}`, { headers: { authorization: `Bearer ${segredo}` } })
  expect(r.ok(), await r.text()).toBe(true)
  await expect.poll(async () => (await avisos()).map(a => a.user_id)).toContain(estoquista!.userId)
  const lista = await avisos()
  expect(lista.map(a => a.user_id), 'quem só vê o estoque não é interrompido').not.toContain(olheiro!.userId)
  expect(lista[0]!.body).toContain(`lote TX-${marca}`)

  const r2 = await request.get(`/api/cron/estoque-minimo?rede=${rede!.tenantId}`, { headers: { authorization: `Bearer ${segredo}` } })
  expect(r2.ok()).toBe(true)
  expect((await avisos()).length, 'o mesmo lote não avisa duas vezes').toBe(lista.length)
})
