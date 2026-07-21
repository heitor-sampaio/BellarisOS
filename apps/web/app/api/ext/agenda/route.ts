import { type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { preflight, jsonCors, requireExtAccess, resolveExtBranch } from '@/lib/ext/http'

export const dynamic = 'force-dynamic'

export async function OPTIONS(req: NextRequest) {
  return preflight(req)
}

// Agendamentos do dia da filial — para a atendente/comercial ver a ocupação e achar encaixes.
// Comercial: exige ?branchId= (a unidade escolhida).
export async function GET(req: NextRequest) {
  const guard = await requireExtAccess(req)
  if ('res' in guard) return guard.res
  const { ctx } = guard

  const date = req.nextUrl.searchParams.get('date') // YYYY-MM-DD
  if (!date) return jsonCors(req, { error: 'Informe a data.' }, 400)

  const resolved = await resolveExtBranch(req, ctx)
  if ('res' in resolved) return resolved.res
  const { branchId } = resolved

  const admin = createAdminClient()
  const dayStart = new Date(`${date}T00:00:00-03:00`).toISOString()
  const dayEnd   = new Date(`${date}T23:59:59-03:00`).toISOString()

  const { data } = await admin
    .from('appointments')
    .select('id, scheduled_at, duration_min, status, professional_id, room_id, is_evaluation, clients(name), procedures(name)')
    .eq('branch_id', branchId)
    .gte('scheduled_at', dayStart)
    .lte('scheduled_at', dayEnd)
    .not('status', 'in', '("CANCELLED","NO_SHOW")')
    .order('scheduled_at')

  const appointments = (data ?? []).map((a: Record<string, unknown>) => ({
    id:             a.id,
    scheduledAt:    a.scheduled_at,
    durationMin:    a.duration_min,
    status:         a.status,
    professionalId: a.professional_id,
    roomId:         a.room_id,
    isEvaluation:   a.is_evaluation,
    clientName:     (a.clients as { name?: string } | null)?.name ?? null,
    procedureName:  (a.procedures as { name?: string } | null)?.name ?? null,
  }))

  return jsonCors(req, { appointments })
}
