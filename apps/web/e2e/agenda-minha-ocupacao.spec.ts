import { test, expect } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * D11 da simulação de 2026-10-29: na "Minha agenda" da Camila, "Ocupação hoje
 * 32%" (155 min) — a tela dividia por um dia FIXO de 8 h. Sobre o horário
 * dela (18:00–23:30, 330 min) são 47%. A conta é a de lib/metrics, a mesma da
 * agenda da unidade: minutos agendados ÷ a capacidade do horário (unidade ∩
 * profissional), sem cancelados nem faltas (CLAUDE.md §13.1).
 * Numa rede [e2e] própria.
 */
const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let slug = ''
let profissional: MembroDeTeste | null = null
let cliente = ''
const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
const todoDia = (de: string, ate: string) => ({ dias: Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(d => [d, [{ de, ate }]])) })

async function agendar(hhmm: string, min: number, status = 'SCHEDULED') {
  const { error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: cliente, procedure_id: rede!.procedureId, professional_id: profissional!.userId,
    scheduled_at: new Date(`${hoje}T${hhmm}:00-03:00`).toISOString(), duration_min: min, price: 0, status, source: 'INTERNAL',
    ...(status === 'CANCELLED' ? { cancellation_reason: 'teste', cancelled_at: new Date().toISOString() } : {}),
  })
  expect(error, `agendar ${hhmm}`).toBeNull()
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`mo${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  expect((await db().from('branches').update({ horario: todoDia('08:00', '23:30') }).eq('id', rede.branchId)).error).toBeNull()
  profissional = await criarMembro(`mop${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Profissional',
    permissoes: [{ modulo: 'agenda', nivel: 'VIEW', escopo: 'OWN' }],
  })
  // Ela atende das 18:00 às 23:30, todo dia.
  expect((await db().from('users').update({ provides_services: true, horario: todoDia('18:00', '23:30') })
    .eq('id', profissional.userId)).error).toBeNull()
  cliente = await rede.criarCliente('Ocupação')
  await agendar('18:00', 90)
  await agendar('20:00', 65)
  // O cancelado não ocupa a agenda.
  await agendar('22:00', 60, 'CANCELLED')
})
test.afterAll(async () => {
  if (rede) await db().from('appointments').delete().eq('branch_id', rede.branchId)
  await profissional?.limpar(); await rede?.limpar()
})

test('Minha agenda: a ocupação de hoje é sobre o horário dela (155 de 330 min = 47%), não um dia fixo de 8 h', async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: profissional!.estado })
  try {
    const p = await ctx.newPage()
    await p.goto(`/${slug}/agenda`)
    const cartao = p.locator('.card').filter({ hasText: 'Ocupação hoje' })
    await expect(cartao).toContainText('47%')
  } finally { await ctx.close() }
})
