import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { euVendiOPlano, receberPlanoNoPdv } from './apoio/vender'

/**
 * D3 da 15ª simulação (2026-11-15): a Camila agendou a sessão 1 do plano pelo
 * app (a sessão se agenda antes de pagar — PT1d/PT3), e ao receber o plano no
 * PDV a Lia leu "Plano fechado: 5 sessões. Nenhuma agendada ainda". O checkout
 * contava só as datas escolhidas nele. Decidido pelos princípios (3): o
 * checkout parte das sessões já agendadas — diz "já agendada" com a data, não
 * a oferece de novo, e o aviso do fim a conta. Numa rede [e2e] própria.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let caixa: MembroDeTeste | null = null
let planId = ''
let agendamento = ''

async function como<T>(browser: Browser, estado: string, fn: (p: Page) => Promise<T>) {
  const ctx = await browser.newContext({ storageState: estado, viewport: { width: 1440, height: 900 } })
  try { return await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  test.setTimeout(180_000)
  rede = await criarOutraRede(`d3${marca}`)
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  expect((await db().from('users').update({ provides_services: true, branch_id: rede.branchId }).eq('id', rede.professionalId)).error).toBeNull()
  const plano = await rede.criarPlanoProposto('d3', { semTermo: true })
  planId = plano.planId
  // A sessão 2.
  const { data: s2, error: eS2 } = await db().from('treatment_plan_sessions').insert({ plan_id: planId, sort_order: 1 }).select('id').single<{ id: string }>()
  expect(eS2).toBeNull()
  expect((await db().from('treatment_plan_session_procedures').insert({ session_id: s2!.id, procedure_id: rede.procedureId, price: 50 })).error).toBeNull()
  // A sessão 1 já agendada (pela cliente, no app): amanhã às 14h de Brasília.
  const amanha = new Date(Date.now() + 86_400_000)
  const dia = amanha.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  const { data: ap, error: eAp } = await db().from('appointments').insert({
    branch_id: rede.branchId, client_id: plano.clientId, procedure_id: rede.procedureId, professional_id: rede.professionalId,
    scheduled_at: new Date(`${dia}T14:00:00-03:00`).toISOString(), duration_min: 30, price: 50, status: 'SCHEDULED',
    source: 'CLIENT_APP', treatment_plan_id: planId,
  }).select('id').single<{ id: string }>()
  expect(eAp, eAp?.message).toBeNull()
  agendamento = ap!.id
  const { data: s1 } = await db().from('treatment_plan_sessions').select('id').eq('plan_id', planId).eq('sort_order', 0).single<{ id: string }>()
  expect((await db().from('treatment_plan_sessions').update({ appointment_id: agendamento }).eq('id', s1!.id)).error).toBeNull()

  caixa = await criarMembro(`d3c${marca}`, {
    tenant: rede.tenantId, rotulo: 'Recebe o plano',
    permissoes: [
      { modulo: 'medical_records', nivel: 'MANAGE' }, { modulo: 'cashier', nivel: 'MANAGE' },
      { modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'VIEW' },
    ],
  })
})

test.afterAll(async () => {
  await caixa?.limpar()
  await rede?.limpar()
})

test('D3: o checkout do plano diz que a sessão 1 já está agendada, e o fim a conta', async ({ browser }) => {
  test.setTimeout(150_000)
  const dia = new Date(Date.now() + 86_400_000).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' })
  await como(browser, caixa!.estado, async page => {
    const janela = await receberPlanoNoPdv(page, '/admin', planId)
    const primeira = janela.locator('[data-sessao-do-checkout="1"]')
    await expect(primeira).toContainText(`já agendada: ${dia} às 14:00`)
    await expect(janela.locator('[data-sessao-do-checkout="2"]')).not.toContainText('já agendada')

    await janela.getByRole('button', { name: 'Confirmar plano' }).click()
    await janela.getByRole('radio', { name: 'Pix', exact: true }).click()
    await euVendiOPlano(page)
    await janela.getByRole('button', { name: 'Ir para a documentação' }).click()
    // Sem documento configurado, a documentação só confirma.
    await janela.getByRole('button', { name: /^(Receber R\$|Fechar a comanda)/ }).click()
    await expect(page.getByText(/Plano fechado: 2 sessões\. 1 já agendada, 1 sem data — agende pela ficha quando .+ marcar\./))
      .toBeVisible({ timeout: 30_000 })
  })
  // A sessão 1 segue com o agendamento dela (o checkout não marcou outro).
  const { data } = await db().from('appointments').select('id').eq('treatment_plan_id', planId).neq('status', 'CANCELLED')
  expect((data ?? []).map(a => a.id)).toEqual([agendamento])
})
