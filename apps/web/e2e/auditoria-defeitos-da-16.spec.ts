import { test, expect } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * D7 da 16ª simulação (2026-11-16), numa rede própria: a baixa de uma
 * parcela se lê "Recebeu a parcela 1/4 (R$ 200,00, Pix)". A gravação da baixa
 * guarda só as colunas que mudaram (o pagamento, a forma); o valor e a parcela
 * a leitura busca agora, no lançamento (`nomesDaAuditoria`). Nada deixa de ser
 * gravado; muda a leitura. (A frase de cada gravação, uma a uma, está em
 * tests/auditoria-defeitos-da-16.test.ts.)
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede
let dona: MembroDeTeste

test.beforeAll(async () => {
  rede = await criarOutraRede(`aud16${marca}`)
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  dona = await criarMembro(`aud16d${marca}`, { tenant: rede.tenantId, donoDaRede: true, rotulo: 'Dona', permissoes: [] })
})

test.afterAll(async () => {
  await dona?.limpar()
  await rede?.limpar()
})

test('D7: a baixa da parcela diz "Recebeu a parcela 1/4", com o valor lido do lançamento', async ({ browser }) => {
  const cliente = await rede.criarCliente(`aud16c${marca}`)
  const nome = (await db().from('clients').select('name').eq('id', cliente).single<{ name: string }>()).data!.name
  const { data: parcela, error } = await db().from('financial_transactions').insert({
    branch_id: rede.branchId, client_id: cliente, type: 'INCOME', category: 'Serviços', description: `Parcela 1/4 ${marca}`,
    amount: 200, created_by: 'e2e', is_paid: false, parcela_numero: 1, parcela_total: 4, due_date: '2026-12-10',
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  // A baixa: um comando só, como a do PDV (o pagamento e a forma).
  expect((await db().from('financial_transactions')
    .update({ is_paid: true, paid_at: new Date().toISOString(), payment_method: 'PIX' }).eq('id', parcela!.id)).error).toBeNull()
  const { data: gravada } = await db().from('auditoria').select('depois').eq('tenant_id', rede.tenantId)
    .eq('registro_id', parcela!.id).eq('operacao', 'editou').single<{ depois: Record<string, unknown> }>()
  expect(gravada!.depois.amount, 'a baixa não grava o valor (não mudou): a leitura o busca').toBeUndefined()

  const ctx = await browser.newContext({ storageState: dona.estado, viewport: { width: 1440, height: 900 } })
  try {
    const p = await ctx.newPage()
    await p.goto('/admin/auditoria')
    await expect(p.locator('[data-linha-da-auditoria]', { hasText: 'Recebeu a parcela 1/4' }).first())
      .toContainText(/Recebeu a parcela 1\/4 \(R\$\s200,00, Pix\)/)
    await expect(p.locator('[data-linha-da-auditoria]', { hasText: 'Recebeu a parcela 1/4' }).first()).toContainText(nome)
  } finally { await ctx.close() }
})
