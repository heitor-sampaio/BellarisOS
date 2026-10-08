import { test, expect, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { apagarAgendamentos, apagarClientes } from './apoio/limpeza'
import { chamarAcao } from './apoio/acao-direta'
import { subirOpenaiFalsa, type OpenaiFalsa } from './apoio/openai-falsa'
import { redeDoCopilot, contraAFalsa, comSessao, falarComOCopilot, esperarResposta, type RedeDoCopilot } from './apoio/copilot'

/**
 * As GRAVAÇÕES do Copilot na agenda e nos clientes (fase 4, 2026-10-08).
 * Decisão do Heitor: toda gravação passa por um cartão com Confirmar/Cancelar.
 *  - o cartão aparece e NADA é gravado antes do Confirmar;
 *  - Confirmar grava UMA vez (o segundo clique não duplica), pelo mesmo núcleo
 *    da tela, e o evento sai "(via Copilot)";
 *  - Cancelar descarta; o cartão vencido recusa;
 *  - horário ocupado entre preparar e confirmar: recusa, e não grava;
 *  - o cargo que só VÊ a agenda nem recebe a ferramenta de agendar.
 */
test.skip(!contraAFalsa(), 'só contra o build: o servidor precisa da OpenAI falsa')
test.describe.configure({ mode: 'serial' })

const marca = Date.now().toString(36)
let falsa: OpenaiFalsa
let rede: RedeDoCopilot
let clienteId: string
const PROFISSIONAL = `${PREFIXO} Prof copg${marca}`
const AMANHA = (() => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() + 86_400_000)))()
const db = () => banco()

const doCopilot = async () => (await db().from('appointments').select('id, scheduled_at, status, professional_id')
  .eq('client_id', clienteId).order('scheduled_at')).data ?? []

/** O "modelo" pede a gravação; devolve o cartão na tela. */
async function pedir(p: Page, nome: string, args: Record<string, unknown>) {
  falsa.zerar()
  falsa.roteiro.push({ chamar: [{ nome, args }] }, { texto: 'Confira o cartão e confirme.' })
  const painel = await falarComOCopilot(p, `teste ${nome}`)
  await esperarResposta(p)
  return painel.locator('.copilot-cartao[data-cartao="acao"]').last()
}

const acaoDoCartao = async () => (await db().from('copilot_acoes').select('id, status')
  .eq('tenant_id', rede.outra.tenantId).order('criada_em', { ascending: false }).limit(1).single<{ id: string; status: string }>()).data!

test.beforeAll(async () => {
  test.setTimeout(240_000)
  falsa = await subirOpenaiFalsa()
  rede = await redeDoCopilot(`gra${marca}`)
  expect((await db().from('users').update({ provides_services: true, branch_id: rede.outra.branchId, name: PROFISSIONAL }).eq('id', rede.outra.professionalId)).error).toBeNull()
  clienteId = await rede.outra.criarCliente('Gravacao Bia')
})

test.afterAll(async () => {
  if (!clienteId) { await rede?.limpar(); await falsa?.fechar(); return }
  const falhas = await apagarAgendamentos((await doCopilot()).map(a => a.id))
  const { data: novos } = await db().from('clients').select('id').eq('tenant_id', rede.outra.tenantId).neq('id', clienteId)
  await apagarClientes((novos ?? []).map(c => c.id as string), falhas)
  await rede?.limpar()
  await falsa?.fechar()
  expect(falhas).toEqual([])
})

