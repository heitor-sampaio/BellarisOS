import { test, expect, type Browser, type Page, type Locator } from '@playwright/test'
import { banco, PREFIXO, apagarConversas } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { chamarAcaoComFormulario } from './apoio/acao-direta'
import { addDaysTZ, dayKeyTZ } from '../lib/datetime'

/**
 * Os atritos da agenda da 8ª simulação (2026-11-06), da F37:
 * - A20: com a cliente que tem pacote do procedimento, o "Já pago" vinha em
 *   "Não usar — cobrar no atendimento" (a Bruna saiu avulsa a R$ 180 com a
 *   sessão livre), e o avulso não se ligava ao pacote depois.
 * - A21: o aviso do choque parecia só um aviso, e o servidor recusava; sem o
 *   próximo livre. O Remarcar repetia o aviso e a recusa.
 * - A22: trocar de profissional só arrastando, sem confirmação, e o histórico
 *   dizia só "Remarcado"; soltar no ocupado voltava sem mensagem.
 * - A23: o "Bloquear horário" sem "Dia inteiro" e, às 23:30, abrindo no dia
 *   seguinte sem dizer.
 * - A24: os cartões de 30 e 40 min cortavam o procedimento.
 * - A25: a "Minha agenda" sem "Agendar", com a Agenda em Gerenciar "só os meus".
 * - A58/A32: o seletor de horários livres só na sessão do pacote (não no modal
 *   Agendar), e a sala da sessão só aparecia depois do horário.
 * - Sobra da F33: o "Vender" do inbox numa rede de duas unidades saía da
 *   unidade de cadastro da cliente, sem perguntar.
 *
 * Numa rede [e2e] própria, de duas unidades 24 h.
 */

const marca = Date.now().toString(36)
const db = () => banco()
const TODO_DIA = { dias: Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(d => [d, [{ de: '00:00', ate: '24:00' }]])) }
const PROC = `${PREFIXO} Limpeza ${marca}`
const SALA = `${PREFIXO} Sala Rosa ${marca}`

let rede: OutraRede | null = null
let slug = ''
let batel = ''
let recepcao: MembroDeTeste | null = null
let daRede: MembroDeTeste | null = null
let bia: MembroDeTeste | null = null      // atende na unidade
let cora: MembroDeTeste | null = null     // atende só no Batel
let paula: MembroDeTeste | null = null    // "só os meus", atende na unidade
let nomeDaProf = ''
const nomeBia = `${PREFIXO} Bia a8b${marca}`
let bruna = ''      // tem pacote do procedimento
let cliente = ''
const conversas: string[] = []

const em = (dia: string, hhmm: string) => new Date(`${dia}T${hhmm}:00-03:00`).toISOString()
const dia = (n: number) => dayKeyTZ(addDaysTZ(new Date(), n))
const DIA1 = dia(3)   // A21, A58
const DIA2 = dia(4)   // A22
const DIA3 = dia(5)   // A24, A25
const DIA4 = dia(6)   // A20

async function como(browser: Browser, quem: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: quem.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

async function agendar(o: { quando: string; min?: number; prof?: string; cli?: string; preco?: number }) {
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: o.cli ?? cliente, procedure_id: rede!.procedureId,
    professional_id: o.prof ?? rede!.professionalId, scheduled_at: o.quando, duration_min: o.min ?? 60,
    price: o.preco ?? 0, status: 'SCHEDULED', source: 'INTERNAL',
  }).select('id').single<{ id: string }>()
  expect(error, 'agendar').toBeNull()
  return data!.id
}

/** O que está dentro do cartão cabe nele (não fica cortado embaixo). */
async function cabeNoCartao(cartao: Locator, dentro: Locator) {
  // Medido de uma vez, no navegador: a agenda se redesenha sozinha (o realtime).
  await expect.poll(() => dentro.evaluate(el => {
    const card = el.closest('[data-agendamento],[data-cartao-minha-agenda]')!.getBoundingClientRect()
    return el.getBoundingClientRect().bottom - card.bottom
  }), { message: 'o procedimento cabe no cartão' }).toBeLessThanOrEqual(0.5)
  void cartao
}

