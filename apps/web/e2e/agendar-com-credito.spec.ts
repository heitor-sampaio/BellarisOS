import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO, apagarConversas } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'

/**
 * Agendar usando o que o cliente já pagou (fase 3 de "Vender", 2026-09-30):
 * a unidade de procedimento pré-pago e a sessão de pacote viram "crédito" do
 * agendamento, pelo núcleo (`createAppointmentCore`): o crédito decide o
 * procedimento e o preço e fica ligado ao agendamento — é por essa ligação
 * que a conclusão o usa e a recepção não cobra.
 *
 * Pela ficha (card "Procedimentos pagos"), pela agenda ("Já pago") e pelo
 * inbox (`createCrmAppointment`). Numa rede [e2e] própria.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let gestor: MembroDeTeste | null = null
const conversas: string[] = []
let pacoteId = ''

test.beforeAll(async () => {
  rede = await criarOutraRede(`ac${marca}`)
  await db().from('procedures').update({ price: 300 }).eq('id', rede.procedureId)
  // Os seletores de horário listam quem atende NA unidade.
  await db().from('users').update({ provides_services: true, branch_id: rede.branchId }).eq('id', rede.professionalId)
  const { data: pac, error } = await db().rpc('pacote_salvar', {
    p_tenant: rede.tenantId, p_id: null, p_nome: `${PREFIXO} Pacote ${marca}`, p_preco: 500, p_validade: null, p_ativo: true,
    p_itens: [{ procedure_id: rede.procedureId, quantity: 2 }],
  })
  expect(error, 'criar o pacote').toBeNull()
  pacoteId = pac as string
  gestor = await criarMembro(`acg${marca}`, {
    tenant: rede.tenantId, rotulo: 'Recepção',
    permissoes: [
      { modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'crm', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'MANAGE' },
      { modulo: 'cashier', nivel: 'MANAGE' }, { modulo: 'procedures', nivel: 'VIEW' },
    ],
  })
})

test.afterAll(async () => {
  await apagarConversas(conversas)
  if (rede) {
    const b = db()
    const { data: cps } = await b.from('client_packages').select('id').eq('branch_id', rede.branchId)
    const ids = (cps ?? []).map(c => c.id as string)
    if (ids.length) {
      await b.from('package_sessions').delete().in('client_package_id', ids)
      await b.from('financial_transactions').update({ client_package_id: null }).in('client_package_id', ids)
      await b.from('client_packages').delete().in('id', ids)
    }
    await b.from('service_packages').delete().eq('tenant_id', rede.tenantId)
    if (gestor) await gestor.limpar()
    await rede.limpar()
  }
})

async function comSessao<T>(browser: Browser, fn: (p: Page) => Promise<T>) {
  const ctx = await browser.newContext({ storageState: gestor!.estado })
  try { return await fn(await ctx.newPage()) } finally { await ctx.close() }
}

/** Um pré-pago de N unidades a R$ 270 (já pago). Devolve os ids das unidades. */
async function prePago(cliente: string, qtd: number) {
  const { data: v, error } = await db().rpc('procedimento_vender', {
    p_tenant: rede!.tenantId, p_cliente: cliente, p_procedimento: rede!.procedureId, p_unidade: rede!.branchId,
    p_ator: null, p_quantidade: qtd, p_desconto: 30 * qtd, p_validade_dias: null,
    p_lancamentos: [{ amount: 270 * qtd, payment_method: 'PIX', is_paid: true }],
    p_unidades: Array.from({ length: qtd }, () => ({ preco: 270 })),
  })
  expect(error, 'vender o pré-pago').toBeNull()
  const { data: us } = await db().from('procedure_sale_units').select('id').eq('sale_id', v as string).order('numero')
  return (us ?? []).map(u => u.id as string)
}

/** Um horário livre amanhã, às `hora` de Brasília. */
function amanha(hora: string) {
  const d = new Date(Date.now() + 86_400_000).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  return { dia: d, iso: new Date(`${d}T${hora}:00-03:00`).toISOString() }
}

