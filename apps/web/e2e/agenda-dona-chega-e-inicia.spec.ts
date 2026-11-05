import { test, expect } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { haMinutosHoje } from './apoio/datas'

/**
 * A25 da 6ª simulação (2026-11-04): a dona que atende (agenda de todas)
 * chegava ao atendimento DELA em quatro cliques e uma confirmação — janela →
 * "Chegou" → "Iniciar" → "mesmo assim" —, e a profissional, em um ("Marcar
 * chegada e iniciar", A21 de 27/10). Agora a janela oferece o mesmo gesto a
 * quem é a profissional DAQUELE agendamento, qualquer que seja o escopo. No
 * agendamento de outra, segue o caminho da recepção.
 */
const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let dona: MembroDeTeste | null = null
const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
const TODO_DIA = { dias: Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(d => [d, [{ de: '00:00', ate: '24:00' }]])) }

async function agendar(profissional: string): Promise<string> {
  const cliente = await rede!.criarCliente(`Dona ${profissional.slice(0, 4)}`)
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: cliente, procedure_id: rede!.procedureId, professional_id: profissional,
    // Já na hora: o início adiantado pergunta (r2-age-06), e não é disso que se trata.
    scheduled_at: haMinutosHoje(5), duration_min: 30, price: 0, status: 'SCHEDULED', source: 'INTERNAL',
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  return data!.id
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`adi${marca}`)
  expect((await db().from('branches').update({ horario: TODO_DIA }).eq('id', rede.branchId)).error).toBeNull()
  dona = await criarMembro(`adid${marca}`, {
    tenant: rede.tenantId, rotulo: 'Dona',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'medical_records', nivel: 'MANAGE' }],
  })
  expect((await db().from('users').update({ provides_services: true }).eq('id', dona.userId)).error).toBeNull()
})
test.afterAll(async () => {
  if (rede) {
    const { data: aps } = await db().from('appointments').select('id').eq('branch_id', rede.branchId)
    const ids = (aps ?? []).map(a => a.id as string)
    if (ids.length) {
      await db().from('appointment_history').delete().in('appointment_id', ids)
      await db().from('domain_events').delete().in('entidade_id', ids)
      await db().from('appointments').delete().in('id', ids)
    }
  }
  await dona?.limpar(); await rede?.limpar()
})

test('no agendamento DELA, a dona marca a chegada e inicia num gesto; no de outra, não', async ({ browser }) => {
  const dela = await agendar(dona!.userId)
  const deOutra = await agendar(rede!.professionalId)
  const ctx = await browser.newContext({ storageState: dona!.estado })
  try {
    const p = await ctx.newPage()
    await p.goto(`/admin/agenda?date=${hoje}`)
    await p.locator(`[data-agendamento="${deOutra}"]`).click()
    const janela = p.getByRole('dialog', { name: 'Agendamento' })
    await expect(janela.getByRole('button', { name: 'Chegou' })).toBeVisible()
    await expect(janela.getByRole('button', { name: 'Marcar chegada e iniciar' }), 'no de outra, o caminho da recepção').toHaveCount(0)
    await p.keyboard.press('Escape')

    await p.locator(`[data-agendamento="${dela}"]`).click()
    await janela.getByRole('button', { name: 'Marcar chegada e iniciar' }).click()
    await expect(p).toHaveURL(new RegExp(`/admin/agenda/${dela}`))
    await expect.poll(async () => (await db().from('appointments').select('status').eq('id', dela).single()).data?.status).toBe('IN_PROGRESS')
  } finally { await ctx.close() }
})