test.beforeAll(async () => {
  test.setTimeout(240_000)
  rede = await criarOutraRede(`a8${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  expect((await db().from('branches').update({ horario: TODO_DIA }).eq('id', rede.branchId)).error).toBeNull()
  const { data: b2, error: eB } = await db().from('branches')
    .insert({ tenant_id: rede.tenantId, name: `${PREFIXO} Batel ${marca}`, slug: `e2e-batel-a8${marca}`, horario: TODO_DIA })
    .select('id').single<{ id: string }>()
  expect(eB).toBeNull()
  batel = b2!.id
  expect((await db().from('procedures').update({ name: PROC, duration_min: 60, price: 200 }).eq('id', rede.procedureId)).error).toBeNull()
  expect((await db().from('users').update({ branch_id: rede.branchId, atende_em: [rede.branchId] }).eq('id', rede.professionalId)).error).toBeNull()
  nomeDaProf = (await db().from('users').select('name').eq('id', rede.professionalId).single<{ name: string }>()).data!.name
  // A sala (antes de qualquer tela abrir: a lista é cache de 10 min).
  expect((await db().from('rooms').insert({ branch_id: rede.branchId, name: SALA })).error).toBeNull()

  recepcao = await criarMembro(`a8r${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Recepcao',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'procedures', nivel: 'VIEW' }, { modulo: 'cashier', nivel: 'MANAGE' }],
  })
  daRede = await criarMembro(`a8d${marca}`, {
    tenant: rede.tenantId, rotulo: 'Gisele',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'crm', nivel: 'MANAGE' }, { modulo: 'cashier', nivel: 'MANAGE' }, { modulo: 'procedures', nivel: 'VIEW' }],
  })
  bia = await criarMembro(`a8b${marca}`, { tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Bia', permissoes: [{ modulo: 'agenda', nivel: 'VIEW', escopo: 'OWN' }] })
  cora = await criarMembro(`a8c${marca}`, { tenant: rede.tenantId, branchId: batel, rotulo: 'Cora', permissoes: [{ modulo: 'agenda', nivel: 'VIEW', escopo: 'OWN' }] })
  paula = await criarMembro(`a8p${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Paula',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE', escopo: 'OWN' }],
  })
  expect((await db().from('users').update({ atende_em: [rede.branchId] }).eq('id', bia.userId)).error).toBeNull()
  expect((await db().from('users').update({ atende_em: [batel] }).eq('id', cora.userId)).error).toBeNull()
  expect((await db().from('users').update({ atende_em: [rede.branchId] }).eq('id', paula.userId)).error).toBeNull()

  cliente = await rede.criarCliente('Agenda')
  bruna = await rede.criarCliente('Bruna')
  // O pacote da Bruna: 3 sessões do procedimento, a R$ 150 cada (o avulso é R$ 200).
  const { data: pac, error: eP } = await db().rpc('pacote_salvar', {
    p_tenant: rede.tenantId, p_id: null, p_nome: `${PREFIXO} Pacote limpeza ${marca}`, p_preco: 450, p_validade: null, p_ativo: true,
    p_itens: [{ procedure_id: rede.procedureId, quantity: 3 }],
    p_comissao: { venda: { tipo: 'PERCENTAGE', valor: 0 }, execucao: { tipo: 'REGRA', valor: null } },
  })
  expect(eP, 'criar o pacote').toBeNull()
  const { error: eV } = await db().rpc('pacote_vender', {
    p_tenant: rede.tenantId, p_cliente: bruna, p_pacote: pac, p_unidade: rede.branchId, p_ator: recepcao.userId,
    p_lancamentos: [{ amount: 450, payment_method: 'PIX', is_paid: true }],
    p_sessoes: [{ procedure_id: rede.procedureId, preco: 150 }, { procedure_id: rede.procedureId, preco: 150 }, { procedure_id: rede.procedureId, preco: 150 }],
  })
  expect(eV, 'vender o pacote').toBeNull()
})

test.afterAll(async () => {
  await apagarConversas(conversas)
  for (const m of [paula, cora, bia, daRede, recepcao]) await m?.limpar()
  await rede?.limpar()
})

test('A20: com pacote do procedimento, o "Já pago" vem escolhido e avisa; o agendamento usa a sessão', async ({ browser }) => {
  await como(browser, recepcao!, async p => {
    await p.goto(`/${slug}/agenda?date=${DIA4}&novo=1&cliente=${bruna}`)
    const modal = p.getByRole('dialog', { name: 'Novo agendamento' })
    await expect(modal.getByText(`${PREFIXO} Bruna`)).toBeVisible()
    await modal.locator('#ag-procedimento').selectOption(rede!.procedureId)
    await expect(modal.getByLabel('Usar o que já foi pago'), 'o crédito do procedimento vem escolhido').not.toHaveValue('')
    await expect(modal.locator('[data-credito-pre-escolhido]')).toContainText('Já pago')
    await modal.locator('#ag-profissional').selectOption(rede!.professionalId)
    await modal.locator('#ag-quando').fill(`${DIA4}T09:00`)
    await modal.getByRole('button', { name: 'Confirmar agendamento' }).click()
    await expect(modal).toBeHidden()
  })
  const { data: ag } = await db().from('appointments').select('id, price').eq('client_id', bruna).eq('scheduled_at', em(DIA4, '09:00')).single<{ id: string; price: number }>()
  const { data: ses } = await db().from('package_sessions').select('id').eq('appointment_id', ag!.id)
  expect(ses, 'a sessão do pacote ficou ligada').toHaveLength(1)
  expect(Number(ag!.price)).toBe(150)
})

test('A20: o agendamento avulso se liga ao pacote depois, pela janela', async ({ browser }) => {
  const avulso = await agendar({ quando: em(DIA4, '14:00'), cli: bruna, preco: 200 })
  await como(browser, recepcao!, async p => {
    await p.goto(`/${slug}/agenda?date=${DIA4}`)
    await p.locator(`[data-agendamento="${avulso}"]`).first().click()
    const janela = p.getByRole('dialog', { name: 'Agendamento' })
    await janela.locator('[data-usar-o-que-ja-foi-pago]').getByRole('button', { name: /Usar/ }).click()
    await expect.poll(async () => ((await db().from('package_sessions').select('id').eq('appointment_id', avulso)).data ?? []).length,
      { timeout: 15_000 }).toBe(1)
  })
  const { data: ag } = await db().from('appointments').select('price').eq('id', avulso).single<{ price: number }>()
  expect(Number(ag!.price), 'o preço passa a ser a parte da sessão').toBe(150)
})

test('A21: o choque diz "não vai ser agendado" e oferece o próximo livre; o Remarcar não repete', async ({ browser }) => {
  await agendar({ quando: em(DIA1, '10:00') })
  const outro = await agendar({ quando: em(DIA1, '15:00'), min: 30 })
  await como(browser, recepcao!, async p => {
    await p.goto(`/${slug}/agenda?date=${DIA1}&novo=1&cliente=${cliente}`)
    const modal = p.getByRole('dialog', { name: 'Novo agendamento' })
    await expect(modal.getByText(`${PREFIXO} Agenda`)).toBeVisible()
    await modal.locator('#ag-procedimento').selectOption(rede!.procedureId)
    await modal.locator('#ag-profissional').selectOption(rede!.professionalId)
    await modal.locator('#ag-quando').fill(`${DIA1}T10:30`)
    const choque = modal.locator('[data-choque-do-horario]')
    await expect(choque).toContainText('Não vai ser agendado')
    await expect(choque).toContainText(`${nomeDaProf} já tem atendimento das 10:00 às 11:00`)
    await choque.getByRole('button', { name: /11:00/ }).click()
    await expect(modal.locator('#ag-quando')).toHaveValue(`${DIA1}T11:00`)
    await expect(choque).toHaveCount(0)
    await modal.getByRole('button', { name: 'Confirmar agendamento' }).click()
    await expect(modal).toBeHidden()

    // O Remarcar para cima do das 10:00: uma mensagem só.
    await p.goto(`/${slug}/agenda?date=${DIA1}`)
    await p.locator(`[data-agendamento="${outro}"]`).first().click()
    const janela = p.getByRole('dialog', { name: 'Agendamento' })
    await janela.getByRole('button', { name: 'Remarcar' }).click()
    await janela.locator('input[type="datetime-local"]').fill(`${DIA1}T10:15`)
    await expect(janela.locator('[data-aviso-do-remarcar]')).toContainText('Não vai ser remarcado')
    await janela.getByRole('button', { name: 'Confirmar novo horário' }).click()
    await expect(janela.getByText(/Não foi remarcado/)).toBeVisible()
    await expect(janela.getByText(/já tem (atendimento|agendamento)/)).toHaveCount(1)
  })
  const { data } = await db().from('appointments').select('id').eq('client_id', cliente).eq('scheduled_at', em(DIA1, '11:00'))
  expect(data).toHaveLength(1)
})

test('A58: o modal Agendar tem o seletor de horários livres (a régua da duração e dos ocupados)', async ({ browser }) => {
  await agendar({ quando: em(DIA1, '16:00'), prof: bia!.userId })
  await como(browser, recepcao!, async p => {
    await p.goto(`/${slug}/agenda?date=${DIA1}&novo=1&cliente=${cliente}`)
    const modal = p.getByRole('dialog', { name: 'Novo agendamento' })
    await expect(modal.getByText(`${PREFIXO} Agenda`)).toBeVisible()
    await modal.locator('#ag-procedimento').selectOption(rede!.procedureId)
    await modal.locator('#ag-profissional').selectOption(bia!.userId)
    await modal.locator('#ag-quando').fill(`${DIA1}T08:00`)
    const grade = modal.locator('[data-grade-de-horarios]')
    // 60 min às 15:30 e às 16:00 batem no das 16:00.
    await expect(grade.locator('[data-horario="15:30"]')).toBeDisabled()
    await expect(grade.locator('[data-horario="16:00"]')).toBeDisabled()
    await grade.locator('[data-horario="17:00"]').click()
    await expect(modal.locator('#ag-quando')).toHaveValue(`${DIA1}T17:00`)
  })
})

test('A22: a janela troca a profissional (só quem atende na unidade), com confirmação e "de quem para quem"', async ({ browser }) => {
  const ag = await agendar({ quando: em(DIA2, '10:00') })
  await como(browser, recepcao!, async p => {
    await p.goto(`/${slug}/agenda?date=${DIA2}`)
    await p.locator(`[data-agendamento="${ag}"]`).first().click()
    const janela = p.getByRole('dialog', { name: 'Agendamento' })
    await janela.getByRole('button', { name: 'Trocar profissional' }).click()
    const escolha = janela.getByLabel('Nova profissional')
    await expect(escolha.locator('option', { hasText: nomeBia })).toHaveCount(1)
    await expect(escolha.locator('option', { hasText: 'Cora' }), 'quem não atende na unidade não aparece').toHaveCount(0)
    await escolha.selectOption(bia!.userId)
    await janela.getByRole('button', { name: 'Trocar', exact: true }).click()
    await expect(janela.locator('[data-confirmar-troca]')).toContainText(`de ${nomeDaProf} para ${nomeBia}`)
    await janela.locator('[data-confirmar-troca]').getByRole('button', { name: 'Confirmar a troca' }).click()
    await expect.poll(async () => (await db().from('appointments').select('professional_id').eq('id', ag).single<{ professional_id: string }>()).data?.professional_id,
      { timeout: 15_000 }).toBe(bia!.userId)
  })
  const { data: h } = await db().from('appointment_history').select('description').eq('appointment_id', ag).eq('action', 'REASSIGNED')
  expect(h?.[0]?.description).toBe(`Profissional trocado de ${nomeDaProf} para ${nomeBia}`)
})

test('A22: arrastar para outra profissional pergunta, e soltar no ocupado diz por quê', async ({ browser }) => {
  const ag = await agendar({ quando: em(DIA2, '13:00'), min: 30 })
  await agendar({ quando: em(DIA2, '15:00'), prof: bia!.userId })
  // A grade rolada até as 12:00: o meio-dia e a tarde à vista.
  const rolarAte12 = (p: Page) => p.locator('[data-grade-do-dia]').evaluate(el => { el.scrollTop = 12 * 80 })
  await como(browser, recepcao!, async p => {
    await p.goto(`/${slug}/agenda?date=${DIA2}`)
    await rolarAte12(p)
    const cartao = p.locator(`[data-agendamento="${ag}"]`).first()
    const colunaDaBia = p.locator(`[data-coluna-do-profissional="${nomeBia}"]`)
    // Para as 14:00 da Bia (a grade de 24 h: 80 px por hora).
    await cartao.dragTo(colunaDaBia, { targetPosition: { x: 30, y: 14 * 80 + 4 } })
    const pergunta = p.locator('[data-confirmar-arraste]')
    await expect(pergunta).toContainText(`de ${nomeDaProf} para ${nomeBia}`)
    await expect(pergunta).toContainText('14:00')
    await pergunta.getByRole('button', { name: 'Confirmar' }).click()
    await expect.poll(async () => (await db().from('appointments').select('professional_id').eq('id', ag)
      .single<{ professional_id: string }>()).data?.professional_id, { timeout: 15_000 }).toBe(bia!.userId)
    const { data: depois } = await db().from('appointments').select('scheduled_at').eq('id', ag).single<{ scheduled_at: string }>()
    expect(new Date(depois!.scheduled_at).toISOString()).toBe(em(DIA2, '14:00'))

    // Soltar em cima do das 15:00 da Bia: a recusa aparece.
    await p.goto(`/${slug}/agenda?date=${DIA2}`)
    await rolarAte12(p)
    await p.locator(`[data-agendamento="${ag}"]`).first().dragTo(p.locator(`[data-coluna-do-profissional="${nomeBia}"]`), { targetPosition: { x: 30, y: 15 * 80 + 20 } })
    await expect(p.getByText(/já tem (atendimento|agendamento)/).first()).toBeVisible()
  })
})

test('A23: "Dia inteiro" no bloqueio; o horário sugerido de outro dia avisa', async ({ browser }) => {
  await como(browser, recepcao!, async p => {
    await p.goto(`/${slug}/agenda?date=${DIA3}`)
    await p.getByRole('button', { name: 'Bloquear horário' }).click()
    const janela = p.getByRole('dialog', { name: 'Bloquear horário' })
    await janela.getByLabel('Profissional').selectOption(bia!.userId)
    await janela.getByLabel('Dia inteiro').check()
    await expect(janela.getByLabel('Do dia')).toHaveValue(DIA3)
    await janela.getByLabel('Motivo').fill('Folga')
    await janela.getByRole('button', { name: 'Bloquear', exact: true }).click()
    await expect(janela).toBeHidden()
  })
  const { data } = await db().from('agenda_bloqueios').select('inicio, fim').eq('professional_id', bia!.userId).eq('motivo', 'Folga').single<{ inicio: string; fim: string }>()
  expect(new Date(data!.inicio).toISOString()).toBe(em(DIA3, '00:00'))
  expect(new Date(data!.fim).toISOString()).toBe(em(dayKeyTZ(addDaysTZ(new Date(`${DIA3}T12:00:00-03:00`), 1)), '00:00'))

  // Às 23:30, o padrão (a próxima hora cheia) cai no dia seguinte: a janela diz.
  const ctx = await browser.newContext({ storageState: recepcao!.estado })
  try {
    const p = await ctx.newPage()
    const hoje = dayKeyTZ(new Date())
    await p.clock.setFixedTime(new Date(`${hoje}T23:30:00-03:00`))
    await p.goto(`/${slug}/agenda?date=${hoje}`)
    await p.getByRole('button', { name: 'Bloquear horário' }).click()
    await expect(p.getByRole('dialog', { name: 'Bloquear horário' }).locator('[data-bloqueio-outro-dia]')).toContainText('dia seguinte')
  } finally { await ctx.close() }
})

test('A24: os cartões de 30 e 40 min mostram o procedimento inteiro (agenda da unidade e "Minha agenda")', async ({ browser }) => {
  const de30 = await agendar({ quando: em(DIA3, '09:00'), min: 30, prof: paula!.userId })
  const de40 = await agendar({ quando: em(DIA3, '11:00'), min: 40, prof: paula!.userId })
  await como(browser, recepcao!, async p => {
    await p.goto(`/${slug}/agenda?date=${DIA3}`)
    for (const id of [de30, de40]) {
      const cartao = p.locator(`[data-agendamento="${id}"]`).first()
      await expect(cartao.locator('[data-procedimento-do-cartao]')).toContainText(PROC)
      await cabeNoCartao(cartao, cartao.locator('[data-procedimento-do-cartao]'))
    }
  })
  await como(browser, paula!, async p => {
    await p.goto(`/${slug}/agenda?date=${DIA3}`)
    for (const id of [de30, de40]) {
      const cartao = p.locator(`[data-cartao-minha-agenda="${id}"]`)
      await expect(cartao.locator('[data-procedimento-do-cartao]')).toContainText(PROC)
      await cabeNoCartao(cartao, cartao.locator('[data-procedimento-do-cartao]'))
    }
  })
})

test('A25: a "Minha agenda" de quem tem a Agenda em Gerenciar "só os meus" agenda — para ela', async ({ browser }) => {
  await como(browser, paula!, async p => {
    await p.goto(`/${slug}/agenda?date=${DIA3}`)
    await p.getByRole('button', { name: 'Agendar', exact: true }).click()
    const modal = p.getByRole('dialog', { name: 'Novo agendamento' })
    const prof = modal.locator('#ag-profissional')
    await expect(prof.locator('option[value]:not([value=""])'), 'só ela').toHaveCount(1)
    await expect(prof).toHaveValue(paula!.userId)
    await modal.getByPlaceholder('Buscar cliente por nome ou telefone…').fill(`Agenda a8${marca}`)
    await modal.getByText(`${PREFIXO} Agenda a8${marca}`).first().click()
    await modal.locator('#ag-procedimento').selectOption(rede!.procedureId)
    await modal.locator('#ag-quando').fill(`${DIA3}T15:00`)
    await modal.getByRole('button', { name: 'Confirmar agendamento' }).click()
    await expect(modal).toBeHidden()

    // E o servidor não deixa agendar para outra.
    const r = await chamarAcaoComFormulario(p, 'actions/appointments.ts', 'addAppointment', `/${slug}/agenda`, [undefined], {
      _branchId: rede!.branchId, _slug: slug, client_id: cliente, procedure_id: rede!.procedureId,
      professional_id: bia!.userId, scheduled_at: em(DIA3, '20:00'),
    })
    expect(r.texto).toContain('só para você')
  })
  const { data } = await db().from('appointments').select('professional_id').eq('client_id', cliente).eq('scheduled_at', em(DIA3, '15:00')).single<{ professional_id: string }>()
  expect(data?.professional_id).toBe(paula!.userId)
  const { data: outra } = await db().from('appointments').select('id').eq('scheduled_at', em(DIA3, '20:00'))
  expect(outra ?? []).toHaveLength(0)
})

test('A32/A58: o agendar da sessão do pacote pede a sala desde o início', async ({ browser }) => {
  await como(browser, recepcao!, async p => {
    await p.goto(`/${slug}/clients/${bruna}`)
    await p.getByText('TRATAMENTO EM ANDAMENTO').first().click()
    await p.getByRole('button', { name: /Gerenciar/ }).first().click()
    await p.getByRole('button', { name: 'Agendar', exact: true }).first().click()
    const agendar = p.locator('[data-agendar-sessao]')
    await expect(agendar.getByLabel('Sala'), 'a sala aparece antes do horário').toBeVisible()
    await expect(agendar.getByLabel('Sala').locator('option', { hasText: SALA })).toHaveCount(1)
  })
})

test('sobra da F33: o "Vender" do inbox, na rede de duas unidades, pergunta a unidade', async ({ browser }) => {
  const { data, error } = await db().from('conversations').insert({
    tenant_id: rede!.tenantId, status: 'open', channel: 'whatsapp', provider: 'uazapi', client_id: bruna,
    last_message_at: new Date().toISOString(), last_message: 'oi', contact_name: `${PREFIXO} Conversa ${marca}`,
    contact_phone: '55489' + String(Date.now()).slice(-8),
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  conversas.push(data!.id)
  await como(browser, daRede!, async p => {
    await p.goto(`/admin/inbox?c=${data!.id}`)
    await p.getByRole('button', { name: 'Vender', exact: true }).click()
    const dlg = p.getByRole('dialog', { name: 'Vender' })
    await expect(dlg.locator('[data-unidade-da-venda] select'), 'nenhuma unidade vem escolhida').toHaveValue('')
  })
})
