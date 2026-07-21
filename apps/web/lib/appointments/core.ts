// Núcleo de agendamento reutilizável — usado tanto pela server action interna
// (addAppointment, cookies) quanto pela API REST da extensão (/api/ext, Bearer).
// Contém a REGRA de negócio (preço/duração, conflito de sala E de profissional,
// insert, histórico) desacoplada de FormData/cookies. Sem 'use server'.

import { after } from 'next/server'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import type { TenantContext } from '@estetica-os/types'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyClient, notifyUser } from '@/lib/notifications/notify'

type Admin = ReturnType<typeof createAdminClient>

export interface CreateAppointmentInput {
  branchId:       string
  clientId:       string
  procedureId:    string | null
  professionalId: string
  scheduledAt:    string                 // ISO UTC
  roomId?:        string | null
  notes?:         string | null
  isEvaluation?:  boolean
  source?:        'INTERNAL' | 'ONLINE' | 'CLIENT_APP' | 'COMMERCIAL'
}

const IGNORED_STATUS = '("CANCELLED","NO_SHOW")'

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
  if (!input.isEvaluation && !input.procedureId)    return { error: 'Selecione um procedimento.' }
  if (!input.professionalId)                        return { error: 'Selecione um profissional.' }
  if (!input.scheduledAt)                           return { error: 'Informe data e hora.' }

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
  const windowEnd   = new Date(start.getTime() + durationMin * 60000).toISOString()
  const windowStart = new Date(start.getTime() - durationMin * 60000).toISOString()

  // Conflito de SALA (quando há sala + duração)
  if (input.roomId && procedure) {
    const { data: conflict } = await admin
      .from('appointments')
      .select('id')
      .eq('branch_id', input.branchId)
      .eq('room_id', input.roomId)
      .not('status', 'in', IGNORED_STATUS)
      .lt('scheduled_at', windowEnd)
      .gt('scheduled_at', windowStart)
      .maybeSingle()
    if (conflict) return { error: 'Esta sala já está ocupada nesse horário.' }
  }

  // Conflito de PROFISSIONAL (sempre) — impede duplo-agendamento do mesmo profissional
  {
    const { data: conflict } = await admin
      .from('appointments')
      .select('id')
      .eq('branch_id', input.branchId)
      .eq('professional_id', input.professionalId)
      .not('status', 'in', IGNORED_STATUS)
      .lt('scheduled_at', windowEnd)
      .gt('scheduled_at', windowStart)
      .maybeSingle()
    if (conflict) return { error: 'Este profissional já tem agendamento nesse horário.' }
  }

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
      price:           procedure?.price ?? 0,
      notes:           input.notes ?? null,
      status:          'SCHEDULED',
      source:          input.source ?? 'INTERNAL',
      is_evaluation:   input.isEvaluation ?? false,
      created_by_id:   ctx.internalUserId,
    })
    .select('id')
    .single()

  if (error || !data) return { error: `Erro ao criar agendamento: ${error?.message ?? 'desconhecido'}` }

  const userName = await getUserName(admin, ctx.userId)
  await logAppointmentHistory(admin, data.id as string, ctx.internalUserId, userName, 'CREATED', 'Agendamento criado')

  return { id: data.id as string }
}

/**
 * Slots livres de 30min (08:00–20:00, UTC-3) de um profissional num dia,
 * descontando os já ocupados. Reutilizável por qualquer role — o caller valida acesso.
 */
export async function computeAvailableSlots(
  admin: Admin,
  branchId: string,
  professionalId: string,
  date: string,
  durationMin: number,
): Promise<string[]> {
  const dayStart = new Date(`${date}T08:00:00-03:00`).toISOString()
  const dayEnd   = new Date(`${date}T20:00:00-03:00`).toISOString()

  const { data: booked } = await admin
    .from('appointments')
    .select('scheduled_at, duration_min')
    .eq('branch_id', branchId)
    .eq('professional_id', professionalId)
    .gte('scheduled_at', dayStart)
    .lt('scheduled_at', dayEnd)
    .not('status', 'in', IGNORED_STATUS)

  const allSlots: string[] = []
  for (let h = 8; h < 20; h++) {
    for (const m of [0, 30]) {
      allSlots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
    }
  }

  const occupied = (booked ?? []).map((b) => ({
    start: new Date(b.scheduled_at as string).getTime(),
    end:   new Date(b.scheduled_at as string).getTime() + Number(b.duration_min) * 60000,
  }))

  const cutoff = new Date(`${date}T20:00:00-03:00`).getTime()

  return allSlots.filter((slot) => {
    const [hh, mm]  = slot.split(':').map(Number)
    const slotStart = new Date(`${date}T${String(hh!).padStart(2, '0')}:${String(mm!).padStart(2, '0')}:00-03:00`).getTime()
    const slotEnd   = slotStart + durationMin * 60000
    if (slotEnd > cutoff) return false
    return !occupied.some((o) => slotStart < o.end && slotEnd > o.start)
  })
}

/** Notifica cliente + profissional de um novo agendamento (via after()). */
export function notifyAppointmentCreated(appointmentId: string): void {
  after(async () => {
    const admin = createAdminClient()
    const { data } = await admin
      .from('appointments')
      .select('client_id, professional_id, scheduled_at, clients(name), procedures(name)')
      .eq('id', appointmentId)
      .maybeSingle()
    if (!data) return

    const clientId       = data.client_id as string
    const professionalId = (data.professional_id ?? null) as string | null
    const clientName     = (data.clients as unknown as { name?: string } | null)?.name ?? 'Cliente'
    const procedureName  = (data.procedures as unknown as { name?: string } | null)?.name ?? 'Atendimento'
    let when = ''
    try { when = format(new Date(data.scheduled_at as string), "dd/MM 'às' HH:mm", { locale: ptBR }) } catch { /* ignore */ }

    const payload = { appointment_id: appointmentId }
    await notifyClient(admin, clientId, {
      type: 'appointment_confirmed', title: 'Agendamento confirmado',
      body: `${procedureName} em ${when}.`, data: payload,
    })
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
  const { data } = await admin.from('users').select('name').eq('auth_id', authId).maybeSingle()
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
  await admin.from('appointment_history').insert({
    appointment_id:  appointmentId,
    changed_by_id:   internalUserId,
    changed_by_name: userName,
    action,
    description,
    metadata: null,
  })
}
