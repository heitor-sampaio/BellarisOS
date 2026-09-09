// Helpers para os route handlers /api/ext/* consumidos pela extensão de navegador.
// Autenticação por Bearer (JWT do usuário) + CORS para origens de extensão.

import { type NextRequest, NextResponse } from 'next/server'
import type { TenantContext, AppModule } from '@estetica-os/types'
import { getTenantContextFromToken } from '@/lib/auth'
import { hasLevel } from '@/lib/permissions'
import { createAdminClient } from '@/lib/supabase/admin'

// Acesso da extensao: usuario operacional (nao-cliente) COM a permissao do modulo
// que a rota usa. A abrangencia (filial fixa vs rede) e derivada de branch_id no
// JWT em resolveExtBranch/isNetworkMode.
/** CORS: reflete origens de extensão (chrome/moz); a segurança real é o Bearer JWT. */
export function corsHeaders(origin: string | null): Record<string, string> {
  const allow =
    origin && (origin.startsWith('chrome-extension://') || origin.startsWith('moz-extension://'))
      ? origin
      : '*'
  return {
    'Access-Control-Allow-Origin':  allow,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Max-Age':       '86400',
    Vary:                           'Origin',
  }
}

/** Resposta ao preflight OPTIONS. */
export function preflight(req: NextRequest): NextResponse {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) })
}

/** JSON com headers de CORS. */
export function jsonCors(req: NextRequest, data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status, headers: corsHeaders(req.headers.get('origin')) })
}

/** Extrai o Bearer e resolve o TenantContext; null se ausente/ inválido. */
export async function authenticate(req: NextRequest): Promise<TenantContext | null> {
  const header = req.headers.get('authorization') ?? ''
  const token  = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!token) return null
  try {
    return await getTenantContextFromToken(token)
  } catch {
    return null
  }
}

/**
 * Guard da extensão: autentica, exige usuário operacional + tenant, e checa a
 * permissão do módulo que a rota consome.
 *
 * A checagem de módulo é obrigatória: sem ela qualquer cargo — inclusive um com
 * `agenda: NONE` — lia a agenda, buscava clientes e criava agendamentos pela
 * extensão, que roda fora das páginas e não passa por nenhum outro gate.
 *
 * Não exige filial: cargos de abrangência de rede operam sem filial fixa.
 */
export async function requireExtAccess(
  req: NextRequest,
  required: { module: AppModule; level: 'VIEW' | 'MANAGE' },
): Promise<{ ctx: TenantContext & { tenantId: string } } | { res: NextResponse }> {
  const ctx = await authenticate(req)
  if (!ctx) return { res: jsonCors(req, { error: 'Unauthorized' }, 401) }
  if (ctx.isClient) return { res: jsonCors(req, { error: 'Forbidden' }, 403) }
  if (!ctx.tenantId) {
    return { res: jsonCors(req, { error: 'Contexto sem rede.' }, 400) }
  }
  if (!hasLevel(ctx.permissions[required.module], required.level)) {
    return { res: jsonCors(req, { error: 'Forbidden' }, 403) }
  }
  return { ctx: ctx as TenantContext & { tenantId: string } }
}

/** true quando o usuário opera a rede toda (comercial, sem filial fixa no JWT). */
export function isNetworkMode(ctx: TenantContext): boolean {
  return !ctx.branchId && !ctx.isClient
}

/**
 * Resolve a filial-alvo da operação. Operacional: sempre a própria filial (do JWT).
 * Comercial: a filial vem do request (query `?branchId=` ou body) e é VALIDADA contra
 * o tenant — o admin client bypassa RLS, então essa checagem é a única barreira.
 */
export async function resolveExtBranch(
  req: NextRequest,
  ctx: TenantContext & { tenantId: string },
  explicitBranchId?: string | null,
): Promise<{ branchId: string } | { res: NextResponse }> {
  if (ctx.branchId) return { branchId: ctx.branchId }  // operacional: ignora request, usa o JWT

  const branchId = (explicitBranchId ?? req.nextUrl.searchParams.get('branchId') ?? '').trim()
  if (!branchId) return { res: jsonCors(req, { error: 'Selecione a unidade.' }, 400) }

  const admin = createAdminClient()
  const { data } = await admin
    .from('branches')
    .select('id')
    .eq('id', branchId)
    .eq('tenant_id', ctx.tenantId)
    .eq('is_active', true)
    .maybeSingle()
  if (!data) return { res: jsonCors(req, { error: 'Unidade inválida.' }, 403) }

  return { branchId }
}
