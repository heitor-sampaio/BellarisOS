import 'server-only'
import { after } from 'next/server'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler, tentar } from '@/lib/db'
import { notificadorDoCliente, notifyUser } from '@/lib/notifications/notify'
import { notificarInteressados } from '@/lib/notifications/interessados'

/**
 * O histórico e os avisos da AGENDA, divididos pelas actions (actions/appointments.ts)
 * e pelo Copilot (lib/copilot/ferramentas): saíram de dentro da action em
 * 2026-10-08, para quem grava pelo Copilot avisar exatamente como a tela.
 */

// --- Helpers internos ---------------------------------------------
export async function getUserName(admin: ReturnType<typeof createAdminClient>, authId: string): Promise<string> {
  const data = await ler(admin.from('users').select('name').eq('auth_id', authId).maybeSingle(), 'buscar o usuário')
  return data?.name ?? 'Usuário'
}

export async function logHistory(
  admin: ReturnType<typeof createAdminClient>,
  appointmentId: string,
  internalUserId: string | null,
  userName: string,
  action: string,
  description: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  if (!internalUserId) return
  await tentar(admin.from('appointment_history').insert({
    appointment_id:  appointmentId,
    changed_by_id:   internalUserId,
    changed_by_name: userName,
    action,
    description,
    metadata: metadata ?? null,
  }), 'registrar no histórico do agendamento')
}

// ─── Notificações de eventos de agendamento ───────────────────────────────────
// Disparadas via after() — rodam APÓS a resposta da action, sem atrasá-la.

export function fmtDateTime(iso: string): string {
  try { return format(new Date(iso), "dd/MM 'às' HH:mm", { locale: ptBR }) } catch { return '' }
}

export type ApptCtx = {
  clientId: string; professionalId: string | null
  /** Unidade onde o fato aconteceu — e ela que define quem e responsavel. */
  branchId: string | null
  clientName: string; procedureName: string; scheduledAt: string
  slug: string
}

export async function loadApptCtx(
  admin: ReturnType<typeof createAdminClient>,
  appointmentId: string,
): Promise<ApptCtx | null> {
  const data = await ler(admin
    .from('appointments')
    .select('client_id, professional_id, branch_id, scheduled_at, clients(name), procedures(name), branches(slug)')
    .eq('id', appointmentId)
    .maybeSingle(), 'buscar o agendamento')
  if (!data) return null
  return {
    clientId:       data.client_id as string,
    professionalId: (data.professional_id ?? null) as string | null,
    branchId:       (data.branch_id ?? null) as string | null,
    clientName:     ((data.clients as unknown as { name?: string } | null)?.name ?? 'Cliente'),
    procedureName:  ((data.procedures as unknown as { name?: string } | null)?.name ?? 'Atendimento'),
    scheduledAt:    data.scheduled_at as string,
    slug:           ((data.branches as unknown as { slug?: string } | null)?.slug ?? ''),
  }
}

/**
 * Novo agendamento → cliente ('confirmado') + as partes interessadas.
 *
 * "Interessadas" não é mais só o profissional: quem gerencia a agenda da
 * unidade também precisa saber que entrou horário novo. Quem MARCOU sai da
 * lista — ver `interessadosNoFato`. Pedido do Heitor em 2026-09-25.
 */
export function notifyNewAppointment(appointmentId: string, ator?: string | null): void {
  const avisarCliente = notificadorDoCliente()
  after(async () => {
    const admin = createAdminClient()
    const c = await loadApptCtx(admin, appointmentId)
    if (!c) return
    const when = fmtDateTime(c.scheduledAt)
    const data = { appointment_id: appointmentId }
    await avisarCliente(admin, c.clientId, {
      type: 'appointment_confirmed', title: 'Agendamento confirmado',
      body: `${c.procedureName} em ${when}.`, data,
    })
    await notificarInteressados(admin,
      { modulo: 'agenda', branchId: c.branchId, envolvidos: [c.professionalId], ator },
      {
        type: 'appointment_new', title: 'Novo agendamento',
        body: `${c.clientName} — ${c.procedureName} em ${when}.`, data,
      })
  })
}

