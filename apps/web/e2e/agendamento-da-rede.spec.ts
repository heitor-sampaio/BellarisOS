import { test, expect } from '@playwright/test'
import { banco, tenantId, filiaisAtivas, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'
import { apagarAgendamentos, apagarClientes } from './apoio/limpeza'

/**
 * O agendamento só nasce com peças DA REDE — e na unidade de quem agenda.
 *
 * `createAppointmentCore` (agenda e comercial) conferia só o procedimento. A
 * unidade, o profissional, a sala e o cliente vinham do navegador sem
 * conferência: com os de outra clínica, o agendamento nascia na agenda DELA.
 * E quem tem unidade fixa agendava em qualquer outra da rede.
 *
 * Chamado direto (`createCrmAppointment` recebe JSON), com o admin como
 * controle: a mesma chamada com as peças certas grava.
 */

const marca = Date.now().toString(36)
const db = () => banco()

interface Fx {
  unidade: string; segunda: string | null
  prof: MembroDeTeste; procedimento: string; sala: string; salaAlheia: string
  outra: OutraRede; clienteAlheio: string; lead: string
  comercialDaUnidade: MembroDeTeste
}
let f: Fx | null = null
const criados: string[] = []

const em = (dias: number, hora: number) => {
  const d = new Date(Date.now() + dias * 86_400_000)
  d.setUTCHours(hora + 3, 0, 0, 0) // hora cheia em São Paulo
  return d.toISOString()
}

test.beforeAll(async () => {
  const b = db()
  const tenant = await tenantId()
  const [unidade, segunda] = await filiaisAtivas()
  const ins = async (tabela: string, linha: Record<string, unknown>) => {
    const { data, error } = await b.from(tabela).insert(linha).select('id').single<{ id: string }>()
    expect(error, `criar ${tabela}`).toBeNull()
    return data!.id
  }
  const prof = await criarMembro(`agprof${marca}`, { rotulo: 'Profissional ag', permissoes: [], branchId: unidade!.id })
  await b.from('users').update({ provides_services: true }).eq('id', prof.userId)
  const outra = await criarOutraRede(`ag${marca}`)
  const clienteAlheio = await outra.criarCliente(`Alheio ${marca}`)
  const etapa = (await b.from('crm_stages').select('id').eq('tenant_id', tenant).eq('outcome', 'OPEN').limit(1).single<{ id: string }>()).data!.id
  f = {
    unidade: unidade!.id, segunda: segunda?.id ?? null, prof,
    procedimento: await ins('procedures', { tenant_id: tenant, name: `${PREFIXO} Proc ag ${marca}`, category: 'e2e', duration_min: 30, price: 80, is_active: true }),
    sala:       await ins('rooms', { branch_id: unidade!.id, name: `${PREFIXO} Sala ${marca}` }),
    salaAlheia: await ins('rooms', { branch_id: outra.branchId, name: `${PREFIXO} Sala alheia ${marca}` }),
    outra, clienteAlheio,
    // Oportunidade DA REDE, mas com o cliente de outra clínica plantado nela:
    // é por ela que o cliente chega ao núcleo no fluxo do comercial.
    lead: await ins('leads', { tenant_id: tenant, name: `${PREFIXO} Lead ag ${marca}`, phone: '5548933330001', crm_stage_id: etapa, client_id: clienteAlheio }),
    comercialDaUnidade: await criarMembro(`agcom${marca}`, { rotulo: 'Comercial da unidade', permissoes: [{ modulo: 'crm', nivel: 'MANAGE' }], branchId: unidade!.id }),
  }
})

test.afterAll(async () => {
  if (!f) return
  const b = db()
  const { data: ags } = await b.from('appointments').select('id, client_id').eq('procedure_id', f.procedimento)
  const falhas = await apagarAgendamentos((ags ?? []).map(a => a.id as string))
  const { data: l } = await b.from('leads').select('contato_id').eq('id', f.lead).maybeSingle()
  await b.from('lead_events').delete().eq('lead_id', f.lead)
  await b.from('leads').delete().eq('id', f.lead)
  if (l?.contato_id) await b.from('contacts').delete().eq('id', l.contato_id)
  await apagarClientes(criados, falhas)
  await b.from('rooms').delete().in('id', [f.sala, f.salaAlheia])
  await b.from('procedures').delete().eq('id', f.procedimento)
  await f.outra.limpar()
  for (const m of [f.prof, f.comercialDaUnidade]) {
    await b.from('domain_events').delete().eq('entidade_id', m.userId)
    await m.limpar()
  }
  expect(falhas).toEqual([])
})

test('cada peça de outra rede é recusada; as da rede agendam', async ({ page, browser }) => {
  let hora = 9
  const pedir = (p: import('@playwright/test').Page, sobre: Record<string, unknown>) =>
    chamarAcao(p, 'actions/crm-scheduling.ts', 'createCrmAppointment', '/admin/inbox', [{
      leadId: '', branchId: f!.unidade, professionalId: f!.prof.userId, procedureId: f!.procedimento,
      scheduledAt: em(60, hora++), roomId: f!.sala,
      contato: { nome: `${PREFIXO} Cliente ag ${marca}`, telefone: '5548933330002' }, ...sobre,
    }])
  const agendamentos = async () =>
    (await db().from('appointments').select('id, branch_id, client_id').eq('procedure_id', f!.procedimento)).data ?? []

  // Recusas — nenhuma cria nada, em lugar nenhum.
  const casos: [string, Record<string, unknown>][] = [
    ['unidade de outra rede', { branchId: f!.outra.branchId, roomId: null }],
    ['profissional de outra rede', { professionalId: f!.outra.professionalId }],
    ['sala de outra unidade', { roomId: f!.salaAlheia }],
    ['cliente de outra rede (pela oportunidade)', { leadId: f!.lead, contato: null }],
  ]
  for (const [nome, sobre] of casos) {
    await pedir(page, sobre)
    expect.soft(await agendamentos(), `${nome}: não agenda`).toHaveLength(0)
  }

  // Quem tem unidade FIXA não agenda em outra unidade da rede.
  if (f!.segunda) {
    const ctx = await browser.newContext({ storageState: f!.comercialDaUnidade.estado })
    try {
      await pedir(await ctx.newPage(), { branchId: f!.segunda, roomId: null })
    } finally {
      await ctx.close()
    }
    expect.soft(await agendamentos(), 'unidade fixa agendando na outra').toHaveLength(0)
  }

  // Controle: tudo da rede, pelo admin — agenda.
  await pedir(page, {})
  await expect.poll(async () => (await agendamentos()).length, { message: 'as peças da rede agendam' }).toBe(1)
  const [ag] = await agendamentos()
  expect(ag!.branch_id).toBe(f!.unidade)
  criados.push(ag!.client_id as string)
})
