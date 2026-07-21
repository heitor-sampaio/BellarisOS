import { type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCachedNetworkBranches } from '@/lib/cached-queries'
import { preflight, jsonCors, requireExtAccess } from '@/lib/ext/http'

export const dynamic = 'force-dynamic'

export async function OPTIONS(req: NextRequest) {
  return preflight(req)
}

// Unidades disponíveis para o usuário. Operacional: só a própria filial.
// Comercial (nível-rede): todas as filiais ativas do tenant (seletor de unidade).
export async function GET(req: NextRequest) {
  const guard = await requireExtAccess(req)
  if ('res' in guard) return guard.res
  const { ctx } = guard

  if (ctx.branchId) {
    const admin = createAdminClient()
    const { data } = await admin
      .from('branches')
      .select('id, name')
      .eq('id', ctx.branchId)
      .maybeSingle()
    return jsonCors(req, { mode: 'branch', branches: data ? [data] : [] })
  }

  const branches = await getCachedNetworkBranches(ctx.tenantId)
  return jsonCors(req, { mode: 'network', branches })
}
