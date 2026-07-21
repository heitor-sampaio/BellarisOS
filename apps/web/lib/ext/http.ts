// Helpers para os route handlers /api/ext/* consumidos pela extensão de navegador.
// Autenticação por Bearer (JWT do usuário) + CORS para origens de extensão.

import { type NextRequest, NextResponse } from 'next/server'
import type { TenantContext, UserRole } from '@estetica-os/types'
import { getTenantContextFromToken } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

// Operacionais: filial fixa no JWT (branch_id preenchido). Comerciais: nível-rede
// (branch_id null) — a filial-alvo vem do request e é validada contra o tenant.
const OPERATIONAL_ROLES: UserRole[] = ['NETWORK_ADMIN', 'BRANCH_ADMIN', 'RECEPTIONIST', 'PROFESSIONAL']
export const COMMERCIAL_ROLES: UserRole[] = ['COMERCIAL', 'GERENTE_COMERCIAL']
const EXT_ROLES: UserRole[] = [...OPERATIONAL_ROLES, ...COMMERCIAL_ROLES]

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
 * Guard da extensão: autentica e exige role operacional OU comercial + tenant no
 * contexto. NÃO exige filial (comerciais são nível-rede). Retorna o ctx (tenant
 * garantido) OU uma NextResponse de erro (com CORS).
 */
export async function requireExtAccess(
  req: NextRequest,
): Promise<{ ctx: TenantContext & { tenantId: string } } | { res: NextResponse }> {
  const ctx = await authenticate(req)
  if (!ctx) return { res: jsonCors(req, { error: 'Unauthorized' }, 401) }
  if (!EXT_ROLES.includes(ctx.role)) return { res: jsonCors(req, { error: 'Forbidden' }, 403) }
  if (!ctx.tenantId) {
    return { res: jsonCors(req, { error: 'Contexto sem rede.' }, 400) }
  }
  return { ctx: ctx as TenantContext & { tenantId: string } }
}

/** true quando o usuário opera a rede toda (comercial, sem filial fixa no JWT). */
export function isNetworkMode(ctx: TenantContext): boolean {
  return !ctx.branchId && COMMERCIAL_ROLES.includes(ctx.role)
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
