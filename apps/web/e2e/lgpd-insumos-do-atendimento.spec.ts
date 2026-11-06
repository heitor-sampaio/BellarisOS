import { test, expect } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'

/**
 * D18 da 8ª simulação (2026-11-06): o JSON da LGPD trazia `insumos: null` no
 * atendimento que baixou 1 Gel condutor. O export lia
 * `medical_record_entries.products_used`, que nenhuma action nem função grava:
 * o consumo do atendimento mora no ESTOQUE (o movimento `PROCEDURE_USAGE`
 * com o `appointment_id`). Agora o pacote leva os insumos de lá — o produto,
 * a quantidade na unidade dele e o lote, quando houver.
 *
 * Numa rede [e2e] própria.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let equipe: MembroDeTeste | null = null
let cliente = ''

test.beforeAll(async () => {
  test.setTimeout(150_000)
  rede = await criarOutraRede(`lgi${marca}`)
  equipe = await criarMembro(`lgie${marca}`, {
    tenant: rede.tenantId, rotulo: 'Gerente', permissoes: [{ modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'medical_records', nivel: 'MANAGE' }],
  })
  cliente = await rede.criarCliente('Helena')
  const gel = await rede.criarProduto('Gel condutor', 10)
  const ontem = new Date(Date.now() - 86_400_000).toISOString()
  const ag = await db().from('appointments').insert({
    branch_id: rede.branchId, client_id: cliente, procedure_id: rede.procedureId, professional_id: rede.professionalId,
    status: 'COMPLETED', source: 'INTERNAL', duration_min: 30, price: 0, scheduled_at: ontem, completed_at: ontem,
  }).select('id').single<{ id: string }>()
  expect(ag.error).toBeNull()
  const pr = await db().from('medical_records').upsert({ client_id: cliente }, { onConflict: 'client_id' }).select('id').single<{ id: string }>()
  expect(pr.error).toBeNull()
  expect((await db().from('medical_record_entries').insert({
    medical_record_id: pr.data!.id, appointment_id: ag.data!.id, professional_id: rede.professionalId, notes: 'evolução',
  })).error).toBeNull()
  // O consumo do atendimento, como a conclusão grava: o movimento do estoque.
  expect((await db().from('stock_movements').insert({
    branch_id: rede.branchId, product_id: gel, type: 'PROCEDURE_USAGE', quantity: -1, balance_after: 9,
    appointment_id: ag.data!.id, created_by: 'e2e',
  })).error).toBeNull()
})

test.afterAll(async () => {
  await db().from('lgpd_requests').delete().eq('client_id', cliente)
  await equipe?.limpar(); await rede?.limpar()
})

test('D18: o pacote da LGPD leva os insumos do atendimento, do estoque', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: equipe!.estado })
  try {
    const p = await ctx.newPage()
    const r = await chamarAcao(p, 'actions/lgpd.ts', 'exportarDadosPelaEquipe', `/admin/clients/${cliente}`, [cliente, { incluirProntuario: true }])
    expect(r.texto).toContain('"ok":true')
  } finally { await ctx.close() }
  let caminho = ''
  await expect.poll(async () => {
    const { data } = await db().from('lgpd_requests').select('status, export_json_path').eq('client_id', cliente).maybeSingle()
    caminho = (data?.export_json_path as string | null) ?? ''
    return data?.status
  }, { timeout: 60_000 }).toBe('completed')
  const { data: url } = await db().storage.from('lgpd-exports').createSignedUrl(caminho, 60)
  const pacote = await (await fetch(url!.signedUrl)).json() as { prontuario: { atendimentos: { insumos: unknown }[] } }
  expect(pacote.prontuario.atendimentos.map(a => a.insumos)).toEqual([
    [{ produto: `${PREFIXO} Gel condutor lgi${marca}`, quantidade: 1, unidade: 'un', lote: null }],
  ])
})
