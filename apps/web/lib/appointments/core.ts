// Núcleo de agendamento reutilizável — usado pela agenda (addAppointment) e
// pelo agendamento do comercial no CRM (createCrmAppointment).
// Contém a REGRA de negócio (preço/duração, conflito de sala E de profissional,
// insert, histórico) desacoplada de FormData/cookies. Sem 'use server'.

import { after } from 'next/server'
import { intervalosDoDia, normalizarHorario, slotsDoDia, diaDaSemana } from '@/lib/agenda/horario'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { TenantContext } from '@estetica-os/types'
import { createAdminClient } from '@/lib/supabase/admin'
import { notificadorDoCliente, notifyUser } from '@/lib/notifications/notify'
import { enviarEventoCapi } from '@/lib/ads/capi'
import { cliqueDoCliente, contatoDoCliente } from '@/lib/ads/atribuicao'
import { emitirEventoDeAgendamento } from '@/lib/events/agendamento'
import { EVENTOS } from '@estetica-os/types'
import { ler, tentar } from '@/lib/db'
import { conferirCredito, ligarCredito, type CreditoDeAgendamento } from '@/lib/creditos/credito'
import { avisarDoPreAtendimento } from '@/lib/pre-atendimento/ficha'
import { oportunidadeDoAgendamento, ligarAgendamentoAOportunidade } from '@/lib/crm/liga-agendamento'
import { filtroDeQuemAtendeNaUnidade } from '@/lib/cached-queries'
import type { CandidataDoHorario } from '@/lib/appointments/sem-preferencia'
import { recusaDaSala } from '@/lib/appointments/salas'

type Admin = ReturnType<typeof createAdminClient>

export interface CreateAppointmentInput {
  branchId:       string
  clientId:       string
  procedureId:    string | null
  professionalId: string
  scheduledAt:    string                 // ISO UTC
  roomId?:        string | null
  notes?:         string | null
  source?:        'INTERNAL' | 'ONLINE' | 'CLIENT_APP' | 'COMMERCIAL'
  /**
   * Usar o que o cliente JÁ PAGOU (unidade pré-paga ou sessão de pacote): o
   * crédito decide o procedimento e o preço, e fica ligado ao agendamento.
   */
  credito?:       CreditoDeAgendamento | null
  /**
   * A oportunidade de onde o agendamento saiu (o card). Já conferida por quem
   * chama (`leadAoAlcance`). Sem ela, vale a oportunidade ABERTA da cliente.
   */
  leadId?:        string | null
}

const IGNORED_STATUS = '("CANCELLED","NO_SHOW")'

/** O agendamento mais longo que a conferência de horário considera (12 h). */
const DURACAO_MAXIMA_MS = 12 * 60 * 60_000

/**
 * O horário [inicio, inicio + duracaoMin) bate com outro agendamento ativo do
 * PROFISSIONAL (em qualquer unidade da rede — o profissional da rede atende em
 * várias) ou da SALA (na unidade dela)?
 *
 * Sobreposição de verdade, com a duração de CADA agendamento: até 2026-10-08 a
 * janela usava a duração do novo dos dois lados — um atendimento de 2 h às
 * 09:00 não bloqueava um novo às 10:00, e um de 30 min às 09:00 bloqueava um
 * longo às 10:00 —, e olhava só a unidade.
 */
export async function horarioOcupado(admin: Admin, a: {
  tenantId: string
  inicio: Date
  duracaoMin: number
  professionalId?: string | null
  roomId?: string | null
  /** A unidade da sala (obrigatória com `roomId`). */
  branchId?: string | null
  /** O próprio agendamento, na remarcação. */
  excluir?: string | null
}): Promise<boolean> {
  if (!a.professionalId && !a.roomId) return false
  const ini = a.inicio.getTime()
  const fim = ini + Math.max(1, a.duracaoMin) * 60000
  let q = admin.from('appointments')
    .select('id, scheduled_at, duration_min, branches!inner(tenant_id)')
    .eq('branches.tenant_id', a.tenantId)
    .not('status', 'in', IGNORED_STATUS)
    .lt('scheduled_at', new Date(fim).toISOString())
    .gt('scheduled_at', new Date(ini - DURACAO_MAXIMA_MS).toISOString())
  if (a.professionalId) q = q.eq('professional_id', a.professionalId)
  else q = q.eq('room_id', a.roomId!).eq('branch_id', a.branchId!)
  if (a.excluir) q = q.neq('id', a.excluir)
  const candidatos = (await ler(q.order('scheduled_at', { ascending: false }).limit(200), 'conferir o horário') as { scheduled_at: string; duration_min: number | null }[] | null) ?? []
  return candidatos.some(c => {
    const oIni = new Date(c.scheduled_at).getTime()
    const oFim = oIni + (c.duration_min || 60) * 60000
    return ini < oFim && fim > oIni
  })
}

