import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'

/**
 * D-15 (decisão do Heitor, 2026-10-29): "A clínica configura 'parcela até
 * Nx'. O padrão é o maior número de parcelas com taxa cadastrada."
 *
 * A rede tem taxa do crédito em 1x, 2x e 3x: sem nada gravado, o seletor
 * oferece até 3x e o servidor recusa 6x. A dona grava "até 2x" em
 * Configurações → Comissões, e o seletor encolhe.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let recepcao: MembroDeTeste | null = null
let dona: MembroDeTeste | null = null
let slug = ''
let cliente = ''
let aReceber = ''

async function como(browser: Browser, quem: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: quem.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`pc${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  recepcao = await criarMembro(`pcr${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Recepção',
    permissoes: [
      { modulo: 'financial', nivel: 'MANAGE' }, { modulo: 'cashier', nivel: 'MANAGE' },
      { modulo: 'clients', nivel: 'VIEW' }, { modulo: 'agenda', nivel: 'MANAGE' },
    ],
  })
  // O portal da rede manda ao /setup a rede sem onboarding.
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  dona = await criarMembro(`pcd${marca}`, { tenant: rede.tenantId, donoDaRede: true, permissoes: [] })
  const { error: eT } = await db().from('payment_fees').insert([1, 2, 3].map(n => ({
    tenant_id: rede!.tenantId, metodo: 'CREDIT_CARD', parcelas: n, taxa_pct: 3 + n,
  })))
  expect(eT).toBeNull()
  cliente = await rede.criarCliente('Joana')
  await db().from('procedures').update({ price: 300 }).eq('id', rede.procedureId)
  const agora = new Date().toISOString()
  const { data: ag, error: eAg } = await db().from('appointments').insert({
    branch_id: rede.branchId, client_id: cliente, procedure_id: rede.procedureId, professional_id: rede.professionalId,
    status: 'COMPLETED', source: 'INTERNAL', duration_min: 30, price: 300, scheduled_at: agora, completed_at: agora,
  }).select('id').single<{ id: string }>()
  expect(eAg).toBeNull()
  aReceber = ag!.id
})

test.afterAll(async () => {
  await db().from('financial_transactions').delete().eq('branch_id', rede!.branchId)
  await db().from('payment_fees').delete().eq('tenant_id', rede!.tenantId)
  await recepcao?.limpar(); await dona?.limpar(); await rede?.limpar()
})

async function vezesOferecidas(p: Page): Promise<string[]> {
  await p.goto(`/${slug}/agenda/${aReceber}?receber=1`)
  const janela = p.getByRole('dialog', { name: 'Confirmar pagamento' })
  await janela.getByLabel('Forma de pagamento').selectOption('CREDIT_CARD')
  const vezes = janela.getByLabel('Vezes no cartão')
  await expect(vezes.locator('option').nth(1)).toBeAttached()
  return vezes.locator('option').evaluateAll(os => os.map(o => (o as HTMLOptionElement).value))
}

test.describe.serial('parcelas no crédito', () => {
  test('sem nada gravado, o limite é a maior parcela com taxa: até 3x', async ({ browser }) => {
    await como(browser, recepcao!, async p => {
      await expect.poll(() => vezesOferecidas(p)).toEqual(['1', '2', '3'])
    })
  })

  test('o servidor recusa acima do limite (venda de pré-pago em 6x), e aceita 3x', async ({ browser }) => {
    await como(browser, recepcao!, async p => {
      const rota = `/${slug}/clients/${cliente}`
      const r = await chamarAcao(p, 'actions/pre-pago.ts', 'venderProcedimento', rota,
        [cliente, rede!.procedureId, rede!.branchId, 1, null, { forma: 'AVISTA', metodo: 'CREDIT_CARD', vezes: 6 }, null])
      expect(r.texto).toContain('em até 3x')
      expect((await db().from('procedure_sales').select('id').eq('client_id', cliente)).data ?? []).toHaveLength(0)

      const ok = await chamarAcao(p, 'actions/pre-pago.ts', 'venderProcedimento', rota,
        [cliente, rede!.procedureId, rede!.branchId, 1, null, { forma: 'AVISTA', metodo: 'CREDIT_CARD', vezes: 3 }, null])
      expect(ok.texto).toContain('saleId')
    })
  })

  test('a dona grava "até 2x" em Configurações → Comissões, e o seletor encolhe', async ({ browser }) => {
    await como(browser, dona!, async p => {
      await p.goto('/admin/settings?tab=comissoes')
      const campo = p.getByLabel('Parcelar no crédito até')
      await expect(campo).toHaveValue('')
      await expect(campo.locator('option[value=""]')).toHaveText(/Automático.*3x/)
      await campo.selectOption('2')
      await p.getByRole('button', { name: 'Salvar taxas' }).click()
      await expect(p.getByRole('status').filter({ hasText: 'Salvo.' })).toBeVisible()
    })
    const { data } = await db().from('tenants').select('cartao_max_vezes').eq('id', rede!.tenantId).single()
    expect(data!.cartao_max_vezes).toBe(2)
    await como(browser, recepcao!, async p => {
      await expect.poll(() => vezesOferecidas(p)).toEqual(['1', '2'])
    })
  })
})
