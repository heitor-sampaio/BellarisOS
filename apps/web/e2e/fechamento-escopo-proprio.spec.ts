import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * O dinheiro da UNIDADE é de quem vê a unidade inteira (D6 da simulação de
 * 2026-10-27).
 *
 * O cargo-modelo Profissional tem `financial: Ver, só os próprios` — para ela
 * ver as comissões DELA. A simulação achou a Dra. Lívia abrindo o Fechamento
 * do dia da unidade (saídas de R$ 2.400, saldo −R$ 2.400) e, na ficha da
 * cliente, o total pago e a receber de todos os atendimentos.
 *
 * Decisão do Heitor: o Fechamento (página e menu) pede quem RECEBE (`cashier`)
 * ou o financeiro com escopo de TODOS; a aba Financeiro da ficha, com "só os
 * próprios", mostra só o que é dos atendimentos dela — totais incluídos.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let profissional: MembroDeTeste | null = null
let financeiro: MembroDeTeste | null = null
let slug = ''
let cliente = ''
const agendamentos: string[] = []
const lancamentos: Record<number, string> = {}

async function como(m: MembroDeTeste, browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

/** Um atendimento concluído E pago (PIX), de quem atendeu. */
async function atendidoEPago(profissionalId: string, valor: number, dias: number) {
  const quando = new Date(Date.now() - dias * 86_400_000).toISOString()
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: cliente, procedure_id: rede!.procedureId, professional_id: profissionalId,
    status: 'COMPLETED', source: 'INTERNAL', duration_min: 30, price: valor, scheduled_at: quando, completed_at: quando,
  }).select('id').single<{ id: string }>()
  expect(error, 'concluir').toBeNull()
  agendamentos.push(data!.id)
  const { data: tx, error: eTx } = await db().from('financial_transactions').insert({
    branch_id: rede!.branchId, appointment_id: data!.id, client_id: cliente, type: 'INCOME', category: 'Serviços',
    description: `Atendimento ${valor} ${marca}`, amount: valor, payment_method: 'PIX', is_paid: true, paid_at: quando, created_by: 'e2e',
  }).select('id').single<{ id: string }>()
  expect(eTx, 'pagar').toBeNull()
  lancamentos[valor] = tx!.id
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`fp${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  // A matriz do cargo-modelo Profissional (private.cargos_modelo_semear).
  profissional = await criarMembro(`fpp${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Profissional',
    permissoes: [
      { modulo: 'agenda', nivel: 'MANAGE', escopo: 'OWN' }, { modulo: 'clients', nivel: 'VIEW' },
      { modulo: 'medical_records', nivel: 'MANAGE', escopo: 'OWN' }, { modulo: 'financial', nivel: 'VIEW', escopo: 'OWN' },
    ],
  })
  financeiro = await criarMembro(`fpf${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Financeiro',
    permissoes: [{ modulo: 'financial', nivel: 'VIEW', escopo: 'ALL' }, { modulo: 'clients', nivel: 'VIEW' }],
  })
  cliente = await rede.criarCliente('Mariana')
  await atendidoEPago(profissional.userId, 100, 2)
  await atendidoEPago(rede.professionalId, 250, 1)
})
test.afterAll(async () => {
  if (agendamentos.length) await db().from('financial_transactions').delete().in('appointment_id', agendamentos)
  await profissional?.limpar(); await financeiro?.limpar(); await rede?.limpar()
})

test.describe.serial('o dinheiro da unidade é de quem vê a unidade inteira', () => {
  // A ficha compila na primeira visita do dev: passa do minuto padrão.
  test.setTimeout(150_000)
  test('a profissional ("só os próprios") não abre o Fechamento do dia, nem pelo menu nem pela URL', async ({ browser }) => {
    await como(profissional!, browser, async p => {
      await p.goto(`/${slug}/dashboard`)
      await expect(p.getByRole('navigation').getByText('Agenda')).toBeVisible()
      await expect(p.getByRole('navigation').getByText('Fechamento do dia')).toHaveCount(0)
      await p.goto(`/${slug}/fechamento`)
      await expect(p.getByText('Você não tem acesso a esta área')).toBeVisible()
      await expect(p.locator('[data-forma="TOTAL"]')).toHaveCount(0)
    })
  })

  test('o financeiro com escopo de todos abre', async ({ browser }) => {
    await como(financeiro!, browser, async p => {
      await p.goto(`/${slug}/dashboard`)
      await p.getByRole('navigation').getByText('Fechamento do dia').click()
      await expect(p).toHaveURL(new RegExp(`/${slug}/fechamento`))
      await expect(p.locator('[data-forma="TOTAL"]')).toBeVisible()
    })
  })

  test('na ficha, a aba Financeiro da profissional mostra só os atendimentos dela, com os totais', async ({ browser }) => {
    await como(profissional!, browser, async p => {
      await p.goto(`/${slug}/clients/${cliente}?aba=financeiro`)
      await expect(p.locator(`[data-lancamento="${lancamentos[100]}"]`)).toBeVisible()
      await expect(p.locator(`[data-lancamento="${lancamentos[250]}"]`)).toHaveCount(0)
      await expect(p.locator('[data-total="pago"]')).toContainText('100,00')
    })
    // O controle: quem vê todos vê os dois.
    await como(financeiro!, browser, async p => {
      await p.goto(`/${slug}/clients/${cliente}?aba=financeiro`)
      await expect(p.locator(`[data-lancamento="${lancamentos[250]}"]`)).toBeVisible()
      await expect(p.locator('[data-total="pago"]')).toContainText('350,00')
    })
  })
})
