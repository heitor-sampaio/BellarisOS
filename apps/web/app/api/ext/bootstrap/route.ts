import { type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  getCachedBranchProcedures,
  getCachedBranchProfessionals,
  getCachedRoomsByBranch,
} from '@/lib/cached-queries'
import { preflight, jsonCors, requireExtAccess, resolveExtBranch, isNetworkMode } from '@/lib/ext/http'

export const dynamic = 'force-dynamic'

export async function OPTIONS(req: NextRequest) {
  return preflight(req)
}

// Dados para montar o formulário de agendamento: filial + procedimentos + profissionais + salas.
// Comercial: exige ?branchId= (a unidade escolhida no seletor).
export async function GET(req: NextRequest) {
  const guard = await requireExtAccess(req)
  if ('res' in guard) return guard.res
  const { ctx } = guard

  const resolved = await resolveExtBranch(req, ctx)
  if ('res' in resolved) return resolved.res
  const { branchId } = resolved

  const admin = createAdminClient()

  const [branchRes, procedures, professionals, rooms] = await Promise.all([
    admin.from('branches').select('id, name, slug').eq('id', branchId).maybeSingle(),
    getCachedBranchProcedures(branchId, ctx.tenantId),
    getCachedBranchProfessionals(branchId, ctx.tenantId),
    getCachedRoomsByBranch(branchId, ctx.tenantId),
  ])

  return jsonCors(req, {
    mode:          isNetworkMode(ctx) ? 'network' : 'branch',
    branch:        branchRes.data ?? null,
    procedures,
    professionals,
    rooms,
  })
}
