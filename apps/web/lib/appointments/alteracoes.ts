import 'server-only'
import { revalidatePath, revalidateTag } from 'next/cache'
import type { TenantContext } from '@estetica-os/types'
import { EVENTOS } from '@estetica-os/types'
import { alcancaOAgendamento, alcancaUnidade, isOwnScope } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { gravar, ler } from '@/lib/db'
import { conferirPecasDoAgendamento, horarioOcupado, primeiroConflito, recusaDoConflito } from '@/lib/appointments/core'
import { emitirEventoDeAgendamento } from '@/lib/events/agendamento'
import { getUserName, logHistory } from '@/lib/appointments/avisos'
import { ehODiaDoAgendamento } from '@/lib/agenda/chegada'
import { fusoValido } from '@/lib/unidades/fuso'
import { recusaDeQuemNaoAtende, textoDaTroca } from '@/lib/appointments/troca-de-profissional'
import { pagosAntes } from '@/lib/appointments/pago-antes'
import { precoDoProcedimentoNaUnidade } from '@/lib/procedimentos/preco-na-unidade'

/**
 * REMARCAR e CANCELAR um agendamento — os núcleos que a agenda (actions/
 * appointments.ts) e o Copilot dividem (2026-10-08). Como o
 * `createAppointmentCore`: não conferem o MÓDULO (quem chama confere — a tela
 * com `assertPermission`, o Copilot pelo executor), conferem tudo o mais
 * (rede, unidade ao alcance, peças, conflito). Não avisam: o aviso é do
 * chamador (`notifyRescheduledAppointment`/`notifyCancelledAppointment`),
 * depois que a resposta sai.
 */

type Admin = ReturnType<typeof createAdminClient>

/** Os status que já não se remarcam nem se cancelam. */
const ABERTOS_NAO = '("COMPLETED","CANCELLED","NO_SHOW")'
const FINALIZADOS = ['COMPLETED', 'CANCELLED', 'NO_SHOW']

export interface AgendamentoAoAlcance {
  id: string; branch_id: string; status: string; scheduled_at: string
  professional_id: string | null; duration_min: number; room_id: string | null
  /** O fuso da unidade (F62): o dia e a hora do agendamento são os do relógio dela. */
  fuso: string
}

/** A recusa de quem tem a agenda "só os meus" num agendamento de outro profissional. */
export const DE_OUTRO_PROFISSIONAL = 'Este agendamento é de outro profissional.'

/**
 * Com a agenda "só os meus" (OWN), o agendamento de OUTRO profissional está
 * fora do escopo também pelo id (§11; D4 da simulação de 2026-10-28: a
 * profissional abria pela URL o atendimento de outra e marcava o check-in).
 * Quem tem ALL — a recepção — segue mexendo no de todos.
 */
export function deOutroProfissional(ctx: TenantContext, professionalId: string | null | undefined): boolean {
  return isOwnScope(ctx, 'agenda') && (!ctx.internalUserId || professionalId !== ctx.internalUserId)
}

/**
 * O agendamento, se for da rede E de uma unidade ao alcance — ou dela mesma,
 * numa unidade em que atende (decisão 2 da 8ª simulação, `alcancaOAgendamento`).
 */
export async function agendamentoAoAlcance(admin: Admin, ctx: TenantContext, id: string): Promise<AgendamentoAoAlcance | null> {
  const a = await ler(admin.from('appointments')
    .select('id, branch_id, status, scheduled_at, professional_id, duration_min, room_id, branches!inner(id, tenant_id, fuso)')
    .eq('id', id).maybeSingle(), 'buscar o agendamento')
  const branch = a?.branches as unknown as { id: string; tenant_id: string; fuso: string | null } | null
  if (!a || branch?.tenant_id !== ctx.tenantId || !alcancaOAgendamento(ctx, branch.id, a.professional_id as string | null)) return null
  return { ...(a as unknown as AgendamentoAoAlcance), fuso: fusoValido(branch.fuso) }
}

