'use server'

// Agendamento a partir do CRM (/admin) — reutiliza o núcleo createAppointmentCore.
// Garante o cliente (lead de rede -> cliente de rede) antes de agendar.
// A filial do agendamento (branchId) é a UNIDADE onde o cliente será atendido —
// é a dimensão de métrica por unidade (o cliente pertence à rede).

import { getTenantContext, assertPermission } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { registrarEventoLead } from '@/lib/lead-events'
import {
  createAppointmentCore,
  computeAvailableSlots,
  notifyAppointmentCreated,
} from '@/lib/appointments/core'
import {
  getCachedBranchProfessionals,
  getCachedBranchProcedures,
  getCachedRoomsByBranch,
} from '@/lib/cached-queries'
import { revalidatePath } from 'next/cache'


export interface CrmSchedProcedure { id: string; name: string; duration_min: number; price: number }
export interface CrmSchedNamed     { id: string; name: string }

export interface CrmSchedulingData {
  professionals: CrmSchedNamed[]
  procedures:    CrmSchedProcedure[]
  rooms:         CrmSchedNamed[]
}

async function assertBranchInTenant(branchId: string, tenantId: string): Promise<boolean> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('branches')
    .select('id')
    .eq('id', branchId)
    .eq('tenant_id', tenantId)
    .maybeSingle()
  return !!data
}

/** Profissionais, procedimentos e salas de uma filial (para o form de agendamento). */
export async function getCrmSchedulingData(branchId: string): Promise<CrmSchedulingData> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'crm', 'VIEW')
  if (!branchId || !(await assertBranchInTenant(branchId, ctx.tenantId!))) {
    return { professionals: [], procedures: [], rooms: [] }
  }

  const [professionals, procedures, rooms] = await Promise.all([
    getCachedBranchProfessionals(branchId, ctx.tenantId!),
    getCachedBranchProcedures(branchId, ctx.tenantId!),
    getCachedRoomsByBranch(branchId, ctx.tenantId!),
  ])

  return {
    professionals: (professionals as CrmSchedNamed[]).map(p => ({ id: p.id, name: p.name })),
    procedures:    (procedures as CrmSchedProcedure[]).map(p => ({
      id: p.id, name: p.name, duration_min: p.duration_min, price: p.price,
    })),
    rooms:         (rooms as CrmSchedNamed[]).map(r => ({ id: r.id, name: r.name })),
  }
}

/** Horários livres de um profissional num dia. */
export async function getCrmSlots(
  branchId: string,
  professionalId: string,
  date: string,
  durationMin: number,
): Promise<string[]> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'crm', 'VIEW')
  if (!branchId || !professionalId || !date) return []
  const admin = createAdminClient()
  return computeAvailableSlots(admin, branchId, professionalId, date, durationMin || 60)
}

export interface CreateCrmAppointmentInput {
  leadId:         string
  branchId:       string
  professionalId: string
  procedureId:    string | null
  scheduledAt:    string           // ISO UTC
  roomId?:        string | null
  isEvaluation?:  boolean
  notes?:         string | null
}

/** Agenda a partir do CRM: garante o cliente (converte lead se preciso) e cria o agendamento. */
export async function createCrmAppointment(
  input: CreateCrmAppointmentInput,
): Promise<{ id?: string; error?: string }> {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'crm', 'MANAGE')
  const admin = createAdminClient()

  const { data: leadRow } = await admin
    .from('leads')
    .select('id, client_id')
    .eq('id', input.leadId)
    .eq('tenant_id', ctx.tenantId!)
    .maybeSingle()
  if (!leadRow) return { error: 'Lead não encontrado.' }

  // Agendar exige um cliente. A conversão (com e-mail + CPF) é um passo deliberado, feito antes.
  const clientId = (leadRow as { client_id: string | null }).client_id
  if (!clientId) return { error: 'Converta o lead em cliente (e-mail + CPF) antes de agendar.' }

  const isComercial = ctx.branchId === null
  const res = await createAppointmentCore(admin, ctx, {
    branchId:       input.branchId,
    clientId,
    professionalId: input.professionalId,
    procedureId:    input.procedureId,
    scheduledAt:    input.scheduledAt,
    roomId:         input.roomId ?? null,
    notes:          input.notes ?? null,
    isEvaluation:   input.isEvaluation ?? false,
    source:         isComercial ? 'COMMERCIAL' : 'INTERNAL',
  })

  if ('error' in res) return { error: res.error }

  // Agendar é uma ação sobre o lead e entra na linha do tempo dele — senão o
  // card salta de "Em contato" para "Agendado" sem dizer o que aconteceu.
  const { data: proc } = await admin
    .from('procedures').select('name').eq('id', input.procedureId).maybeSingle()

  await registrarEventoLead({
    tenantId:    ctx.tenantId!,
    leadId:      input.leadId,
    type:        'APPOINTMENT_CREATED',
    actorUserId: ctx.internalUserId,
    actorName:   ctx.userName || null,
    changes: [{
      campo: 'Agendamento',
      de:    null,
      para:  [
        (proc as { name: string } | null)?.name,
        new Date(input.scheduledAt).toLocaleString('pt-BR', {
          timeZone: 'America/Sao_Paulo',
          day: '2-digit', month: '2-digit', year: 'numeric',
          hour: '2-digit', minute: '2-digit',
        }),
      ].filter(Boolean).join(' · '),
    }],
  })

  notifyAppointmentCreated(res.id)
  revalidatePath('/admin/oportunidades')
  return { id: res.id }
}
