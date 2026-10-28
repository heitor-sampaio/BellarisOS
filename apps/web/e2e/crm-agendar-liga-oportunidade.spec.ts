import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'

/**
 * Agendar uma cliente que tem oportunidade ABERTA (D11/A12, simulação de
 * 2026-10-27): o agendamento nasce COMMERCIAL (era só pelo card, e só para quem
 * é da rede — o SDR de unidade nunca contava) e o card vai para a etapa de
 * "agendado" do funil, achada pela MARCA (a etapa aqui se chama "Marcado").
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let sdr: MembroDeTeste | null = null
let recepcao: MembroDeTeste | null = null
let slug = ''
let etapas: { novo: string; marcado: string; ganho: string; perdido: string } | null = null

const diaDaquiA2 = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(Date.now() + 2 * 86_400_000))

async function como(browser: Browser, quem: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: quem.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

/** Uma cliente com uma oportunidade na etapa pedida. */
async function clienteComLead(rotulo: string, etapaId: string) {
  const clientId = await rede!.criarCliente(rotulo)
  const { data, error } = await db().from('leads').insert({
    tenant_id: rede!.tenantId, name: `${PREFIXO} ${rotulo} ${marca}`, phone: '5548' + String(Date.now()).slice(-9),
    crm_stage_id: etapaId, client_id: clientId,
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  return { clientId, leadId: data!.id }
}

const agendamentosDe = async (clientId: string) =>
  (await db().from('appointments').select('id, source').eq('client_id', clientId)).data ?? []
const etapaDe = async (leadId: string) =>
  (await db().from('leads').select('crm_stage_id').eq('id', leadId).single<{ crm_stage_id: string }>()).data?.crm_stage_id

async function agendarPelaAgenda(p: Page, clientId: string, dia: string, hora: string) {
  await p.goto(`/${slug}/agenda?novo=1&cliente=${clientId}`)
  const modal = p.locator('form').filter({ has: p.locator('select[name="procedure_id"]') }).first()
  await expect(modal.locator('select[name="procedure_id"] option')).not.toHaveCount(1)
  await modal.locator('select[name="procedure_id"]').selectOption({ index: 1 })
  await modal.locator('select[name="professional_id"]').selectOption(rede!.professionalId)
  await modal.locator('input[type="datetime-local"]').fill(`${dia}T${hora}`)
  await p.getByRole('button', { name: 'Confirmar agendamento' }).click()
  await expect.poll(async () => (await agendamentosDe(clientId)).length).toBe(1)
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`al${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  expect((await db().from('users').update({ provides_services: true, branch_id: rede.branchId }).eq('id', rede.professionalId)).error).toBeNull()
  const { data: funil } = await db().from('crm_funnels')
    .insert({ tenant_id: rede.tenantId, name: 'Funil e2e', is_default: true, position: 0 }).select('id').single<{ id: string }>()
  const { data: es, error } = await db().from('crm_stages').insert([
    { tenant_id: rede.tenantId, funnel_id: funil!.id, name: 'Novo', color: '#c34d6b', position: 0, outcome: 'OPEN' },
    { tenant_id: rede.tenantId, funnel_id: funil!.id, name: 'Marcado', color: '#2563b0', position: 1, outcome: 'OPEN', marca: 'AGENDADO' },
    { tenant_id: rede.tenantId, funnel_id: funil!.id, name: 'Fechado', color: '#3f9b6f', position: 2, outcome: 'WON' },
    { tenant_id: rede.tenantId, funnel_id: funil!.id, name: 'Perdido', color: '#9e9e9e', position: 3, outcome: 'LOST' },
  ]).select('id, name')
  expect(error).toBeNull()
  const id = (n: string) => es!.find(e => e.name === n)!.id as string
  etapas = { novo: id('Novo'), marcado: id('Marcado'), ganho: id('Fechado'), perdido: id('Perdido') }
  // O SDR é de UNIDADE: o `isComercial` antigo (ctx.branchId === null) o excluía.
  sdr = await criarMembro(`als${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'SDR',
    permissoes: [{ modulo: 'crm', nivel: 'MANAGE' }, { modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'VIEW' }],
  })
  recepcao = await criarMembro(`alr${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Recepção',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'MANAGE' }],
  })
})
test.afterAll(async () => {
  if (rede) {
    const { data } = await db().from('leads').select('id').eq('tenant_id', rede.tenantId)
    const ids = (data ?? []).map(l => l.id as string)
    if (ids.length) { await db().from('lead_events').delete().in('lead_id', ids); await db().from('leads').delete().in('id', ids) }
    await db().from('appointments').delete().eq('branch_id', rede.branchId)
    await db().from('contacts').delete().eq('tenant_id', rede.tenantId)
  }
  await sdr?.limpar(); await recepcao?.limpar(); await rede?.limpar()
})

test.describe.serial('agendar a cliente que tem oportunidade aberta', () => {
  test('pelo card, o SDR de UNIDADE agenda como comercial e o card vai para a etapa marcada', async ({ browser }) => {
    const { clientId, leadId } = await clienteComLead('Pelo card', etapas!.novo)
    await como(browser, sdr!, async p => {
      await p.goto(`/${slug}/oportunidades`)
      const r = await chamarAcao(p, 'actions/crm-scheduling.ts', 'createCrmAppointment', `/${slug}/inbox`, [{
        leadId, branchId: rede!.branchId, professionalId: rede!.professionalId, procedureId: rede!.procedureId,
        scheduledAt: new Date(`${diaDaquiA2()}T10:00:00-03:00`).toISOString(),
      }])
      expect(r.texto.slice(0, 400)).not.toMatch(/{"error"/)
    })
    expect((await agendamentosDe(clientId)).map(a => a.source)).toEqual(['COMMERCIAL'])
    await expect.poll(() => etapaDe(leadId)).toBe(etapas!.marcado)
    const { data: eventos } = await db().from('lead_events').select('type').eq('lead_id', leadId).eq('type', 'APPOINTMENT_CREATED')
    expect(eventos).toHaveLength(1)
  })

  test('pela agenda, a recepção agenda a cliente com oportunidade aberta: COMMERCIAL e o card anda', async ({ browser }) => {
    const { clientId, leadId } = await clienteComLead('Pela agenda', etapas!.novo)
    await como(browser, recepcao!, p => agendarPelaAgenda(p, clientId, diaDaquiA2(), '11:00'))
    expect((await agendamentosDe(clientId)).map(a => a.source)).toEqual(['COMMERCIAL'])
    await expect.poll(() => etapaDe(leadId)).toBe(etapas!.marcado)
  })

  test('sem oportunidade aberta nada muda: INTERNAL, e card perdido ou ganho fica onde está', async ({ browser }) => {
    const sem = await rede!.criarCliente('Sem lead')
    const perdida = await clienteComLead('Perdida', etapas!.perdido)
    const ganha = await clienteComLead('Ganha', etapas!.ganho)
    await como(browser, recepcao!, async p => {
      await agendarPelaAgenda(p, sem, diaDaquiA2(), '14:00')
      await agendarPelaAgenda(p, perdida.clientId, diaDaquiA2(), '15:00')
      await agendarPelaAgenda(p, ganha.clientId, diaDaquiA2(), '16:00')
    })
    for (const c of [sem, perdida.clientId, ganha.clientId]) expect((await agendamentosDe(c)).map(a => a.source)).toEqual(['INTERNAL'])
    expect(await etapaDe(perdida.leadId)).toBe(etapas!.perdido)
    expect(await etapaDe(ganha.leadId)).toBe(etapas!.ganho)
  })
})