export async function remarcarCore(admin: Admin, ctx: TenantContext, input: {
  appointmentId: string
  /** ISO, em UTC. */
  scheduledAt: string
  /** Vazio: fica o profissional de antes. */
  professionalId?: string | null
}): Promise<{ ok: true; deAgendadoPara: string } | { error: string }> {
  const existente = await agendamentoAoAlcance(admin, ctx, input.appointmentId)
  if (!existente) return { error: 'Agendamento não encontrado.' }
  if (deOutroProfissional(ctx, existente.professional_id)) return { error: DE_OUTRO_PROFISSIONAL }
  if (FINALIZADOS.includes(existente.status)) return { error: 'Este agendamento já foi finalizado.' }
  // O atendimento já começou: o horário dele é o que está acontecendo (C15, F65).
  if (existente.status === 'IN_PROGRESS') return { error: 'Este agendamento está em atendimento agora: não se remarca. Para desistir, use "Cancelar" no atendimento.' }
  const inicio = new Date(input.scheduledAt)
  if (Number.isNaN(inicio.getTime())) return { error: 'Data inválida.' }

  // O profissional novo vinha do formulário sem conferência nenhuma.
  const recusa = await conferirPecasDoAgendamento(admin, ctx, { professionalId: input.professionalId || null })
  if (recusa) return { error: recusa }
  // Outra profissional (o arraste para outra coluna — A22 da 8ª): ela tem de
  // atender NA UNIDADE do agendamento (o "Atende" por unidade, decisão 2).
  const trocaDe = input.professionalId && input.professionalId !== existente.professional_id ? input.professionalId : null
  if (trocaDe) {
    const naoAtende = await recusaDeQuemNaoAtende(admin, ctx.tenantId!, trocaDe, existente.branch_id)
    if (naoAtende) return { error: naoAtende }
  }

  // Conflito: remarcar para cima de outro agendamento do mesmo profissional
  // passava (a criação conferia; a remarcação, não — até 2026-10-08). Em
  // qualquer unidade da rede, com a duração de cada um (horarioOcupado).
  const profissional = input.professionalId || existente.professional_id
  const choque = profissional ? await primeiroConflito(admin, {
    tenantId: ctx.tenantId!, professionalId: profissional, excluir: existente.id,
    inicio, duracaoMin: existente.duration_min || 60,
  }) : null
  // A30: o outro atendimento de OUTRA unidade diz qual.
  if (choque) return { error: recusaDoConflito(choque, existente.branch_id) }
  // E a sala, quando o agendamento tem uma.
  if (existente.room_id && await horarioOcupado(admin, {
    tenantId: ctx.tenantId!, roomId: existente.room_id, branchId: existente.branch_id, excluir: existente.id,
    inicio, duracaoMin: existente.duration_min || 60,
  })) {
    return { error: 'Esta sala já está ocupada nesse horário.' }
  }

  // Com a guarda do status: concluído entre a leitura e a escrita não remarca.
  const remarcadas = await gravar(admin.from('appointments').update({
    scheduled_at:    inicio.toISOString(),
    professional_id: input.professionalId || undefined,
    updated_at:      new Date().toISOString(),
  }).eq('id', existente.id).not('status', 'in', ABERTOS_NAO).neq('status', 'IN_PROGRESS').select('id'), 'reagendar') as { id: string }[] | null
  if (!remarcadas?.length) return { error: 'Este agendamento já foi finalizado.' }

  const userName = ctx.userName || await getUserName(admin, ctx.userId)
  const dtStr = inicio.toLocaleString('pt-BR', { timeZone: existente.fuso, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  await logHistory(admin, existente.id, ctx.internalUserId, userName, 'RESCHEDULED',
    `Reagendado para ${dtStr}`, { scheduled_at: inicio.toISOString() })
  // A troca de profissional junto (o arraste para outra coluna): o histórico
  // diz de quem para quem (A22 da 8ª), não só "Remarcado".
  if (trocaDe) {
    const nomes = await ler(admin.from('users').select('id, name')
      .in('id', [trocaDe, ...(existente.professional_id ? [existente.professional_id] : [])]), 'buscar os profissionais') as { id: string; name: string }[] | null
    const nomeDe = (id: string | null) => (id && nomes?.find(n => n.id === id)?.name) || null
    await logHistory(admin, existente.id, ctx.internalUserId, userName, 'REASSIGNED',
      textoDaTroca(nomeDe(existente.professional_id), nomeDe(trocaDe) ?? trocaDe),
      { old_professional_id: existente.professional_id, new_professional_id: trocaDe })
  }
  await emitirEventoDeAgendamento(EVENTOS.AGENDAMENTO_REMARCADO, existente.id, { ...ctx, userName }, {
    deAgendadoPara: existente.scheduled_at ?? null,
  })
  return { ok: true, deAgendadoPara: existente.scheduled_at }
}

/**
 * MUDAR A UNIDADE de um agendamento (A33 da 9ª simulação, 2026-11-07; H5: "a
 * cliente é da clínica, pode agendar em qualquer unidade"): mover a sessão da
 * Luana para a Menino Deus exigia cancelar e refazer. O horário fica (mudar o
 * horário é o remarcar); a profissional é uma que ATENDE na unidade nova
 * (`recusaDeQuemNaoAtende`) e está livre, a sala (opcional) é da unidade nova e
 * livre, e quem muda alcança as DUAS unidades. O avulso passa ao preço da
 * unidade nova (D2); o que já foi pago (pacote, plano, pré-pago) ou tem
 * lançamento fica com o preço que tinha. O histórico diz de onde para onde.
 */
export async function mudarUnidadeCore(admin: Admin, ctx: TenantContext, input: {
  appointmentId: string; branchId: string; professionalId: string; roomId?: string | null
}): Promise<{ ok: true; de: string; para: string } | { error: string }> {
  const existente = await agendamentoAoAlcance(admin, ctx, input.appointmentId)
  if (!existente || !alcancaUnidade(ctx, existente.branch_id)) return { error: 'Agendamento não encontrado.' }
  if (deOutroProfissional(ctx, existente.professional_id)) return { error: DE_OUTRO_PROFISSIONAL }
  if (!['SCHEDULED', 'CONFIRMED'].includes(existente.status)) {
    return { error: 'Só o agendamento que ainda não começou muda de unidade.' }
  }
  if (input.branchId === existente.branch_id) return { error: 'O agendamento já é desta unidade.' }
  if (!alcancaUnidade(ctx, input.branchId)) return { error: 'Unidade não encontrada.' }

  const ag = await ler(admin.from('appointments').select('procedure_id, procedures(price)')
    .eq('id', existente.id).maybeSingle(), 'buscar o procedimento do agendamento') as
    { procedure_id: string | null; procedures: { price: number | null } | null } | null
  const procedureId = ag?.procedure_id ?? null
  const recusa = await conferirPecasDoAgendamento(admin, ctx, {
    branchId: input.branchId, professionalId: input.professionalId, roomId: input.roomId ?? null, procedureId,
  })
  if (recusa) return { error: recusa }
  const naoAtende = await recusaDeQuemNaoAtende(admin, ctx.tenantId!, input.professionalId, input.branchId)
  if (naoAtende) return { error: naoAtende }
  const inicio = new Date(existente.scheduled_at)
  const duracaoMin = existente.duration_min || 60
  const choque = await primeiroConflito(admin, {
    tenantId: ctx.tenantId!, professionalId: input.professionalId, excluir: existente.id, inicio, duracaoMin,
  })
  if (choque) return { error: recusaDoConflito(choque, input.branchId) }
  if (input.roomId && await horarioOcupado(admin, {
    tenantId: ctx.tenantId!, roomId: input.roomId, branchId: input.branchId, excluir: existente.id, inicio, duracaoMin,
  })) return { error: 'Esta sala já está ocupada nesse horário.' }

  // O preço: o avulso ainda sem lançamento passa ao da unidade nova (D2 da 9ª).
  const [jaPago, lancamentos] = await Promise.all([
    pagosAntes(admin, [existente.id]),
    ler(admin.from('financial_transactions').select('id').eq('appointment_id', existente.id)
      .or('notes.is.null,notes.neq.Estornada').limit(1), 'buscar o lançamento do agendamento') as Promise<{ id: string }[] | null>,
  ])
  const avulso = !jaPago.has(existente.id) && !(lancamentos ?? []).length && procedureId
  const precoNovo = avulso
    ? await precoDoProcedimentoNaUnidade(admin, procedureId, input.branchId, ag?.procedures?.price ?? null)
    : undefined

  const mudados = await gravar(admin.from('appointments').update({
    branch_id: input.branchId, professional_id: input.professionalId, room_id: input.roomId ?? null,
    ...(precoNovo !== undefined ? { price: precoNovo } : {}),
    updated_at: new Date().toISOString(),
  }).eq('id', existente.id).in('status', ['SCHEDULED', 'CONFIRMED']).select('id'), 'mudar a unidade do agendamento') as { id: string }[] | null
  if (!mudados?.length) return { error: 'O agendamento mudou de situação. Confira na agenda.' }

  const [unidades, nomes] = await Promise.all([
    ler(admin.from('branches').select('id, name').in('id', [existente.branch_id, input.branchId]), 'buscar as unidades') as Promise<{ id: string; name: string }[] | null>,
    ler(admin.from('users').select('id, name').in('id', [input.professionalId, ...(existente.professional_id ? [existente.professional_id] : [])]), 'buscar os profissionais') as Promise<{ id: string; name: string }[] | null>,
  ])
  const de = unidades?.find(u => u.id === existente.branch_id)?.name ?? 'outra unidade'
  const para = unidades?.find(u => u.id === input.branchId)?.name ?? 'outra unidade'
  const userName = ctx.userName || await getUserName(admin, ctx.userId)
  await logHistory(admin, existente.id, ctx.internalUserId, userName, 'BRANCH_CHANGED',
    `Unidade mudada de ${de} para ${para}`, { old_branch_id: existente.branch_id, new_branch_id: input.branchId })
  if (input.professionalId !== existente.professional_id) {
    const nomeDe = (id: string | null) => (id && nomes?.find(n => n.id === id)?.name) || null
    await logHistory(admin, existente.id, ctx.internalUserId, userName, 'REASSIGNED',
      textoDaTroca(nomeDe(existente.professional_id), nomeDe(input.professionalId) ?? input.professionalId),
      { old_professional_id: existente.professional_id, new_professional_id: input.professionalId })
  }
  await emitirEventoDeAgendamento(EVENTOS.AGENDAMENTO_REMARCADO, existente.id, { ...ctx, userName }, {
    deAgendadoPara: existente.scheduled_at ?? null,
  })
  return { ok: true, de, para }
}

export async function cancelarCore(admin: Admin, ctx: TenantContext, input: {
  appointmentId: string; motivo: string
}): Promise<{ ok: true } | { error: string }> {
  const motivo = input.motivo.trim()
  if (!motivo) return { error: 'Informe o motivo do cancelamento.' }
  const existente = await agendamentoAoAlcance(admin, ctx, input.appointmentId)
  if (!existente) return { error: 'Agendamento não encontrado.' }
  if (deOutroProfissional(ctx, existente.professional_id)) return { error: DE_OUTRO_PROFISSIONAL }
  if (FINALIZADOS.includes(existente.status)) return { error: 'Agendamento já finalizado.' }

  const canceladas = await gravar(admin.from('appointments').update({
    status: 'CANCELLED', cancelled_at: new Date().toISOString(), cancellation_reason: motivo,
  }).eq('id', existente.id).not('status', 'in', ABERTOS_NAO).select('id'), 'cancelar a sessão') as { id: string }[] | null
  if (!canceladas?.length) return { error: 'Agendamento já finalizado.' }

  const userName = ctx.userName || await getUserName(admin, ctx.userId)
  await logHistory(admin, existente.id, ctx.internalUserId, userName, 'CANCELLED', `Cancelado: ${motivo}`)
  await emitirEventoDeAgendamento(EVENTOS.AGENDAMENTO_CANCELADO, existente.id, { ...ctx, userName }, { motivo })
  return { ok: true }
}

/**
 * CONFIRMAR a presença — o núcleo da agenda e do Copilot. Só de "agendado":
 * com a guarda do status na própria escrita, o que mudou no meio não confirma.
 */
export async function confirmarCore(admin: Admin, ctx: TenantContext, appointmentId: string): Promise<{ ok: true } | { error: string }> {
  const existente = await agendamentoAoAlcance(admin, ctx, appointmentId)
  if (!existente) return { error: 'Agendamento não encontrado.' }
  if (deOutroProfissional(ctx, existente.professional_id)) return { error: DE_OUTRO_PROFISSIONAL }
  const confirmadas = await gravar(admin.from('appointments')
    .update({ status: 'CONFIRMED', confirmed_at: new Date().toISOString() })
    .eq('id', existente.id).eq('status', 'SCHEDULED').select('id'), 'confirmar o agendamento') as { id: string }[] | null
  if (!confirmadas?.length) return { error: 'O agendamento mudou de situação. Confira na agenda.' }

  const userName = ctx.userName || await getUserName(admin, ctx.userId)
  await logHistory(admin, existente.id, ctx.internalUserId, userName, 'CONFIRMED', 'Agendamento confirmado')
  await emitirEventoDeAgendamento(EVENTOS.AGENDAMENTO_CONFIRMADO, existente.id, { ...ctx, userName })
  return { ok: true }
}

/**
 * Depois de mexer num agendamento: os dois portais olham a mesma agenda
 * (confirmar pela rede aparece na unidade, e vice-versa) e o cache da rede.
 */
export function revalidarAgendamento(ctx: TenantContext, appointmentId: string, slug?: string | null): void {
  if (slug) {
    revalidatePath(`/${slug}/agenda`)
    revalidatePath(`/${slug}/agenda/${appointmentId}`)
  }
  revalidatePath('/admin/agenda')
  revalidatePath(`/admin/agenda/${appointmentId}`)
  revalidateTag(`appointments:${ctx.tenantId!}`, { expire: 0 })
}

/**
 * O CHECK-IN ("a cliente chegou") — o núcleo da agenda e do Copilot
 * (2026-10-08). Desde 2026-10-21 é um status PRÓPRIO, "Chegou" (ARRIVED, com
 * `arrived_at`): antes gravava CONFIRMED, o mesmo de "confirmou presença", e a
 * recepção não distinguia quem já estava na sala de espera. Vale de Agendado
 * (chegar também confirma) ou de Confirmado, com a guarda do status na própria
 * escrita. O aviso (`notifyCheckin`) é do chamador.
 */
export async function checkinCore(admin: Admin, ctx: TenantContext, appointmentId: string): Promise<{ ok: true } | { error: string }> {
  const existente = await agendamentoAoAlcance(admin, ctx, appointmentId)
  if (!existente) return { error: 'Agendamento não encontrado.' }
  // A recepção (ALL) marca a chegada de todos; quem é "só os meus", só a dos
  // dela (D4, 2026-10-28) — antes, "o check-in comum não confere o profissional".
  if (deOutroProfissional(ctx, existente.professional_id)) return { error: DE_OUTRO_PROFISSIONAL }
  if (existente.status !== 'SCHEDULED' && existente.status !== 'CONFIRMED') {
    return { error: 'Check-in só é possível em agendamentos Agendados ou Confirmados.' }
  }
  // A cliente chega no dia dela (A18, 2026-10-27): a chegada de amanhã ou de
  // ontem é engano. Vale para a agenda, o Copilot e "Marcar chegada e iniciar".
  if (!ehODiaDoAgendamento(existente.scheduled_at, new Date(), existente.fuso)) {
    return { error: 'A chegada só se marca no dia do agendamento.' }
  }
  const agora = new Date().toISOString()
  const feitas = await gravar(admin.from('appointments')
    .update({ status: 'ARRIVED', arrived_at: agora, ...(existente.status === 'SCHEDULED' ? { confirmed_at: agora } : {}) })
    .eq('id', existente.id).eq('status', existente.status).select('id'), 'registrar a chegada do cliente') as { id: string }[] | null
  if (!feitas?.length) return { error: 'O agendamento mudou de situação. Confira na agenda.' }

  const userName = ctx.userName || await getUserName(admin, ctx.userId)
  await logHistory(admin, existente.id, ctx.internalUserId, userName, 'CHECKIN', 'Check-in realizado — cliente chegou')
  await emitirEventoDeAgendamento(EVENTOS.AGENDAMENTO_CHECK_IN, existente.id, { ...ctx, userName })
  return { ok: true }
}