/** Cancelamento → cliente + as partes interessadas. */
export function notifyCancelledAppointment(appointmentId: string, reason?: string | null, ator?: string | null): void {
  const avisarCliente = notificadorDoCliente()
  after(async () => {
    const admin = createAdminClient()
    const c = await loadApptCtx(admin, appointmentId)
    if (!c) return
    const when = fmtDateTime(c.scheduledAt)
    const motivo = reason?.trim() ? ` Motivo: ${reason.trim()}.` : ''
    const data = { appointment_id: appointmentId }
    await avisarCliente(admin, c.clientId, {
      type: 'appointment_cancelled', title: 'Agendamento cancelado',
      body: `${c.procedureName} de ${when} foi cancelado.${motivo}`, data,
    })
    await notificarInteressados(admin,
      { modulo: 'agenda', branchId: c.branchId, envolvidos: [c.professionalId], ator },
      {
        type: 'appointment_cancelled', title: 'Agendamento cancelado',
        body: `${c.clientName} — ${c.procedureName} de ${when} foi cancelado.${motivo}`, data,
      })
  })
}

/** Remarcação → cliente + as partes interessadas, com o novo horário. */
export function notifyRescheduledAppointment(appointmentId: string, ator?: string | null): void {
  const avisarCliente = notificadorDoCliente()
  after(async () => {
    const admin = createAdminClient()
    const c = await loadApptCtx(admin, appointmentId)
    if (!c) return
    const when = fmtDateTime(c.scheduledAt)
    const data = { appointment_id: appointmentId }
    await avisarCliente(admin, c.clientId, {
      type: 'appointment_rescheduled', title: 'Agendamento remarcado',
      body: `Novo horário: ${c.procedureName} em ${when}.`, data,
    })
    await notificarInteressados(admin,
      { modulo: 'agenda', branchId: c.branchId, envolvidos: [c.professionalId], ator },
      {
        type: 'appointment_rescheduled', title: 'Agendamento remarcado',
        body: `${c.clientName} — novo horário: ${when}.`, data,
      })
  })
}

/**
 * Check-in → profissional, e só ele.
 *
 * Aqui a parte interessada é uma: quem vai atender precisa saber que a pessoa
 * chegou. Avisar a gerência de cada chegada seria um sino tocando o dia
 * inteiro — e sino que toca sempre deixa de ser lido.
 */
export function notifyCheckin(appointmentId: string): void {
  after(async () => {
    const admin = createAdminClient()
    const c = await loadApptCtx(admin, appointmentId)
    if (!c?.professionalId) return
    await notifyUser(admin, c.professionalId, {
      type: 'client_checkin', title: 'Cliente chegou',
      body: `${c.clientName} fez check-in para ${c.procedureName}.`,
      data: { appointment_id: appointmentId },
    })
  })
}

/** Conclusão → cliente: pedir confirmação + avaliação do atendimento. */
export function notifyCompleted(appointmentId: string): void {
  const avisarCliente = notificadorDoCliente()
  after(async () => {
    const admin = createAdminClient()
    const c = await loadApptCtx(admin, appointmentId)
    if (!c) return
    await avisarCliente(admin, c.clientId, {
      type: 'appointment_completed', title: 'Confirme seu atendimento',
      body: `Seu ${c.procedureName} foi concluído. Confirme e avalie pelo app.`,
      data: {
        appointment_id: appointmentId,
        link: c.slug ? `/${c.slug}/cliente/atendimentos/${appointmentId}/confirmar` : undefined,
      },
    })
  })
}

/** Pagamento confirmado → cliente. */
export function notifyPayment(appointmentId: string): void {
  const avisarCliente = notificadorDoCliente()
  after(async () => {
    const admin = createAdminClient()
    const c = await loadApptCtx(admin, appointmentId)
    if (!c) return
    await avisarCliente(admin, c.clientId, {
      type: 'payment_received', title: 'Pagamento confirmado',
      body: `Pagamento do ${c.procedureName} confirmado.`,
      data: { appointment_id: appointmentId },
    })
  })
}
