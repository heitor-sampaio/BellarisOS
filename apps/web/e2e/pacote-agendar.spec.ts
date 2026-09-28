import { test, expect } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'

/**
 * Agendar uma sessão de pacote (`schedulePackageSession`).
 *
 * Até 2026-09-28 NUNCA funcionou: gravava `status: 'SCHEDULED'` na sessão, e o
 * enum só tem AVAILABLE, USED e EXPIRED — a gravação falhava depois de o
 * agendamento já ter nascido, que ficava órfão na agenda. Achado escrevendo o
 * teste da conclusão atômica. E nem chegava lá: `client_packages` não tinha
 * chave para `branches`, e o embed que confere a rede respondia PGRST200 — a
 * mesma consulta da lista de sessões, que também nunca abria.
 */

const marca = Date.now().toString(36)
const db = () => banco()

let outra: OutraRede | null = null
let membro: MembroDeTeste | null = null
let cliente = '', sessao = '', pacote = ''

test.beforeAll(async () => {
  outra = await criarOutraRede(`pac${marca}`)
  membro = await criarMembro(`pac${marca}`, {
    tenant: outra.tenantId, rotulo: 'Agenda',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'VIEW' }],
  })
  cliente = await outra.criarCliente('pacote')
  const b = db()
  const { data: sp } = await b.from('service_packages').insert({
    tenant_id: outra.tenantId, procedure_id: outra.procedureId, name: '[e2e] pacote', total_sessions: 2, price: 200,
  }).select('id').single<{ id: string }>()
  const { data: cp } = await b.from('client_packages').insert({
    client_id: cliente, package_id: sp!.id, branch_id: outra.branchId, total_sessions: 2, used_sessions: 0,
  }).select('id').single<{ id: string }>()
  const { data: ps, error } = await b.from('package_sessions').insert({
    client_package_id: cp!.id, status: 'AVAILABLE', session_number: 1,
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  sessao = ps!.id
  pacote = cp!.id
})

test.afterAll(async () => {
  if (!outra) return
  const b = db()
  const falhas: string[] = []
  const olhar = (o: string, r: { error: { message: string } | null }) => { if (r.error) falhas.push(`${o}: ${r.error.message}`) }
  olhar('sessões', await b.from('package_sessions').delete().eq('id', sessao))
  olhar('pacotes do cliente', await b.from('client_packages').delete().eq('branch_id', outra.branchId))
  olhar('pacotes', await b.from('service_packages').delete().eq('tenant_id', outra.tenantId))
  await membro?.limpar()
  await outra.limpar()
  expect(falhas).toEqual([])
})

test('agenda a sessão; o segundo clique na mesma sessão é recusado sem deixar agendamento órfão', async ({ browser }) => {
  const quando = new Date(Date.now() + 2 * 86_400_000); quando.setUTCHours(14, 0, 0, 0)
  const pedido = {
    packageSessionId: sessao, branchId: outra!.branchId, professionalId: outra!.professionalId,
    scheduledAt: quando.toISOString(), clientId: cliente, procedureId: outra!.procedureId,
    price: 0, durationMin: 60, slug: 'admin',
  }
  const ctx = await browser.newContext({ storageState: membro!.estado })
  const page = await ctx.newPage()
  try {
    const chamar = (p: typeof pedido) => chamarAcao(page, 'actions/appointments.ts', 'schedulePackageSession', `/admin/clients/${cliente}`, [p])
    await chamar(pedido)
    const { data: s1 } = await db().from('package_sessions').select('appointment_id, status').eq('id', sessao).single()
    expect(s1!.appointment_id, 'a sessão ficou marcada').toBeTruthy()
    expect(s1!.status, 'e continua disponível até ser usada').toBe('AVAILABLE')

    // A lista de sessões do pacote também não abria (o mesmo embed).
    const lista = await chamarAcao(page, 'actions/appointments.ts', 'getClientPackageSessions', `/admin/clients/${cliente}`, [pacote])
    expect(lista.texto, 'a sessão aparece marcada').toContain(s1!.appointment_id as string)

    const segundo = await chamar({ ...pedido, scheduledAt: new Date(quando.getTime() + 3 * 3600_000).toISOString() })
    expect(segundo.texto).toContain('Sessão já está agendada')
  } finally { await ctx.close() }
  const { data: appts } = await db().from('appointments').select('id').eq('client_id', cliente)
  expect(appts, 'um agendamento só — nenhum órfão').toHaveLength(1)
})
