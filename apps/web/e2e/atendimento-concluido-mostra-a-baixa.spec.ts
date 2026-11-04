import { test, expect } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * D9 da 6ª simulação (2026-11-04; princípio 3): a Nina usou 1 un de Gel
 * condutor na Limpeza da Carla — o banco tem a baixa (`PROCEDURE_USAGE` −1) —,
 * e o atendimento concluído dizia "Nenhum insumo registrado". A tela montava
 * os insumos do CADASTRO do procedimento (ou da sessão do plano), nunca da
 * baixa feita: o insumo acrescentado na hora sumia, e o do cadastro que ela
 * desmarcou aparecia. Concluído, a tela mostra a BAIXA.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let dona: MembroDeTeste | null = null
let agendamento = ''
let doCadastro = ''
let usado = ''
test.describe.configure({ timeout: 180_000 })

test.beforeAll(async () => {
  test.setTimeout(240_000)
  rede = await criarOutraRede(`acb${marca}`)
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  expect((await db().from('users').update({ provides_services: true }).eq('id', rede.professionalId)).error).toBeNull()
  dona = await criarMembro(`acbd${marca}`, { tenant: rede.tenantId, donoDaRede: true, rotulo: 'Dona', permissoes: [] })
  // O cadastro do procedimento pede a Luva; ela não usou. Usou o Gel, acrescentado na hora.
  doCadastro = await rede.criarProduto('Luva do cadastro')
  usado = await rede.criarProduto('Gel acrescentado')
  expect((await db().from('procedure_products').insert({ procedure_id: rede.procedureId, product_id: doCadastro, quantity: 2 })).error).toBeNull()
  const cliente = await rede.criarCliente('Carla')
  const agora = Date.now()
  const a = await db().from('appointments').insert({
    branch_id: rede.branchId, client_id: cliente, procedure_id: rede.procedureId, professional_id: rede.professionalId,
    source: 'INTERNAL', duration_min: 30, price: 0, status: 'COMPLETED',
    scheduled_at: new Date(agora - 2 * 3600_000).toISOString(), started_at: new Date(agora - 2 * 3600_000).toISOString(),
    completed_at: new Date(agora - 3600_000).toISOString(),
  }).select('id').single<{ id: string }>()
  expect(a.error, 'o atendimento concluído').toBeNull()
  agendamento = a.data!.id
  const m = await db().from('stock_movements').insert({
    branch_id: rede.branchId, product_id: usado, type: 'PROCEDURE_USAGE', quantity: -1, balance_after: 9,
    appointment_id: agendamento, created_by: 'e2e',
  })
  expect(m.error, 'a baixa do Gel').toBeNull()
})

test.afterAll(async () => {
  if (agendamento) {
    await db().from('stock_movements').delete().eq('appointment_id', agendamento)
    await db().from('appointment_history').delete().eq('appointment_id', agendamento)
    await db().from('appointments').delete().eq('id', agendamento)
  }
  if (rede) await db().from('procedure_products').delete().eq('procedure_id', rede.procedureId)
  await dona?.limpar(); await rede?.limpar()
})

test('o atendimento concluído mostra os insumos da BAIXA, inclusive o acrescentado na hora', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: dona!.estado })
  try {
    const p = await ctx.newPage()
    await p.goto(`/admin/agenda/${agendamento}`)
    const cartao = p.locator('.card', { hasText: 'Insumos utilizados' }).last()
    await expect(cartao).toBeVisible({ timeout: 30_000 })
    await expect(cartao).toContainText(`${PREFIXO} Gel acrescentado acb${marca}`)
    await expect(cartao).not.toContainText('Nenhum insumo registrado')
    await expect(cartao).not.toContainText('Luva do cadastro')
  } finally { await ctx.close() }
})
