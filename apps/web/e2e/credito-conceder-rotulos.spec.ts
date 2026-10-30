import { test, expect } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * J-51 (simulação de 2026-10-30): no "Conceder crédito" da ficha, os rótulos
 * não eram ligados aos campos (o leitor de tela e o clique no rótulo não
 * chegavam a eles — design.md, "Formulários"), e o exemplo do motivo era
 * "Estorno de pagamento duplicado", um caso raro que confundia: crédito é,
 * no dia a dia, o valor pago a mais ou adiantado que fica para a próxima.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let financeiro: MembroDeTeste | null = null
let cliente = ''

test.beforeAll(async () => {
  rede = await criarOutraRede(`ccr${marca}`)
  cliente = await rede.criarCliente('Crédito')
  financeiro = await criarMembro(`ccrf${marca}`, {
    tenant: rede.tenantId, rotulo: 'Financeiro',
    permissoes: [{ modulo: 'clients', nivel: 'VIEW' }, { modulo: 'financial', nivel: 'MANAGE' }],
  })
})

test.afterAll(async () => {
  if (cliente) {
    await db().from('financial_transactions').delete().eq('client_id', cliente)
    await db().from('internal_credits').delete().eq('client_id', cliente)
  }
  await financeiro?.limpar()
  await rede?.limpar()
})

test('o "Conceder crédito" tem os rótulos ligados aos campos e um exemplo comum', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: financeiro!.estado })
  try {
    const p = await ctx.newPage()
    await p.goto(`/admin/clients/${cliente}?aba=financeiro`)
    await p.getByRole('button', { name: /Conceder crédito/ }).first().click()
    const valor = p.getByLabel('Valor (R$) *')
    const motivo = p.getByLabel('Motivo *')
    await expect(motivo).not.toHaveAttribute('placeholder', /Estorno de pagamento duplicado/)
    await expect(motivo).toHaveAttribute('placeholder', /pago a mais/)
    await valor.fill('25')
    await motivo.fill(`${PREFIXO} troco que fica para a próxima ${marca}`)
    await p.locator('form').getByRole('button', { name: 'Conceder crédito' }).click()
    await expect.poll(async () => {
      const { data } = await db().from('internal_credits').select('amount').eq('client_id', cliente)
      return (data ?? []).map(c => Number(c.amount))
    }, { timeout: 15_000 }).toEqual([25])
  } finally { await ctx.close() }
})
