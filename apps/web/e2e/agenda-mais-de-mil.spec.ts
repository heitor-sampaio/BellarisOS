import { test, expect } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * A agenda da unidade carrega a janela de 3 meses de uma vez — e o PostgREST
 * devolve no máximo 1000 linhas por consulta. Numa clínica com uns 12
 * atendimentos por dia, a grade perdia horários EM SILÊNCIO (achado de
 * 2026-10-21, revisando os atritos da simulação de um dia de clínica).
 * A leitura vai em páginas até o fim.
 */

test.setTimeout(240_000)

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let recepcao: MembroDeTeste | null = null

test.beforeAll(async () => {
  rede = await criarOutraRede(`mm${marca}`)
  expect((await db().from('users').update({ branch_id: rede.branchId, provides_services: true }).eq('id', rede.professionalId)).error).toBeNull()
  recepcao = await criarMembro(`mmr${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Recepção', permissoes: [{ modulo: 'agenda', nivel: 'MANAGE' }],
  })
})
test.afterAll(async () => {
  if (rede) {
    for (let i = 0; i < 3; i++) await db().from('appointments').delete().eq('branch_id', rede.branchId)
  }
  await recepcao?.limpar(); await rede?.limpar()
})

test('com mais de 1000 agendamentos na janela, o de hoje continua na grade', async ({ browser }) => {
  const cliente = await rede!.criarCliente('Volume')
  // 1010 horários de 30 min seguidos, começando 25 dias atrás (antes de hoje).
  const inicio = Date.now() - 25 * 86_400_000
  const linhas = Array.from({ length: 1010 }, (_, i) => ({
    branch_id: rede!.branchId, client_id: cliente, procedure_id: rede!.procedureId, professional_id: rede!.professionalId,
    status: 'SCHEDULED', source: 'INTERNAL', duration_min: 30, price: 0,
    scheduled_at: new Date(inicio + i * 30 * 60_000).toISOString(),
  }))
  for (let i = 0; i < linhas.length; i += 250) {
    const { error } = await db().from('appointments').insert(linhas.slice(i, i + 250))
    expect(error, 'semear os agendamentos').toBeNull()
  }
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
  const outra = await rede!.criarCliente('Hoje')
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: outra, procedure_id: rede!.procedureId, professional_id: rede!.professionalId,
    status: 'SCHEDULED', source: 'INTERNAL', duration_min: 30, price: 0, scheduled_at: new Date(`${hoje}T23:30:00-03:00`).toISOString(),
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()

  const slug = (await db().from('branches').select('slug').eq('id', rede!.branchId).single<{ slug: string }>()).data!.slug
  const ctx = await browser.newContext({ storageState: recepcao!.estado })
  try {
    const p = await ctx.newPage()
    await p.goto(`/${slug}/agenda?date=${hoje}`)
    await expect(p.locator(`[data-agendamento="${data!.id}"]`), 'o 1011º da janela está na grade').toHaveCount(1)
  } finally {
    await ctx.close()
  }
})
