'use server'

// Agendamento a partir do CRM (/admin) — reutiliza o núcleo createAppointmentCore.
// Garante o cliente (lead de rede -> cliente de rede) antes de agendar.
// A filial do agendamento (branchId) é a UNIDADE onde o cliente será atendido —
// é a dimensão de métrica por unidade (o cliente pertence à rede).

import { getTenantContext, assertRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
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
import { convertLeadToClient } from '@/actions/leads'
import { revalidatePath } from 'next/cache'

const CRM_READ_ROLES  = ['NETWORK_ADMIN', 'BRANCH_ADMIN', 'RECEPTIONIST', 'COMERCIAL', 'GERENTE_COMERCIAL', 'FINANCIAL'] as const
const CRM_WRITE_ROLES = ['NETWORK_ADMIN', 'BRANCH_ADMIN', 'RECEPTIONIST', 'COMERCIAL'] as const

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
  assertRole(ctx, [...CRM_READ_ROLES])
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
  assertRole(ctx, [...CRM_READ_ROLES])
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
  assertRole(ctx, [...CRM_WRITE_ROLES])
  const admin = createAdminClient()

  const { data: leadRow } = await admin
    .from('leads')
    .select('id, client_id')
    .eq('id', input.leadId)
    .eq('tenant_id', ctx.tenantId!)
    .maybeSingle()
  if (!leadRow) return { error: 'Lead não encontrado.' }

  let clientId = (leadRow as { client_id: string | null }).client_id
  if (!clientId) {
    // A unidade do agendamento vira a unidade de cadastro do cliente.
    const conv = await convertLeadToClient(input.leadId, '__admin__', input.branchId) as { clientId?: string; error?: string }
    if (conv.error) return { error: conv.error }
    clientId = conv.clientId ?? null
  }
  if (!clientId) return { error: 'Não foi possível criar o cliente para agendar.' }

  const isComercial = ctx.role === 'COMERCIAL' || ctx.role === 'GERENTE_COMERCIAL'
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

  notifyAppointmentCreated(res.id)
  revalidatePath('/admin/crm')
  return { id: res.id }
}
