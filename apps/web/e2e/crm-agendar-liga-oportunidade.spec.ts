import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'

/**
 * Agendar uma cliente que tem oportunidade ABERTA (D11/A12, simulação de
 * 2026-10-27): o agendamento nasce COMMERCIAL (era só pelo card, e só para quem
 * é da rede — o SDR de unidade nunca contava) e a linha do tempo do card diz
 * que houve o agendamento.
 *
 * O CARD NÃO ANDA SOZINHO (crm-05, revisão do Heitor de 2026-11-02: "não existe
 * movimento automático padrão nos funis; caso queiram, podem fazer isso através
 * do módulo de automações com as regras que quiserem"). Até ali ele ia para a
 * etapa marcada "agendado" (aqui, "Marcado"); agora fica onde está, e a clínica
 * que quiser o movimento monta a automação "Agendamento criado → Mover de
 * etapa" — o último teste prova que ela funciona pela agenda, sem o card.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let sdr: MembroDeTeste | null = null
let recepcao: MembroDeTeste | null = null
let slug = ''
let etapas: { novo: string; marcado: string; ganho: string; perdido: string } | null = null
let salaCorporal = ''
const automacoes: string[] = []

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
  // A sala do D12 nasce ANTES de qualquer janela abrir: as salas da unidade
  // ficam 10 min em cache (`rooms:<rede>`), e o insert pelo banco não o
  // expira — criada no meio do arquivo, a janela não a via e não esperava.
  const { data: s, error: eS } = await db().from('rooms').insert({ branch_id: rede.branchId, name: `Corporal ${marca}` })
    .select('id').single<{ id: string }>()
  expect(eS).toBeNull()
  salaCorporal = s!.id
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
  for (const id of automacoes) {
    const { data: runs } = await db().from('automation_runs').select('id').eq('automation_id', id)
    for (const r of runs ?? []) await db().from('automation_run_steps').delete().eq('run_id', r.id as string)
    await db().from('automation_runs').delete().eq('automation_id', id)
    await db().from('automations').delete().eq('id', id)
  }
  if (rede) {
    await db().from('domain_events').delete().eq('tenant_id', rede.tenantId)
    const { data } = await db().from('leads').select('id').eq('tenant_id', rede.tenantId)
    const ids = (data ?? []).map(l => l.id as string)
    if (ids.length) { await db().from('lead_events').delete().in('lead_id', ids); await db().from('leads').delete().in('id', ids) }
    await db().from('appointments').delete().eq('branch_id', rede.branchId)
    await db().from('contacts').delete().eq('tenant_id', rede.tenantId)
  }
  await sdr?.limpar(); await recepcao?.limpar(); await rede?.limpar()
})

test.describe.serial('agendar a cliente que tem oportunidade aberta', () => {
  test('pelo card, o SDR de UNIDADE agenda como comercial, e o card fica onde está (crm-05)', async ({ browser }) => {
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
    // A linha do tempo do card é escrita depois da resposta (`after()`, A33): espera.
    await expect.poll(async () => (await db().from('lead_events').select('type').eq('lead_id', leadId).eq('type', 'APPOINTMENT_CREATED')).data?.length)
      .toBe(1)
    expect(await etapaDe(leadId), 'crm-05: nenhum movimento automático padrão').toBe(etapas!.novo)
    expect((await db().from('lead_events').select('type').eq('lead_id', leadId).eq('type', 'STAGE_CHANGED')).data ?? []).toHaveLength(0)
  })

  test('pela agenda, a recepção agenda a cliente com oportunidade aberta: COMMERCIAL, e o card fica onde está', async ({ browser }) => {
    const { clientId, leadId } = await clienteComLead('Pela agenda', etapas!.novo)
    await como(browser, recepcao!, p => agendarPelaAgenda(p, clientId, diaDaquiA2(), '11:00'))
    expect((await agendamentosDe(clientId)).map(a => a.source)).toEqual(['COMMERCIAL'])
    await expect.poll(async () => (await db().from('lead_events').select('type').eq('lead_id', leadId).eq('type', 'APPOINTMENT_CREATED')).data?.length)
      .toBe(1)
    expect(await etapaDe(leadId), 'crm-05: nenhum movimento automático padrão').toBe(etapas!.novo)
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

  test('quem quer o movimento monta a automação: "Agendamento criado → Mover de etapa" leva o card, pela agenda', async ({ browser }) => {
    const { data: auto, error } = await db().from('automations').insert({
      tenant_id: rede!.tenantId, nome: `${PREFIXO} Agendou, marcado ${marca}`, status: 'ATIVA', gatilhos: ['agendamento.criado'],
      grafo: {
        nos: [
          { id: 'g', tipo: 'gatilho.evento', nome: 'Agendamento criado', pos: { x: 0, y: 0 }, config: { evento: 'agendamento.criado' } },
          { id: 'm', tipo: 'acao.mover_etapa', nome: 'Para Marcado', pos: { x: 280, y: 0 }, config: { etapaId: etapas!.marcado } },
        ],
        ligacoes: [{ id: 'l1', de: 'g', para: 'm' }],
      },
    }).select('id').single<{ id: string }>()
    expect(error).toBeNull()
    automacoes.push(auto!.id)

    const { clientId, leadId } = await clienteComLead('Pela automação', etapas!.novo)
    // A recepção agenda pela AGENDA: o fato não sabe de card nenhum — a
    // automação acha a oportunidade aberta da cliente.
    await como(browser, recepcao!, p => agendarPelaAgenda(p, clientId, diaDaquiA2(), '17:00'))
    await expect.poll(() => etapaDe(leadId), { timeout: 20_000 }).toBe(etapas!.marcado)
    // A linha do tempo é escrita DEPOIS do update da etapa (moverDeEtapa,
    // lib/automacoes/acoes-crm.ts): ler logo depois de ver a etapa pegava a
    // janela entre os dois — o "[]" da completa de 03/11 à tarde. Espera.
    await expect.poll(async () => (await db().from('lead_events').select('actor_name, to_stage_id').eq('lead_id', leadId).eq('type', 'STAGE_CHANGED')).data,
      { timeout: 20_000 }).toEqual([{ actor_name: expect.stringMatching(/^Automação · /), to_stage_id: etapas!.marcado }])
  })

  test('o fato da agenda que só conhece a cliente também acha o card: "Agendamento confirmado → Mover de etapa"', async ({ browser }) => {
    const { data: auto, error } = await db().from('automations').insert({
      tenant_id: rede!.tenantId, nome: `${PREFIXO} Confirmou, marcado ${marca}`, status: 'ATIVA', gatilhos: ['agendamento.confirmado'],
      grafo: {
        nos: [
          { id: 'g', tipo: 'gatilho.evento', nome: 'Agendamento confirmado', pos: { x: 0, y: 0 }, config: { evento: 'agendamento.confirmado' } },
          { id: 'm', tipo: 'acao.mover_etapa', nome: 'Para Marcado', pos: { x: 280, y: 0 }, config: { etapaId: etapas!.marcado } },
        ],
        ligacoes: [{ id: 'l1', de: 'g', para: 'm' }],
      },
    }).select('id').single<{ id: string }>()
    expect(error).toBeNull()
    automacoes.push(auto!.id)

    const { clientId, leadId } = await clienteComLead('Confirmou', etapas!.novo)
    // O agendamento entra direto no banco (sem evento de criado): o fato que
    // dispara é o "confirmado", que carrega só a cliente.
    const { data: ag, error: e2 } = await db().from('appointments').insert({
      branch_id: rede!.branchId, client_id: clientId, procedure_id: rede!.procedureId, professional_id: rede!.professionalId,
      scheduled_at: new Date(`${diaDaquiA2()}T18:00:00-03:00`).toISOString(), duration_min: 60, price: 0, status: 'SCHEDULED',
    }).select('id').single<{ id: string }>()
    expect(e2).toBeNull()
    await como(browser, recepcao!, async p => {
      await p.goto(`/${slug}/agenda`)
      const r = await chamarAcao(p, 'actions/appointments.ts', 'updateAppointmentStatus', `/${slug}/agenda`, [ag!.id, 'CONFIRMED', slug])
      expect(r.texto.slice(0, 400)).not.toMatch(/"error"/)
    })
    await expect.poll(() => etapaDe(leadId), { timeout: 20_000 }).toBe(etapas!.marcado)
  })
})

test('A16: a oportunidade tem "Agendar" — o SDR agenda pelo card aberto no quadro, e a ficha nasce ligada ao card', async ({ browser }) => {
  test.setTimeout(180_000)
  // A Pri não tinha onde agendar a Alice a partir do card do quadro (só pelo
  // inbox): a recepção cadastrou e agendou à parte, e o card nunca soube.
  const fone = `(48) 9${String(Date.now()).slice(-4)}-0016`
  const nome = `${PREFIXO} Alice do quadro ${marca}`
  const { data: lead, error } = await db().from('leads').insert({
    tenant_id: rede!.tenantId, name: nome, phone: fone, crm_stage_id: etapas!.novo,
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  const { diaEmQueAUnidadeAbre } = await import('./apoio/datas')
  const dia = diaEmQueAUnidadeAbre(3)

  await como(browser, sdr!, async p => {
    await p.goto(`/${slug}/oportunidades?lead=${lead!.id}`)
    const card = p.getByRole('dialog').filter({ hasText: 'Editar lead' })
    await expect(card).toBeVisible()
    const agendar = card.getByRole('button', { name: 'Agendar', exact: true })
    await expect(agendar).toBeVisible()
    await agendar.click()
    const janela = p.getByRole('dialog').filter({ hasText: 'Novo agendamento' })
    await expect(janela).toBeVisible()
    await expect(janela.getByPlaceholder('Nome')).toHaveValue(nome)
    await janela.getByLabel('Procedimento').selectOption(rede!.procedureId)
    await janela.getByLabel('Profissional').selectOption(rede!.professionalId)
    await janela.getByLabel('Dia').fill(dia)
    await janela.getByRole('button', { name: '10:00', exact: true }).click()
    await janela.getByRole('button', { name: 'Agendar', exact: true }).click()
    await expect(janela).toBeHidden({ timeout: 15_000 })
  })
  const { data: ligado } = await db().from('leads').select('client_id').eq('id', lead!.id).single<{ client_id: string | null }>()
  expect(ligado?.client_id, 'a ficha nasce ligada ao card').toBeTruthy()
  expect((await agendamentosDe(ligado!.client_id!)).map(a => a.source)).toEqual(['COMMERCIAL'])
  await expect.poll(async () => (await db().from('lead_events').select('type').eq('lead_id', lead!.id).eq('type', 'APPOINTMENT_CREATED')).data?.length)
    .toBe(1)
})

// D12 da 7ª simulação: no "Agendar" do card, a sala Corporal apareceu
// escolhida e os agendamentos gravaram room_id nulo. A sala sugerida chega do
// servidor (`salasParaAgendarNoCrm`) DEPOIS de escolher o horário: quem
// clicava "Agendar" antes dela gravava sem sala — e a tela, logo depois,
// mostrava a Corporal escolhida. O que a tela mostra é o que grava: o
// "Agendar" espera a lista das salas.
test('D12: a sala sugerida que aparece na janela é a que grava, mesmo com a lista das salas demorando', async ({ browser }) => {
  test.setTimeout(180_000)
  const sala = { id: salaCorporal }
  expect((await db().from('procedure_rooms').insert({ procedure_id: rede!.procedureId, room_id: sala.id, tenant_id: rede!.tenantId })).error).toBeNull()
  const nome = `${PREFIXO} Lead sala ${marca}`
  const { data: lead } = await db().from('leads').insert({
    tenant_id: rede!.tenantId, name: nome, phone: `(48) 9${String(Date.now()).slice(-4)}-0012`, crm_stage_id: etapas!.novo,
  }).select('id').single<{ id: string }>()
  const { diaEmQueAUnidadeAbre } = await import('./apoio/datas')
  const dia = diaEmQueAUnidadeAbre(4)
  try {
    await como(browser, sdr!, async p => {
      // A lista das salas do horário demora (a action recebe a unidade, o procedimento e o horário).
      await p.route('**/*', async rota => {
        const req = rota.request()
        const corpo = req.method() === 'POST' && req.headers()['next-action'] ? (req.postData() ?? '') : ''
        if (corpo.includes(rede!.procedureId) && corpo.includes(`${dia}T`) && !corpo.includes('leadId')) {
          await new Promise(r => setTimeout(r, 4000))
        }
        await rota.continue()
      })
      await p.goto(`/${slug}/oportunidades?lead=${lead!.id}`)
      const card = p.getByRole('dialog').filter({ hasText: 'Editar lead' })
      await card.getByRole('button', { name: 'Agendar', exact: true }).click()
      const janela = p.getByRole('dialog').filter({ hasText: 'Novo agendamento' })
      await janela.getByLabel('Procedimento').selectOption(rede!.procedureId)
      await janela.getByLabel('Profissional').selectOption(rede!.professionalId)
      await janela.getByLabel('Dia').fill(dia)
      await janela.getByRole('button', { name: '11:00', exact: true }).click()
      await janela.getByRole('button', { name: 'Agendar', exact: true }).click()
      await expect(janela).toBeHidden({ timeout: 20_000 })
    })
    const { data: ligado } = await db().from('leads').select('client_id').eq('id', lead!.id).single<{ client_id: string }>()
    const { data: ags } = await db().from('appointments').select('room_id').eq('client_id', ligado!.client_id)
    expect((ags ?? []).map(a => a.room_id), 'gravou a sala que a janela sugeriu').toEqual([sala.id])
  } finally {
    await db().from('procedure_rooms').delete().eq('room_id', sala.id)
  }
})