async function conversaDo(cliente: string) {
  const { data, error } = await db().from('conversations').insert({
    tenant_id: rede!.tenantId, status: 'open', channel: 'whatsapp', provider: 'uazapi', client_id: cliente,
    last_message_at: new Date().toISOString(), last_message: 'oi', contact_name: `${PREFIXO} Conversa ${marca}`,
    contact_phone: '55489' + String(Date.now()).slice(-8),
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  conversas.push(data!.id)
  return data!.id
}

const agendamento = async (id: string) =>
  (await db().from('appointments').select('procedure_id, price, status, created_by_id').eq('id', id).single()).data

test.describe.serial('agendar com crédito', () => {
  test('pela ficha: "Agendar" na unidade pré-paga liga a unidade, com o preço dela', async ({ browser }) => {
    const cliente = await rede!.criarCliente('Ficha')
    const [u1] = await prePago(cliente, 2)
    const { dia } = amanha('10:00')
    await comSessao(browser, async p => {
      await p.goto(`/admin/clients/${cliente}`)
      const card = p.locator('[data-procedimentos-pagos]')
      await card.getByRole('button', { name: 'Agendar', exact: true }).first().click()
      await card.locator('select').first().selectOption(rede!.professionalId)
      await card.locator('input[type="date"]').fill(dia)
      await card.getByRole('button', { name: '10:00', exact: true }).click()
      await card.getByRole('button', { name: 'Confirmar agendamento' }).click()
      await expect(card).toContainText('Agendada para', { timeout: 15_000 })
    })
    const { data: u } = await db().from('procedure_sale_units').select('appointment_id, status').eq('id', u1!).single()
    expect(u!.status).toBe('DISPONIVEL')
    expect(u!.appointment_id, 'a unidade ficou ligada').toBeTruthy()
    const ap = await agendamento(u!.appointment_id as string)
    expect({ proc: ap!.procedure_id, preco: Number(ap!.price), status: ap!.status, por: ap!.created_by_id })
      .toEqual({ proc: rede!.procedureId, preco: 270, status: 'SCHEDULED', por: gestor!.userId })
  })

  test('depois de vender: "Agendar agora" já agenda a primeira unidade', async ({ browser }) => {
    const cliente = await rede!.criarCliente('Agora')
    const { dia } = amanha('09:00')
    await comSessao(browser, async p => {
      await p.goto(`/admin/clients/${cliente}`)
      await p.getByRole('button', { name: 'Vender', exact: true }).click()
      const dlg = p.getByRole('dialog', { name: 'Vender' })
      await dlg.getByRole('button', { name: 'Procedimento', exact: true }).click()
      await dlg.getByLabel('Procedimento', { exact: true }).selectOption(rede!.procedureId)
      await dlg.getByRole('button', { name: /^Vender por/ }).click()
      const agora = dlg.locator('[data-agendar-agora]')
      await expect(agora).toBeVisible({ timeout: 15_000 })
      await agora.locator('select').first().selectOption(rede!.professionalId)
      await agora.locator('input[type="date"]').fill(dia)
      await agora.getByRole('button', { name: '09:00', exact: true }).click()
      await agora.getByRole('button', { name: 'Confirmar agendamento' }).click()
      await expect(dlg).toBeHidden({ timeout: 15_000 })
    })
    const { data: v } = await db().from('procedure_sales').select('id').eq('client_id', cliente).single()
    const { data: u } = await db().from('procedure_sale_units').select('appointment_id').eq('sale_id', v!.id).single()
    expect(u!.appointment_id, 'a unidade vendida já está agendada').toBeTruthy()
  })

  test('pela agenda: "Já pago" no modal fixa o procedimento e liga a unidade', async ({ browser }) => {
    const cliente = await rede!.criarCliente('Agenda')
    const [u1] = await prePago(cliente, 1)
    const { dia } = amanha('11:00')
    await comSessao(browser, async p => {
      await p.goto('/admin/agenda')
      await p.getByRole('button', { name: 'Agendar', exact: true }).click()
      const { data: c } = await db().from('clients').select('name').eq('id', cliente).single()
      await p.getByPlaceholder('Buscar cliente por nome ou telefone…').fill(String(c!.name).replace(PREFIXO, '').trim())
      await p.getByText(String(c!.name)).first().click()
      await p.getByLabel('Usar o que já foi pago').selectOption({ index: 1 })
      await expect(p.locator('[data-credito-escolhido]')).toBeVisible()
      await p.locator('select[name="professional_id"]').selectOption(rede!.professionalId)
      await p.locator('input[type="datetime-local"]').fill(`${dia}T11:00`)
      await p.getByRole('button', { name: 'Confirmar agendamento' }).click()
      await expect.poll(async () => (await db().from('procedure_sale_units').select('appointment_id').eq('id', u1!).single()).data?.appointment_id,
        { message: 'a unidade é ligada', timeout: 15_000 }).toBeTruthy()
    })
    const { data: u } = await db().from('procedure_sale_units').select('appointment_id').eq('id', u1!).single()
    expect(Number((await agendamento(u!.appointment_id as string))!.price)).toBe(270)
  })

  test('pelo inbox: a sessão de pacote e o pré-pago; crédito usado, alheio ou de outro procedimento é recusado', async ({ browser }) => {
    const cliente = await rede!.criarCliente('Inbox')
    const outro = await rede!.criarCliente('Outro')
    const [u1] = await prePago(cliente, 1)
    const { data: cp, error } = await db().rpc('pacote_vender', {
      p_tenant: rede!.tenantId, p_cliente: cliente, p_pacote: pacoteId, p_unidade: rede!.branchId, p_ator: null,
      p_lancamentos: [{ amount: 500, payment_method: 'PIX', is_paid: true }],
      p_sessoes: [{ procedure_id: rede!.procedureId, preco: 250 }, { procedure_id: rede!.procedureId, preco: 250 }],
    })
    expect(error).toBeNull()
    const { data: sessoes } = await db().from('package_sessions').select('id').eq('client_package_id', cp as string).order('session_number')
    const conversa = await conversaDo(cliente)
    const rota = `/admin/inbox?c=${conversa}`
    const agendar = (p: Page, hora: string, credito: unknown, procedureId: string = rede!.procedureId) =>
      chamarAcao(p, 'actions/crm-scheduling.ts', 'createCrmAppointment', rota, [{
        leadId: '', conversationId: conversa, branchId: rede!.branchId, professionalId: rede!.professionalId,
        procedureId, scheduledAt: amanha(hora).iso, credito,
      }])

    await comSessao(browser, async p => {
      const pacote = await agendar(p, '14:00', { tipo: 'PACOTE', id: sessoes![0]!.id })
      expect(pacote.texto, 'a sessão de pacote agenda').not.toContain('crédito')
      const pp = await agendar(p, '15:00', { tipo: 'PRE_PAGO', id: u1 })
      expect(pp.texto).not.toContain('crédito')
      // O mesmo crédito de novo: já agendado.
      expect((await agendar(p, '16:00', { tipo: 'PRE_PAGO', id: u1 })).texto).toContain('já foi usado ou agendado')
      // O crédito de OUTRO cliente, pela conversa deste.
      const [alheio] = await prePago(outro, 1)
      expect((await agendar(p, '17:00', { tipo: 'PRE_PAGO', id: alheio })).texto).toContain('Crédito não encontrado para este cliente')
      // Procedimento diferente do crédito.
      const { data: b } = await db().from('procedures').insert({
        tenant_id: rede!.tenantId, name: `${PREFIXO} Outro proc ${marca}`, category: 'e2e', duration_min: 30, price: 50,
      }).select('id').single<{ id: string }>()
      expect((await agendar(p, '18:00', { tipo: 'PACOTE', id: sessoes![1]!.id }, b!.id)).texto).toContain('crédito é de outro procedimento')
    })

    const { data: s0 } = await db().from('package_sessions').select('appointment_id').eq('id', sessoes![0]!.id).single()
    expect(Number((await agendamento(s0!.appointment_id as string))!.price), 'o preço da sessão no rateio').toBe(250)
    const { data: s1 } = await db().from('package_sessions').select('appointment_id').eq('id', sessoes![1]!.id).single()
    expect(s1!.appointment_id, 'a recusa não ligou nada').toBeNull()
    const { data: pu } = await db().from('procedure_sale_units').select('appointment_id').eq('id', u1!).single()
    expect(Number((await agendamento(pu!.appointment_id as string))!.price)).toBe(270)
    // Só dois agendamentos nasceram para o cliente (nenhum das recusas ficou).
    expect(((await db().from('appointments').select('id').eq('client_id', cliente)).data ?? []).length).toBe(2)
  })

  test('sessão de pacote (modal do pacote): o horário encavalado é recusado no servidor', async ({ browser }) => {
    // 60 min às 10:00 com outro agendamento às 10:30: a tela só olhava o
    // INÍCIO (10:00 estava livre) e o servidor não conferia nada.
    await db().from('procedures').update({ duration_min: 60 }).eq('id', rede!.procedureId)
    const cliente = await rede!.criarCliente('Encavalado')
    const outro = await rede!.criarCliente('Ocupa')
    await db().from('appointments').insert({
      branch_id: rede!.branchId, client_id: outro, professional_id: rede!.professionalId, procedure_id: rede!.procedureId,
      scheduled_at: amanha('10:30').iso, duration_min: 30, price: 0, status: 'SCHEDULED',
    })
    const { data: cp, error } = await db().rpc('pacote_vender', {
      p_tenant: rede!.tenantId, p_cliente: cliente, p_pacote: pacoteId, p_unidade: rede!.branchId, p_ator: null,
      p_lancamentos: [{ amount: 500, payment_method: 'PIX', is_paid: true }],
      p_sessoes: [{ procedure_id: rede!.procedureId, preco: 250 }, { procedure_id: rede!.procedureId, preco: 250 }],
    })
    expect(error).toBeNull()
    const { data: s1 } = await db().from('package_sessions').select('id').eq('client_package_id', cp as string).eq('session_number', 1).single()
    const pedido = (hora: string) => [{
      packageSessionId: s1!.id, branchId: rede!.branchId, professionalId: rede!.professionalId,
      scheduledAt: amanha(hora).iso, clientId: cliente, procedureId: rede!.procedureId, price: 0, durationMin: 60, slug: 'admin',
    }]
    await comSessao(browser, async p => {
      const rota = `/admin/clients/${cliente}`
      const encavalado = await chamarAcao(p, 'actions/appointments.ts', 'schedulePackageSession', rota, pedido('10:00'))
      expect(encavalado.texto).toContain('já tem agendamento nesse horário')
      expect((await db().from('package_sessions').select('appointment_id').eq('id', s1!.id).single()).data?.appointment_id).toBeNull()
      const livre = await chamarAcao(p, 'actions/appointments.ts', 'schedulePackageSession', rota, pedido('12:00'))
      expect(livre.texto).toContain('appointmentId')
    })
    const { data: s } = await db().from('package_sessions').select('appointment_id').eq('id', s1!.id).single()
    const ap = await agendamento(s!.appointment_id as string)
    // Pelo núcleo: preço da sessão, quem agendou e a linha do tempo.
    expect({ preco: Number(ap!.price), por: ap!.created_by_id }).toEqual({ preco: 250, por: gestor!.userId })
    const { data: hist } = await db().from('appointment_history').select('action').eq('appointment_id', s!.appointment_id as string)
    expect((hist ?? []).map(h => h.action)).toContain('CREATED')
    await db().from('procedures').update({ duration_min: 30 }).eq('id', rede!.procedureId)
  })
})
