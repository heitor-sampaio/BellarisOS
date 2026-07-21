import { type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createAppointmentCore, notifyAppointmentCreated } from '@/lib/appointments/core'
import { preflight, jsonCors, requireExtAccess, resolveExtBranch, COMMERCIAL_ROLES } from '@/lib/ext/http'

export const dynamic = 'force-dynamic'

export async function OPTIONS(req: NextRequest) {
  return preflight(req)
}

// Cria o agendamento reusando a lógica do app (conflito de sala/profissional, preço,
// notificações). Operacional: filial do JWT. Comercial: filial do body, validada contra o tenant.
export async function POST(req: NextRequest) {
  const guard = await requireExtAccess(req)
  if ('res' in guard) return guard.res
  const { ctx } = guard

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return jsonCors(req, { error: 'JSON inválido.' }, 400)
  }

  const resolved = await resolveExtBranch(req, ctx, body.branchId ? String(body.branchId) : null)
  if ('res' in resolved) return resolved.res
  const { branchId } = resolved

  const admin = createAdminClient()
  const result = await createAppointmentCore(admin, ctx, {
    branchId,
    clientId:       String(body.clientId ?? ''),
    procedureId:    body.procedureId ? String(body.procedureId) : null,
    professionalId: String(body.professionalId ?? ''),
    scheduledAt:    String(body.scheduledAt ?? ''),
    roomId:         body.roomId ? String(body.roomId) : null,
    notes:          body.notes ? String(body.notes) : null,
    isEvaluation:   body.isEvaluation === true,
    // Carimba origem comercial quando criado por um cargo comercial (KPIs)
    source:         COMMERCIAL_ROLES.includes(ctx.role) ? 'COMMERCIAL' : 'INTERNAL',
  })

  if ('error' in result) {
    // 409: conflito de horário/regra; o cliente da extensão mostra a mensagem.
    return jsonCors(req, { error: result.error }, 409)
  }

  notifyAppointmentCreated(result.id)
  return jsonCors(req, { success: true, id: result.id })
}
