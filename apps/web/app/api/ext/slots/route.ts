import { type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { computeAvailableSlots } from '@/lib/appointments/core'
import { preflight, jsonCors, requireExtAccess, resolveExtBranch } from '@/lib/ext/http'

export const dynamic = 'force-dynamic'

export async function OPTIONS(req: NextRequest) {
  return preflight(req)
}

// Slots livres de um profissional num dia (para escolher horário).
// Comercial: exige ?branchId= (a unidade escolhida).
export async function GET(req: NextRequest) {
  const guard = await requireExtAccess(req)
  if ('res' in guard) return guard.res
  const { ctx } = guard

  const sp = req.nextUrl.searchParams
  const professionalId = sp.get('professionalId')
  const date           = sp.get('date')
  const durationMin    = Number(sp.get('durationMin') ?? '60') || 60

  if (!professionalId || !date) {
    return jsonCors(req, { error: 'professionalId e date são obrigatórios.' }, 400)
  }

  const resolved = await resolveExtBranch(req, ctx)
  if ('res' in resolved) return resolved.res
  const { branchId } = resolved

  const admin = createAdminClient()
  const slots = await computeAvailableSlots(admin, branchId, professionalId, date, durationMin)
  return jsonCors(req, { slots })
}
