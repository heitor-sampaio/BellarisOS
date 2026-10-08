import 'server-only'
import { revalidatePath, revalidateTag } from 'next/cache'
import type { TenantContext } from '@estetica-os/types'
import { EVENTOS } from '@estetica-os/types'
import { alcancaUnidade } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { gravar, ler } from '@/lib/db'
import { conferirPecasDoAgendamento, horarioOcupado } from '@/lib/appointments/core'
import { emitirEventoDeAgendamento } from '@/lib/events/agendamento'
import { getUserName, logHistory } from '@/lib/appointments/avisos'

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
}

/** O agendamento, se for da rede E de uma unidade ao alcance. */
export async function agendamentoAoAlcance(admin: Admin, ctx: TenantContext, id: string): Promise<AgendamentoAoAlcance | null> {
  const a = await ler(admin.from('appointments')
    .select('id, branch_id, status, scheduled_at, professional_id, duration_min, room_id, branches!inner(id, tenant_id)')
    .eq('id', id).maybeSingle(), 'buscar o agendamento')
  const branch = a?.branches as unknown as { id: string; tenant_id: string } | null
  if (!a || branch?.tenant_id !== ctx.tenantId || !alcancaUnidade(ctx, branch.id)) return null
  return a as unknown as AgendamentoAoAlcance
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
  if (FINALIZADOS.includes(existente.status)) return { error: 'Este agendamento já foi finalizado.' }
  const inicio = new Date(input.scheduledAt)
  if (Number.isNaN(inicio.getTime())) return { error: 'Data inválida.' }

  // O profissional novo vinha do formulário sem conferência nenhuma.
  const recusa = await conferirPecasDoAgendamento(admin, ctx, { professionalId: input.professionalId || null })
  if (recusa) return { error: recusa }

  // Conflito: remarcar para cima de outro agendamento do mesmo profissional
  // passava (a criação conferia; a remarcação, não — até 2026-10-08). Em
  // qualquer unidade da rede, com a duração de cada um (horarioOcupado).
  const profissional = input.professionalId || existente.professional_id
  if (profissional && await horarioOcupado(admin, {
    tenantId: ctx.tenantId!, professionalId: profissional, excluir: existente.id,
    inicio, duracaoMin: existente.duration_min || 60,
  })) {
    return { error: 'Este profissional já tem agendamento nesse horário.' }
  }
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
  }).eq('id', existente.id).not('status', 'in', ABERTOS_NAO).select('id'), 'reagendar') as { id: string }[] | null
  if (!remarcadas?.length) return { error: 'Este agendamento já foi finalizado.' }

  const userName = ctx.userName || await getUserName(admin, ctx.userId)
  const dtStr = inicio.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  await logHistory(admin, existente.id, ctx.internalUserId, userName, 'RESCHEDULED',
    `Reagendado para ${dtStr}`, { scheduled_at: inicio.toISOString() })
  await emitirEventoDeAgendamento(EVENTOS.AGENDAMENTO_REMARCADO, existente.id, { ...ctx, userName }, {
    deAgendadoPara: existente.scheduled_at ?? null,
  })
  return { ok: true, deAgendadoPara: existente.scheduled_at }
}

export async function cancelarCore(admin: Admin, ctx: TenantContext, input: {
  appointmentId: string; motivo: string
}): Promise<{ ok: true } | { error: string }> {
  const motivo = input.motivo.trim()
  if (!motivo) return { error: 'Informe o motivo do cancelamento.' }
  const existente = await agendamentoAoAlcance(admin, ctx, input.appointmentId)
  if (!existente) return { error: 'Agendamento não encontrado.' }
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
  revalidateTag(`appointments:${ctx.tenantId!}`, 'max')
}

/**
 * O CHECK-IN ("o cliente chegou") — o núcleo da agenda e do Copilot
 * (2026-10-08). Só de "agendado", com a guarda do status na própria escrita.
 * O aviso (`notifyCheckin`) é do chamador.
 */
export async function checkinCore(admin: Admin, ctx: TenantContext, appointmentId: string): Promise<{ ok: true } | { error: string }> {
  const existente = await agendamentoAoAlcance(admin, ctx, appointmentId)
  if (!existente) return { error: 'Agendamento não encontrado.' }
  if (existente.status !== 'SCHEDULED') return { error: 'Check-in só é possível em agendamentos com status Agendado.' }
  const feitas = await gravar(admin.from('appointments')
    .update({ status: 'CONFIRMED', confirmed_at: new Date().toISOString() })
    .eq('id', existente.id).eq('status', 'SCHEDULED').select('id'), 'registrar a chegada do cliente') as { id: string }[] | null
  if (!feitas?.length) return { error: 'O agendamento mudou de situação. Confira na agenda.' }

  const userName = ctx.userName || await getUserName(admin, ctx.userId)
  await logHistory(admin, existente.id, ctx.internalUserId, userName, 'CHECKIN', 'Check-in realizado — cliente chegou')
  await emitirEventoDeAgendamento(EVENTOS.AGENDAMENTO_CHECK_IN, existente.id, { ...ctx, userName })
  return { ok: true }
}
