import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'
import { diaEmQueAUnidadeAbre } from './apoio/datas'

/**
 * Atritos do conflito de horário (5ª simulação):
 * - A31: o atendimento concluído ADIANTADO continuava ocupando o horário da
 *   profissional e a sala (a Bianca concluiu às 10:53 o das 12:00, e o das
 *   12:00 seguiu ocupado). O concluído ocupa só até a conclusão.
 * - A30: o conflito do Paulo entre as unidades era recusado, mas a mensagem
 *   não dizia que o outro atendimento era da Moinhos — e a gerente da Zona
 *   Sul não vê aquela agenda.
 */

const marca = `cf${Date.now().toString(36)}`
const db = () => banco()
let rede: OutraRede | null = null
let unidadeB = ''
let slugB = ''
let nomeA = ''
let recepcaoB: MembroDeTeste | null = null
const DIA = diaEmQueAUnidadeAbre(2)
const em = (h: string) => new Date(`${DIA}T${h}:00-03:00`).toISOString()

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: recepcaoB!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

function devolvido(texto: string): unknown {
  for (const l of texto.split(/\r?\n/).filter(x => x.startsWith('1:'))) {
    try { return JSON.parse(l.slice(2)) } catch { /* linha de depuração */ }
  }
  return undefined
}

test.beforeAll(async () => {
  rede = await criarOutraRede(marca)
  nomeA = (await db().from('branches').select('name').eq('id', rede.branchId).single<{ name: string }>()).data!.name
  const { data: b, error } = await db().from('branches')
    .insert({ tenant_id: rede.tenantId, name: `${PREFIXO} Zona Sul ${marca}`, slug: `e2e-zs-${marca}` })
    .select('id, slug').single<{ id: string; slug: string }>()
  expect(error).toBeNull()
  unidadeB = b!.id; slugB = b!.slug
  // O Paulo é da REDE: atende nas duas.
  expect((await db().from('users').update({ provides_services: true, branch_id: null }).eq('id', rede.professionalId)).error).toBeNull()
  recepcaoB = await criarMembro(`r${marca}`, {
    tenant: rede.tenantId, branchId: unidadeB, rotulo: 'Recepção ZS',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE', escopo: 'ALL' }, { modulo: 'clients', nivel: 'VIEW' }],
  })
  const cliente = await rede.criarCliente('Conflito')
  // Na Moinhos (A): um às 15:00 em aberto, e um às 12:00 concluído às 10:53.
  const { error: e1 } = await db().from('appointments').insert([
    { branch_id: rede.branchId, client_id: cliente, procedure_id: rede.procedureId, professional_id: rede.professionalId,
      status: 'SCHEDULED', source: 'INTERNAL', duration_min: 60, price: 0, scheduled_at: em('15:00') },
    { branch_id: rede.branchId, client_id: cliente, procedure_id: rede.procedureId, professional_id: rede.professionalId,
      status: 'COMPLETED', source: 'INTERNAL', duration_min: 60, price: 0, scheduled_at: em('12:00'),
      started_at: em('10:30'), completed_at: em('10:53') },
  ])
  expect(e1).toBeNull()
})

test.afterAll(async () => {
  if (rede) {
    const ids = ((await db().from('appointments').select('id').in('branch_id', [rede.branchId, unidadeB])).data ?? []).map(a => a.id)
    if (ids.length) {
      await db().from('domain_events').delete().in('entidade_id', ids)
      await db().from('appointment_history').delete().in('appointment_id', ids)
      await db().from('appointments').delete().in('id', ids)
    }
  }
  await recepcaoB?.limpar()
  if (unidadeB) await db().from('branches').delete().eq('id', unidadeB)
  await rede?.limpar()
})

test('A31: o concluído adiantado libera o resto do horário; A30: o conflito diz a outra unidade', async ({ browser }) => {
  await como(browser, async p => {
    await p.goto(`/${slugB}/agenda?date=${DIA}`)
    const avisos = async (h: string) => devolvido((await chamarAcao(p, 'actions/appointments.ts', 'avisosDoHorario', `/${slugB}/agenda`,
      [unidadeB, rede!.professionalId, em(h), rede!.procedureId, 30])).texto) as { conflito: string | null }

    // 12:00: o das 12:00 da Moinhos foi concluído às 10:53 — não ocupa mais.
    expect((await avisos('12:00')).conflito).toBeNull()
    // 15:00: o da Moinhos está em aberto — e o aviso diz onde.
    expect((await avisos('15:00')).conflito).toContain(nomeA)
  })
})