/**
 * As peças de um agendamento que vêm do navegador são DA REDE, e a unidade
 * está ao alcance de quem agenda (§11). Devolve a mensagem de recusa, ou null.
 *
 * Mora aqui para servir a TODO caminho que cria ou move agendamento: o núcleo
 * (agenda e comercial), o checkout do plano, a sessão de pacote e de plano, a
 * remarcação e a troca de profissional. Até 2026-09-28 só o núcleo conferia —
 * os outros gravavam a unidade e o profissional que o navegador mandasse.
 * Campo ausente não é conferido (quem chama decide o que é obrigatório).
 */
export async function conferirPecasDoAgendamento(
  admin: Admin,
  ctx: TenantContext,
  pecas: {
    branchId?: string | null; professionalId?: string | null; clientId?: string | null; roomId?: string | null
    /** Com a sala: o procedimento, para conferir que a sala serve a ele (D5). */
    procedureId?: string | null
  },
): Promise<string | null> {
  if (pecas.branchId && ctx.branchId && pecas.branchId !== ctx.branchId) {
    return 'Você só pode agendar na sua unidade.'
  }
  const [unidade, profissional, cliente, recusaSala] = await Promise.all([
    pecas.branchId
      ? ler(admin.from('branches').select('id')
          .eq('id', pecas.branchId).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar a unidade')
      : Promise.resolve({ id: null }),
    pecas.professionalId
      ? ler(admin.from('users').select('id')
          .eq('id', pecas.professionalId).eq('tenant_id', ctx.tenantId!).eq('is_active', true).maybeSingle(), 'buscar o profissional')
      : Promise.resolve({ id: null }),
    pecas.clientId
      ? ler(admin.from('clients').select('id')
          .eq('id', pecas.clientId).eq('tenant_id', ctx.tenantId!).maybeSingle(), 'buscar o cliente')
      : Promise.resolve({ id: null }),
    // A sala ATIVA da unidade e, com o procedimento ligado a salas ali, uma
    // das dele (D5, 2026-10-30). Sala sem unidade não se confere: não há onde.
    pecas.roomId && pecas.branchId
      ? recusaDaSala(admin, { branchId: pecas.branchId, roomId: pecas.roomId, procedureId: pecas.procedureId })
      : Promise.resolve(pecas.roomId ? 'Sala não encontrada nesta unidade.' : null),
  ])
  if (!unidade)      return 'Filial não encontrada.'
  if (!profissional) return 'Profissional não encontrado.'
  if (!cliente)      return 'Cliente não encontrado.'
  if (recusaSala)    return recusaSala
  return null
}

/**
 * Cria um agendamento aplicando toda a regra de negócio. Recebe o contexto já
 * resolvido (de cookies OU de token) — não depende de FormData nem de cookies.
 * Não dispara notificação nem revalidate: isso fica a cargo de quem chama.
 */
export async function createAppointmentCore(
  admin: Admin,
  ctx: TenantContext,
  input: CreateAppointmentInput,
): Promise<{ id: string } | { error: string }> {
  if (!input.branchId)                              return { error: 'Filial não identificada.' }
  if (!input.clientId)                              return { error: 'Selecione um cliente.' }

  // O crédito vem primeiro: é ele que diz o procedimento e o preço. Um
  // procedimento diferente do crédito é recusado (o navegador não escolhe).
  let doCredito: { procedureId: string; preco: number } | null = null
  if (input.credito) {
    const c = await conferirCredito(admin, ctx.tenantId!, input.clientId, input.credito)
    if ('error' in c) return { error: c.error }
    if (input.procedureId && input.procedureId !== c.procedureId) return { error: 'Este crédito é de outro procedimento.' }
    doCredito = c
    input = { ...input, procedureId: c.procedureId }
  }
  // Não há mais agendamento sem procedimento. A avaliação era a exceção que
  // permitia isso — e virou um procedimento como outro qualquer (2026-09-25).
  if (!input.procedureId)                          return { error: 'Selecione um procedimento.' }
  if (!input.professionalId)                        return { error: 'Selecione um profissional.' }
  if (!input.scheduledAt)                           return { error: 'Informe data e hora.' }

  // Tudo que vem do navegador tem de ser DA REDE, e a unidade ao alcance de
  // quem agenda (§11). Até 2026-09-27 só o procedimento era conferido.
  const recusa = await conferirPecasDoAgendamento(admin, ctx, input)
  if (recusa) return { error: recusa }

  // Preço/duração do procedimento (quando houver)
  let procedure: { price: number; duration_min: number } | null = null
  if (input.procedureId) {
    const { data, error } = await admin
      .from('procedures')
      .select('price, duration_min')
      .eq('id', input.procedureId)
      .eq('tenant_id', ctx.tenantId!)
      .single()
    if (error || !data) return { error: 'Procedimento não encontrado.' }
    procedure = data
  }

  const durationMin = procedure?.duration_min ?? 60
  const start       = new Date(input.scheduledAt)

  // Conflito de SALA (quando há sala + duração)
  if (input.roomId && procedure && await horarioOcupado(admin, {
    tenantId: ctx.tenantId!, roomId: input.roomId, branchId: input.branchId, inicio: start, duracaoMin: durationMin,
  })) {
    return { error: 'Esta sala já está ocupada nesse horário.' }
  }

  // Conflito de PROFISSIONAL (sempre) — impede duplo-agendamento do mesmo profissional
  if (await horarioOcupado(admin, {
    tenantId: ctx.tenantId!, professionalId: input.professionalId, inicio: start, duracaoMin: durationMin,
  })) {
    return { error: 'Este profissional já tem agendamento nesse horário.' }
  }

  // A cliente tem oportunidade aberta? Então o agendamento é do comercial
  // (D11, 2026-10-27): a origem não depende de quem agenda nem de por onde — o
  // SDR de unidade e a recepção que agenda pela ficha também contam. A cliente
  // que agenda sozinha pelo app segue CLIENT_APP.
  const oportunidade = await oportunidadeDoAgendamento(admin, ctx, input.clientId, input.leadId)
  const origem = oportunidade?.aberta && (input.source ?? 'INTERNAL') === 'INTERNAL' ? 'COMMERCIAL' : (input.source ?? 'INTERNAL')

  const { data, error } = await admin
    .from('appointments')
    .insert({
      branch_id:       input.branchId,
      client_id:       input.clientId,
      procedure_id:    input.procedureId || null,
      professional_id: input.professionalId,
      room_id:         input.roomId ?? null,
      scheduled_at:    input.scheduledAt,
      duration_min:    durationMin,
      // Com crédito, o preço é a parte dele na venda (já paga).
      price:           doCredito ? doCredito.preco : (procedure?.price ?? 0),
      notes:           input.notes ?? null,
      status:          'SCHEDULED',
      source:          origem,
      created_by_id:   ctx.internalUserId,
    })
    .select('id')
    .single()

  if (error || !data) return { error: `Erro ao criar agendamento: ${error?.message ?? 'desconhecido'}` }

  // Liga o crédito, só se ainda estiver livre. Perdeu a corrida (outro
  // agendamento o pegou no meio): o agendamento sai, antes de virar fato.
  if (input.credito && !(await ligarCredito(admin, input.credito, data.id as string))) {
    await tentar(admin.from('appointments').delete().eq('id', data.id as string), 'desfazer o agendamento sem crédito')
    return { error: 'Este crédito acabou de ser usado em outro agendamento.' }
  }

  const userName = ctx.userName || await getUserName(admin, ctx.userId)
  await logAppointmentHistory(admin, data.id as string, ctx.internalUserId, userName, 'CREATED', 'Agendamento criado')

  // O card anda para "agendado" e a linha do tempo dele diz o que houve.
  if (oportunidade) {
    await ligarAgendamentoAOportunidade(admin, ctx, oportunidade, { procedureId: input.procedureId, scheduledAt: input.scheduledAt })
  }

  // A corrente de eventos. Sai daqui, e não das actions que chamam este core,
  // porque são quatro caminhos de criação (agenda, inbox, checkout de plano,
  // portal do cliente) e o fato é o mesmo — emitir em cada um seria esquecer
  // o quinto.
  await emitirEventoDeAgendamento(EVENTOS.AGENDAMENTO_CRIADO, data.id as string, { ...ctx, userName })

  // Meta: agendar é o primeiro compromisso real de quem veio de um anúncio, e
  // é o evento pelo qual a campanha é otimizada. Vai em `after()` para não
  // somar a latência da Graph API ao tempo de criar o agendamento, e nunca
  // lança: anúncio não pode derrubar agenda.
  after(async () => {
    const clique = await cliqueDoCliente(ctx.tenantId!, input.clientId!)
    if (!clique) return
    const contato = await contatoDoCliente(ctx.tenantId!, input.clientId!)
    await enviarEventoCapi({
      tenantId: ctx.tenantId!,
      event:    'Schedule',
      // Determinístico: o mesmo agendamento nunca conta duas vezes, mesmo se
      // este caminho rodar de novo.
      eventId:  `schedule:${data.id}`,
      ctwaClid: clique.ctwaClid,
      adId:     clique.adId,
      phone:    contato.phone,
      email:    contato.email,
      customData: { procedure_id: input.procedureId ?? null },
    })
  })

  return { id: data.id as string }
}

/**
 * Slots livres de 30 min de um profissional num dia, dentro do HORÁRIO da
 * unidade e do dele (`lib/agenda/horario.ts`, 2026-10-21 — eram fixos em
 * 08–20, domingo inclusive), descontando os já ocupados e, hoje, o que já
 * passou (o app oferecia horários vencidos e só recusava no último passo).
 * Reutilizável por qualquer role — o caller valida acesso.
 */
export async function computeAvailableSlots(
  admin: Admin,
  branchId: string,
  professionalId: string,
  date: string,
  durationMin: number,
  /** Ao REMARCAR, o próprio agendamento não ocupa o horário que vai deixar (A44). */
  ignorarAgendamentoId?: string,
): Promise<string[]> {
  const dayStart = new Date(`${date}T00:00:00-03:00`).toISOString()
  const dayEnd   = new Date(`${date}T23:59:59-03:00`).toISOString()

  const [unidade, prof] = await Promise.all([
    ler(admin.from('branches').select('horario').eq('id', branchId).maybeSingle(), 'buscar o horário da unidade'),
    ler(admin.from('users').select('horario').eq('id', professionalId).maybeSingle(), 'buscar o horário do profissional'),
  ])
  const intervalos = intervalosDoDia(
    normalizarHorario((unidade as { horario?: unknown } | null)?.horario),
    normalizarHorario((prof as { horario?: unknown } | null)?.horario),
    diaDaSemana(date),
  )
  if (!intervalos.length) return []

  // O profissional em QUALQUER unidade (o da rede atende em várias; o id do
  // profissional já é de uma rede só), e o que começou antes e ainda ocupa o
  // começo do dia (2026-10-08).
  const booked = await ler(admin
    .from('appointments')
    .select('id, scheduled_at, duration_min')
    .eq('professional_id', professionalId)
    .gte('scheduled_at', new Date(new Date(dayStart).getTime() - DURACAO_MAXIMA_MS).toISOString())
    .lt('scheduled_at', dayEnd)
    .not('status', 'in', IGNORED_STATUS), 'carregar os agendamentos')

  const occupied = (booked ?? []).filter((b) => b.id !== ignorarAgendamentoId).map((b) => ({
    start: new Date(b.scheduled_at as string).getTime(),
    end:   new Date(b.scheduled_at as string).getTime() + (Number(b.duration_min) || 60) * 60000,
  }))
  const agora = Date.now()

  return slotsDoDia(intervalos, durationMin).filter((slot) => {
    const slotStart = new Date(`${date}T${slot}:00-03:00`).getTime()
    const slotEnd   = slotStart + durationMin * 60000
    if (slotStart <= agora) return false
    return !occupied.some((o) => slotStart < o.end && slotEnd > o.start)
  })
}

/**
 * As profissionais que atendem na unidade (a da rede atende em todas:
 * `filtroDeQuemAtendeNaUnidade`), cada uma com os livres do dia e quantos
 * atendimentos já tem nele — a base do "Sem preferência" do app (D-16). Os
 * livres são os de `computeAvailableSlots`, a mesma conta da escolhida.
 */
export async function candidatasDoDia(
  admin: Admin, tenantId: string, branchId: string, date: string, durationMin: number,
): Promise<CandidataDoHorario[]> {
  const equipe = ((await ler(admin.from('users').select('id, name')
    .eq('tenant_id', tenantId)
    .or(filtroDeQuemAtendeNaUnidade(branchId))
    .eq('provides_services', true)
    .eq('is_active', true)
    .order('name'), 'carregar quem atende na unidade')) ?? []) as { id: string; name: string }[]
  if (!equipe.length) return []

  const dayStart = new Date(`${date}T00:00:00-03:00`).toISOString()
  const dayEnd   = new Date(`${date}T23:59:59-03:00`).toISOString()
  const [livres, doDia] = await Promise.all([
    Promise.all(equipe.map(p => computeAvailableSlots(admin, branchId, p.id, date, durationMin))),
    ler(admin.from('appointments').select('professional_id')
      .in('professional_id', equipe.map(p => p.id))
      .gte('scheduled_at', dayStart).lte('scheduled_at', dayEnd)
      .not('status', 'in', IGNORED_STATUS), 'contar os atendimentos do dia'),
  ])
  const conta = new Map<string, number>()
  for (const a of (doDia ?? []) as { professional_id: string }[]) conta.set(a.professional_id, (conta.get(a.professional_id) ?? 0) + 1)
  return equipe.map((p, i) => ({ id: p.id, nome: p.name, livres: livres[i] ?? [], atendimentosNoDia: conta.get(p.id) ?? 0 }))
}

/** Notifica cliente + profissional de um novo agendamento (via after()). */
export function notifyAppointmentCreated(appointmentId: string): void {
  const avisarCliente = notificadorDoCliente()
  after(async () => {
    const admin = createAdminClient()
    const data = await ler(admin
      .from('appointments')
      .select('client_id, professional_id, scheduled_at, clients(name), procedures(name)')
      .eq('id', appointmentId)
      .maybeSingle(), 'buscar o agendamento')
    if (!data) return

    const clientId       = data.client_id as string
    const professionalId = (data.professional_id ?? null) as string | null
    const clientName     = (data.clients as unknown as { name?: string } | null)?.name ?? 'Cliente'
    const procedureName  = (data.procedures as unknown as { name?: string } | null)?.name ?? 'Atendimento'
    let when = ''
    try { when = format(new Date(data.scheduled_at as string), "dd/MM 'às' HH:mm", { locale: ptBR }) } catch { /* ignore */ }

    const payload = { appointment_id: appointmentId }
    await avisarCliente(admin, clientId, {
      // "Marcado", não "confirmado": a clínica ainda não confirmou (simulação de 2026-10-20).
      type: 'appointment_confirmed', title: 'Horário marcado',
      body: `${procedureName} em ${when}.`, data: payload,
    })
    await avisarDoPreAtendimento(admin, avisarCliente, appointmentId)
    if (professionalId) {
      await notifyUser(admin, professionalId, {
        type: 'appointment_new', title: 'Novo agendamento',
        body: `${clientName} — ${procedureName} em ${when}.`, data: payload,
      })
    }
  })
}

// ─── helpers ──────────────────────────────────────────────────────
export async function getUserName(admin: Admin, authId: string): Promise<string> {
  const data = await ler(admin.from('users').select('name').eq('auth_id', authId).maybeSingle(), 'buscar o usuário')
  return data?.name ?? 'Usuário'
}

async function logAppointmentHistory(
  admin: Admin,
  appointmentId: string,
  internalUserId: string | null,
  userName: string,
  action: string,
  description: string,
): Promise<void> {
  if (!internalUserId) return
  await tentar(admin.from('appointment_history').insert({
    appointment_id:  appointmentId,
    changed_by_id:   internalUserId,
    changed_by_name: userName,
    action,
    description,
    metadata: null,
  }), 'registrar no histórico do agendamento')
}
