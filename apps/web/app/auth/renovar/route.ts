import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { opcoesDoCookieDeSessao } from '@/lib/supabase/cookie-de-sessao'
import { createAdminClient } from '@/lib/supabase/admin'
import { urlPublica, caminhoInterno } from '@/lib/origem'
import { COOKIE_DA_RENOVACAO } from '@/lib/sessao/claims-velhas'

/**
 * Renova a sessão do MEMBRO cujas claims ficaram velhas (D9 da 9ª simulação,
 * 2026-11-07; lib/sessao/claims-velhas.ts): a unidade ou o cargo mudaram com a
 * sessão aberta. Grava as claims a partir do BANCO (o membro de quem é a
 * sessão — ninguém escolhe nada aqui) e renova o token, que nasce com elas; e
 * volta ao caminho pedido (só interno). Quem chega aqui é o redirect do
 * `getTenantContext`.
 *
 * GET de propósito (é o destino de um redirect). O pedido INTERNO do Next (a
 * navegação RSC, o prefetch) responde 200 sem RSC: o Next refaz como navegação
 * inteira, e é ela que renova (o mesmo de /auth/suporte-fim).
 */
function pedidoInternoDoNext(req: NextRequest): boolean {
  return req.headers.get('rsc') === '1' || req.headers.has('next-router-prefetch')
    || req.headers.has('next-router-state-tree') || req.nextUrl.searchParams.has('_rsc')
}

export async function GET(req: NextRequest) {
  if (pedidoInternoDoNext(req)) {
    return new NextResponse(null, { status: 200, headers: { 'cache-control': 'no-store' } })
  }
  const destino = caminhoInterno(req.nextUrl.searchParams.get('next'), '/auth/redirect')
  const resposta = NextResponse.redirect(urlPublica(req, destino), 303)
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (aGravar: { name: string; value: string; options?: CookieOptions }[]) =>
        aGravar.forEach(({ name, value, options }) => resposta.cookies.set(name, value, opcoesDoCookieDeSessao(value, options))),
    },
  })
  const { data } = await supabase.auth.getClaims()
  const authId = data?.claims?.sub as string | undefined
  if (!authId) return NextResponse.redirect(urlPublica(req, '/login'), 303)

  // As claims do banco, do membro DESTA sessão (o mesmo `set_user_claims` da Equipe).
  const admin = createAdminClient()
  const { data: membro } = await admin.from('users')
    .select('tenant_id, branch_id, role_id, is_active').eq('auth_id', authId).maybeSingle()
  if (membro?.is_active && membro.role_id && membro.tenant_id) {
    const { error } = await admin.rpc('set_user_claims', {
      p_auth_id: authId, p_tenant_id: membro.tenant_id, p_branch_id: membro.branch_id ?? null, p_role_id: membro.role_id,
    })
    if (error) console.error('[auth/renovar] gravar as claims:', error.message)
  }
  const { error: erroRenovar } = await supabase.auth.refreshSession()
  if (erroRenovar) console.error('[auth/renovar] renovar a sessão:', erroRenovar.message)

  // Um minuto sem pedir de novo: se a renovação não pegou, a página segue
  // pelo banco em vez de voltar aqui em laço.
  resposta.cookies.set(COOKIE_DA_RENOVACAO, authId, { ...opcoesDoCookieDeSessao(authId), maxAge: 60 })
  return resposta
}