test('agendar: o cartão primeiro, nada gravado; Confirmar grava uma vez, "via Copilot"', async ({ browser }) => {
  await comSessao(browser, rede.dono.estado, async p => {
    await p.goto('/admin/agenda')
    const cartao = await pedir(p, 'agendar', { cliente: clienteId, procedimento: rede.outra.procedureId, profissional: rede.outra.professionalId, data: AMANHA, hora: '09:00' })
    await expect(cartao.getByText('Agendar atendimento')).toBeVisible()
    await expect(cartao.getByText(PROFISSIONAL)).toBeVisible()
    expect(await doCopilot(), 'nada gravado antes do Confirmar').toHaveLength(0)

    await cartao.getByRole('button', { name: 'Confirmar' }).click()
    await expect(cartao.getByRole('status')).toContainText('Feito')
    await expect(cartao.getByRole('link', { name: /Ver agendamento/ })).toBeVisible()

    const gravados = await doCopilot()
    expect(gravados).toHaveLength(1)
    expect(new Date(gravados[0]!.scheduled_at).toISOString()).toBe(new Date(`${AMANHA}T09:00:00-03:00`).toISOString())

    // O segundo "Confirmar" (outra aba, clique duplo) não grava de novo.
    const acao = await acaoDoCartao()
    const de_novo = await chamarAcao(p, 'actions/copilot.ts', 'decidirAcaoDoCopilot', '/admin/agenda', [acao.id, 'confirmar', '/admin/agenda'])
    expect(de_novo.texto).toContain('"status":"feita"')
    expect(await doCopilot()).toHaveLength(1)

    // O evento diz quem pediu, e por onde.
    const { data: ev } = await db().from('domain_events').select('ator_nome').eq('entidade_id', gravados[0]!.id).eq('nome', 'agendamento.criado').single()
    expect(ev!.ator_nome).toMatch(/\(via Copilot\)$/)
  })
})

