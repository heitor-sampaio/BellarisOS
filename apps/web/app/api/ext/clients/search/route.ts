import { type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { preflight, jsonCors, requireExtAccess } from '@/lib/ext/http'

export const dynamic = 'force-dynamic'

export async function OPTIONS(req: NextRequest) {
  return preflight(req)
}

// Busca cliente por nome / telefone / CPF, retornando o id para agendar.
// Operacional: escopo da própria filial. Comercial: rede toda (CPF é único por tenant).
export async function GET(req: NextRequest) {
  const guard = await requireExtAccess(req)
  if ('res' in guard) return guard.res
  const { ctx } = guard

  const q = (req.nextUrl.searchParams.get('q') ?? '').trim()
  if (q.length < 2) return jsonCors(req, { clients: [] })

  // Sanitiza para não quebrar o filtro .or() do PostgREST (vírgula/parênteses são sintaxe).
  const safe   = q.replace(/[,()*%]/g, ' ').trim()
  const digits = q.replace(/\D/g, '')

  const filters = [`name.ilike.%${safe}%`]
  if (digits.length >= 3) {
    filters.push(`phone.ilike.%${digits}%`)
    filters.push(`document.ilike.%${digits}%`)
  }

  const admin = createAdminClient()
  let query = admin
    .from('clients')
    .select('id, name, phone')
    .eq('tenant_id', ctx.tenantId)
    .eq('is_active', true)
  // Operacional fica restrito à própria filial; comercial busca na rede inteira.
  if (ctx.branchId) query = query.eq('branch_id', ctx.branchId)

  const { data } = await query
    .or(filters.join(','))
    .limit(10)

  return jsonCors(req, {
    clients: (data ?? []).map((c: Record<string, unknown>) => ({
      id:    c.id,
      name:  c.name,
      phone: c.phone,
    })),
  })
}
