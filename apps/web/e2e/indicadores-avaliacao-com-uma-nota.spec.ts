import { test, expect } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * D11 da 6ª simulação (2026-11-04; princípio 3, nada de regra escondida): a
 * Carla deu 4 estrelas à Nina, e o dashboard dizia "Melhor/Pior avaliados: Sem
 * avaliações no período" — o ranking exigia 3 notas, e a tela não dizia. Entra
 * com UMA nota, e a linha diz quantas ("1 aval."); a nota de cada procedimento
 * aparece no mesmo dashboard ("Procedimentos melhor avaliados").
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let dona: MembroDeTeste | null = null
let agendamento = ''
test.describe.configure({ timeout: 180_000 })

test.beforeAll(async () => {
  test.setTimeout(240_000)
  rede = await criarOutraRede(`av${marca}`)
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  expect((await db().from('users').update({ branch_id: rede.branchId, provides_services: true }).eq('id', rede.professionalId)).error).toBeNull()
  dona = await criarMembro(`avd${marca}`, { tenant: rede.tenantId, donoDaRede: true, rotulo: 'Dona', permissoes: [] })
  const cliente = await rede.criarCliente('Carla')
  const agora = Date.now()
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede.branchId, client_id: cliente, procedure_id: rede.procedureId, professional_id: rede.professionalId,
    source: 'INTERNAL', duration_min: 30, price: 0, status: 'COMPLETED',
    scheduled_at: new Date(agora - 2 * 3600_000).toISOString(), completed_at: new Date(agora - 3600_000).toISOString(),
    client_confirmed_at: new Date(agora - 1800_000).toISOString(), client_rating: 4, procedure_rating: 4,
  }).select('id').single<{ id: string }>()
  expect(error, 'o atendimento avaliado').toBeNull()
  agendamento = data!.id
})

test.afterAll(async () => {
  if (agendamento) await db().from('appointments').delete().eq('id', agendamento)
  await dona?.limpar(); await rede?.limpar()
})

test('uma nota só já aparece no ranking, com "1 aval." — da profissional e do procedimento', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: dona!.estado })
  try {
    const p = await ctx.newPage()
    await p.goto('/admin/dashboard')
    const melhores = p.locator('.card', { hasText: '★ Melhor avaliados' }).first()
    await expect(melhores).toBeVisible({ timeout: 30_000 })
    await expect(melhores).toContainText(`${PREFIXO} Prof av${marca}`)
    await expect(melhores).toContainText('1 aval.')
    const procedimentos = p.locator('.card', { hasText: '★ Procedimentos melhor avaliados' }).first()
    await expect(procedimentos).toContainText(`${PREFIXO} Proc av${marca}`)
  } finally { await ctx.close() }
})