test('remarcar para cima de outro agendamento do profissional é recusado já no preparo', async ({ browser }) => {
  const [primeiro] = await doCopilot()
  const { data: outro, error } = await db().from('appointments').insert({
    branch_id: rede.outra.branchId, client_id: clienteId, procedure_id: rede.outra.procedureId, professional_id: rede.outra.professionalId,
    scheduled_at: new Date(`${AMANHA}T15:00:00-03:00`).toISOString(), duration_min: 30, price: 0, status: 'SCHEDULED', source: 'INTERNAL',
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  await comSessao(browser, rede.dono.estado, async p => {
    await p.goto('/admin/agenda')
    falsa.zerar()
    falsa.roteiro.push({ chamar: [{ nome: 'remarcar', args: { agendamento: primeiro!.id, data: AMANHA, hora: '15:00' } }] }, { texto: 'Esse horário está ocupado.' })
    await falarComOCopilot(p, 'remarque para as 15h')
    await esperarResposta(p)
    const saida = falsa.saidasDeFerramenta().filter(s => s.nome === 'remarcar').at(-1)
    expect(String((saida?.saida as { erro?: string })?.erro)).toContain('já tem agendamento')
  })
  await apagarAgendamentos([outro!.id])
})

test('horário ocupado entre o cartão e o Confirmar: recusa e não grava', async ({ browser }) => {
  await comSessao(browser, rede.dono.estado, async p => {
    await p.goto('/admin/agenda')
    const cartao = await pedir(p, 'agendar', { cliente: clienteId, procedimento: rede.outra.procedureId, profissional: rede.outra.professionalId, data: AMANHA, hora: '11:00' })
    await expect(cartao.getByText('Agendar atendimento')).toBeVisible()
    // Alguém ocupa o horário pela tela enquanto o cartão espera.
    const { error } = await db().from('appointments').insert({
      branch_id: rede.outra.branchId, client_id: clienteId, procedure_id: rede.outra.procedureId, professional_id: rede.outra.professionalId,
      scheduled_at: new Date(`${AMANHA}T11:00:00-03:00`).toISOString(), duration_min: 30, price: 0, status: 'SCHEDULED', source: 'INTERNAL',
    })
    expect(error).toBeNull()
    await cartao.getByRole('button', { name: 'Confirmar' }).click()
    await expect(cartao.getByRole('status')).toContainText('Não foi gravado')
    await expect(cartao.getByRole('status')).toContainText('já tem agendamento')
    const as11 = (await doCopilot()).filter(a => new Date(a.scheduled_at).toISOString() === new Date(`${AMANHA}T11:00:00-03:00`).toISOString())
    expect(as11, 'só o da "tela"').toHaveLength(1)
  })
})

test('cadastrar cliente: Cancelar descarta; o cartão vencido recusa', async ({ browser }) => {
  const telefone = '5548' + String(Date.now()).slice(-9)
  await comSessao(browser, rede.dono.estado, async p => {
    await p.goto('/admin/clients')
    const cartao = await pedir(p, 'cadastrar_cliente', { nome: `${PREFIXO} Novo copg${marca}`, telefone })
    await expect(cartao.getByText('Cadastrar cliente')).toBeVisible()
    await cartao.getByRole('button', { name: 'Cancelar' }).click()
    await expect(cartao.getByRole('status')).toContainText('nada foi gravado')
    expect((await acaoDoCartao()).status).toBe('cancelada')

    const outro = await pedir(p, 'cadastrar_cliente', { nome: `${PREFIXO} Novo copg${marca}`, telefone })
    const acao = await acaoDoCartao()
    expect((await db().from('copilot_acoes').update({ expira_em: new Date(Date.now() - 60_000).toISOString() }).eq('id', acao.id)).error).toBeNull()
    await outro.getByRole('button', { name: 'Confirmar' }).click()
    await expect(outro.getByRole('status')).toContainText('venceu')
  })
  const { data: criados } = await db().from('clients').select('id').eq('tenant_id', rede.outra.tenantId).like('phone', `%${telefone.slice(-8)}%`)
  expect(criados, 'nada cadastrado').toEqual([])
})

test('cadastrar cliente: Confirmar cadastra, com o CPF conferido', async ({ browser }) => {
  const telefone = '5548' + String(Date.now()).slice(-9)
  await comSessao(browser, rede.dono.estado, async p => {
    await p.goto('/admin/clients')
    // CPF inválido: nem vira cartão.
    falsa.zerar()
    falsa.roteiro.push({ chamar: [{ nome: 'cadastrar_cliente', args: { nome: `${PREFIXO} Cpf copg${marca}`, telefone, cpf: '111.111.111-11' } }] }, { texto: 'CPF inválido.' })
    await falarComOCopilot(p, 'cadastre')
    await esperarResposta(p)
    expect(String((falsa.saidasDeFerramenta().at(-1)?.saida as { erro?: string })?.erro)).toContain('CPF inválido')

    const cartao = await pedir(p, 'cadastrar_cliente', { nome: `${PREFIXO} Cpf copg${marca}`, telefone, email: `copg${marca}@bellaris.invalid`, nascimento: '1992-03-04' })
    await cartao.getByRole('button', { name: 'Confirmar' }).click()
    await expect(cartao.getByRole('status')).toContainText('Feito')
  })
  const { data: criado } = await db().from('clients').select('name, email, birth_date, tags').eq('tenant_id', rede.outra.tenantId).like('phone', `%${telefone.slice(-8)}%`).single()
  expect(criado!.email).toBe(`copg${marca}@bellaris.invalid`)
  expect(String(criado!.birth_date).slice(0, 10)).toBe('1992-03-04')
})

test('cargo que só VÊ a agenda nem recebe "agendar"', async ({ browser }) => {
  const m = await rede.membro('ver', [{ modulo: 'agenda', nivel: 'VIEW' }, { modulo: 'clients', nivel: 'VIEW' }])
  await comSessao(browser, m.estado, async p => {
    await p.goto('/admin/dashboard')
    falsa.zerar()
    falsa.roteiro.push({ chamar: [{ nome: 'agendar', args: { cliente: clienteId, procedimento: rede.outra.procedureId, profissional: rede.outra.professionalId, data: AMANHA, hora: '17:00' } }] }, { texto: 'Não posso.' })
    await falarComOCopilot(p, 'agende')
    await esperarResposta(p)
    const oferecidas = falsa.ferramentasOferecidas(0)
    expect(oferecidas).toContain('agendamentos')
    for (const fora of ['agendar', 'remarcar', 'cancelar_agendamento', 'cadastrar_cliente']) expect(oferecidas).not.toContain(fora)
    expect(String((falsa.saidasDeFerramenta().at(-1)?.saida as { erro?: string })?.erro)).toContain('não está liberada')
  })
  expect((await doCopilot()).filter(a => new Date(a.scheduled_at).getUTCHours() === 20)).toHaveLength(0)
})

/** Um agendamento direto no banco (o que "a tela" marcou), para o teste mexer. */
async function agendamentoNoBanco(hora: string, opcoes: { duracao?: number; branchId?: string } = {}) {
  const { data, error } = await db().from('appointments').insert({
    branch_id: opcoes.branchId ?? rede.outra.branchId, client_id: clienteId, procedure_id: rede.outra.procedureId,
    professional_id: rede.outra.professionalId, scheduled_at: new Date(`${AMANHA}T${hora}:00-03:00`).toISOString(),
    duration_min: opcoes.duracao ?? 30, price: 0, status: 'SCHEDULED', source: 'INTERNAL',
  }).select('id').single<{ id: string }>()
  expect(error, 'criar o agendamento').toBeNull()
  return data!.id
}

test('atendimento LONGO bloqueia o horário seguinte: 2 h às 12:00 ocupa as 13:00', async ({ browser }) => {
  await agendamentoNoBanco('12:00', { duracao: 120 })
  await comSessao(browser, rede.dono.estado, async p => {
    await p.goto('/admin/agenda')
    falsa.zerar()
    falsa.roteiro.push({ chamar: [{ nome: 'agendar', args: { cliente: clienteId, procedimento: rede.outra.procedureId, profissional: rede.outra.professionalId, data: AMANHA, hora: '13:00' } }] }, { texto: 'Ocupado.' })
    await falarComOCopilot(p, 'agende 13h')
    await esperarResposta(p)
    expect(String((falsa.saidasDeFerramenta().at(-1)?.saida as { erro?: string })?.erro)).toContain('já tem agendamento')
  })
})

test('remarcar, confirmar presença e cancelar: o Confirmar grava, com histórico e evento', async ({ browser }) => {
  const id = await agendamentoNoBanco('16:00')
  await comSessao(browser, rede.dono.estado, async p => {
    await p.goto('/admin/agenda')
    const remarcar = await pedir(p, 'remarcar', { agendamento: id, data: AMANHA, hora: '17:00' })
    await remarcar.getByRole('button', { name: 'Confirmar' }).click()
    await expect(remarcar.getByRole('status')).toContainText('Feito')
    const { data: depois } = await db().from('appointments').select('scheduled_at').eq('id', id).single()
    expect(new Date(depois!.scheduled_at).toISOString()).toBe(new Date(`${AMANHA}T17:00:00-03:00`).toISOString())

    const confirmar = await pedir(p, 'confirmar_agendamento', { agendamento: id })
    await confirmar.getByRole('button', { name: 'Confirmar' }).click()
    await expect(confirmar.getByRole('status')).toContainText('Feito')
    expect((await db().from('appointments').select('status').eq('id', id).single()).data!.status).toBe('CONFIRMED')

    const cancelar = await pedir(p, 'cancelar_agendamento', { agendamento: id, motivo: 'Cliente pediu' })
    await cancelar.getByRole('button', { name: 'Confirmar' }).click()
    await expect(cancelar.getByRole('status')).toContainText('Feito')
    const { data: cancelado } = await db().from('appointments').select('status, cancellation_reason').eq('id', id).single()
    expect(cancelado).toEqual({ status: 'CANCELLED', cancellation_reason: 'Cliente pediu' })
  })
  const { data: eventos } = await db().from('domain_events').select('nome, ator_nome').eq('entidade_id', id).order('created_at')
  expect(eventos!.map(e => e.nome)).toEqual(['agendamento.remarcado', 'agendamento.confirmado', 'agendamento.cancelado'])
  for (const e of eventos!) expect(e.ator_nome).toMatch(/\(via Copilot\)$/)
  const { data: historico } = await db().from('appointment_history').select('action').eq('appointment_id', id).order('created_at')
  expect(historico!.map(h => h.action)).toEqual(['RESCHEDULED', 'CONFIRMED', 'CANCELLED'])
})

test('o profissional da rede ocupado em OUTRA unidade: o Confirmar recusa', async ({ browser }) => {
  const id = await agendamentoNoBanco('08:00')
  let outroNaUnidadeC: string | null = null
  const { data: b, error } = await db().from('branches').insert({ tenant_id: rede.outra.tenantId, name: `${PREFIXO} Unidade C ${marca}`, slug: `e2e-unc-${marca}` }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  try {
    // O profissional passa a ser da REDE (atende nas duas unidades).
    expect((await db().from('users').update({ branch_id: null }).eq('id', rede.outra.professionalId)).error).toBeNull()
    await comSessao(browser, rede.dono.estado, async p => {
      await p.goto('/admin/agenda')
      const cartao = await pedir(p, 'remarcar', { agendamento: id, data: AMANHA, hora: '18:00' })
      await expect(cartao.getByText('Remarcar atendimento')).toBeVisible()
      // Na OUTRA unidade, alguém marca o mesmo profissional às 18:00.
      outroNaUnidadeC = await agendamentoNoBanco('18:00', { branchId: b!.id })
      await cartao.getByRole('button', { name: 'Confirmar' }).click()
      await expect(cartao.getByRole('status')).toContainText('já tem agendamento')
    })
    expect(new Date((await db().from('appointments').select('scheduled_at').eq('id', id).single()).data!.scheduled_at).toISOString())
      .toBe(new Date(`${AMANHA}T08:00:00-03:00`).toISOString())
  } finally {
    // O agendamento da unidade C sai antes dela (a FK), mesmo se o teste falhou no meio.
    if (outroNaUnidadeC) await apagarAgendamentos([outroNaUnidadeC])
    await db().from('users').update({ branch_id: rede.outra.branchId }).eq('id', rede.outra.professionalId)
    await db().from('branches').delete().eq('id', b!.id)
  }
})

test('cadastrar com CPF grava o CPF; atualizar contato mostra De → Para e grava', async ({ browser }) => {
  const telefone = '5548' + String(Date.now()).slice(-9)
  const cpf = '52998224725'
  await comSessao(browser, rede.dono.estado, async p => {
    await p.goto('/admin/clients')
    const cartao = await pedir(p, 'cadastrar_cliente', { nome: `${PREFIXO} Doc copg${marca}`, telefone, cpf, email: `DOC${marca}@Bellaris.invalid` })
    await cartao.getByRole('button', { name: 'Confirmar' }).click()
    await expect(cartao.getByRole('status')).toContainText('Feito')
    const { data: criado } = await db().from('clients').select('id, document, email').eq('tenant_id', rede.outra.tenantId).eq('document', cpf).single()
    expect(criado!.email).toBe(`doc${marca}@bellaris.invalid`)

    const atualizar = await pedir(p, 'atualizar_contato', { cliente: criado!.id, email: `novo${marca}@bellaris.invalid` })
    await expect(atualizar.getByText(`doc${marca}@bellaris.invalid → novo${marca}@bellaris.invalid`)).toBeVisible()
    await atualizar.getByRole('button', { name: 'Confirmar' }).click()
    await expect(atualizar.getByRole('status')).toContainText('Feito')
    expect((await db().from('clients').select('email').eq('id', criado!.id).single()).data!.email).toBe(`novo${marca}@bellaris.invalid`)
  })
})

test('na TELA (a agenda do CRM): o longo bloqueia o seguinte, e o curto antes não bloqueia o longo depois', async ({ browser }) => {
  const { data: cli } = await db().from('clients').select('name, phone').eq('id', clienteId).single<{ name: string; phone: string }>()
  const { data: longo, error } = await db().from('procedures').insert({ tenant_id: rede.outra.tenantId, name: `${PREFIXO} Longo ${marca}`, category: 'e2e', duration_min: 120, price: 0 }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  const marcar = (p: Page, hora: string, procedureId: string) => chamarAcao(p, 'actions/crm-scheduling.ts', 'createCrmAppointment', '/admin/inbox', [{
    leadId: '', branchId: rede.outra.branchId, professionalId: rede.outra.professionalId, procedureId,
    scheduledAt: new Date(`${AMANHA}T${hora}:00-03:00`).toISOString(), contato: { nome: cli!.name, telefone: cli!.phone },
  }])
  await comSessao(browser, rede.dono.estado, async p => {
    await p.goto('/admin/inbox')
    // 12:00 tem um atendimento de 2 h (do teste "LONGO"): às 13:30, ocupado.
    expect((await marcar(p, '13:30', rede.outra.procedureId)).texto).toContain('já tem agendamento')
    // Um de 30 min às 19:30 (termina 20:00) não bloqueia um de 2 h às 20:00.
    await agendamentoNoBanco('19:30')
    const r = await marcar(p, '20:00', longo!.id)
    expect(r.texto).not.toContain('já tem agendamento')
    expect(r.texto).toMatch(/"id":"[0-9a-f-]{36}"/)
  })
})
