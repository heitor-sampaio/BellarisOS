import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { revalidateTag } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { urlPublica } from '@/lib/origem'
import { COOKIE_DA_VOLTA, decifrarVolta } from '@/lib/suporte/cookie'
import { tagDaSessao } from '@/lib/suporte/sessao'
import { sessionIdDoToken } from '@/lib/suporte/entrar'
import { avisarAcessoDoSuporte } from '@/lib/suporte/avisos'

/**
 * O FIM de uma sessão de suporte — o "Sair" do banner, e para onde
 * `buildContext` manda quando ela vence ou é revogada.
 *
 * 1. Encerra a sessão de suporte e DERRUBA a do Auth (o refresh token some);
 * 2. devolve o atendente ao painel com o cookie de volta (refresh token dele,
 *    cifrado) — ou, sem ele, vai ao login;
 * 3. volta ao chamado, ou à rede.
 *
 * GET de propósito: é um link (banner, redirect). Sem sessão de suporte na
 * mão, não faz nada além de limpar a volta e ir ao login.
 */
export async function GET(req: NextRequest) {
  const admin = createAdminClient()
  const motivo = req.nextUrl.searchParams.get('motivo') === 'venceu' ? 'venceu' : 'saiu'

  // Quem está aqui agora: a sessão do MEMBRO (cookies sb-*).
  let authSession: string | null = null
  const daSessao = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll: () => req.cookies.getAll(), setAll: () => { /* só leitura aqui */ } },
  })
  const { data: { session } } = await daSessao.auth.getSession()
  if (session?.access_token) authSession = sessionIdDoToken(session.access_token)

  const volta = decifrarVolta(req.cookies.get(COOKIE_DA_VOLTA)?.value)

  // A sessão de suporte: pela do Auth (a fonte), ou pela volta.
  const filtro = authSession ? { coluna: 'auth_session_id', valor: authSession } : volta ? { coluna: 'id', valor: volta.sessaoId } : null
  const sessao = filtro
    ? (await admin.from('support_sessions')
        .select('id, tenant_id, ticket_id, target_user_id, auth_session_id, status, platform_staff(name), users!support_sessions_target_user_id_fkey(name)')
        .eq(filtro.coluna, filtro.valor).maybeSingle()).data as {
          id: string; tenant_id: string; ticket_id: string | null; target_user_id: string; auth_session_id: string | null; status: string
          platform_staff: { name: string } | null; users: { name: string } | null
        } | null
    : null

  if (sessao && ['abrindo', 'ativa'].includes(sessao.status)) {
    await admin.rpc('suporte_sessao_encerrar', { p_sessao: sessao.id, p_motivo: motivo })
    await avisarAcessoDoSuporte(sessao.tenant_id, { id: sessao.target_user_id, nome: sessao.users?.name ?? 'membro' },
      { atendente: sessao.platform_staff?.name ?? 'Suporte', motivo, entrou: false })
  }
  if (sessao?.auth_session_id) revalidateTag(tagDaSessao(sessao.auth_session_id), { expire: 0 })

  const destino = sessao
    ? (sessao.ticket_id ? `/suporte/chamados/${sessao.ticket_id}` : `/suporte/redes/${sessao.tenant_id}`)
    : '/login'
  const resposta = NextResponse.redirect(urlPublica(req, destino), 303)
  resposta.cookies.set(COOKIE_DA_VOLTA, '', { path: '/', maxAge: 0 })

  // Tira os cookies do membro (a sessão dele já foi apagada no Auth).
  const escreve = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (lista: { name: string; value: string; options?: CookieOptions }[]) =>
        lista.forEach(({ name, value, options }) => resposta.cookies.set(name, value,
          value ? { ...options, maxAge: 60 * 60 * 24 * 7 } : { ...options, maxAge: 0 })),
    },
  })

  // A volta: o atendente com a sessão DELE de novo, sem login.
  if (volta && (!sessao || volta.sessaoId === sessao.id)) {
    const anon = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: renovada } = await anon.auth.refreshSession({ refresh_token: volta.refresh })
    if (renovada.session) {
      const { error } = await escreve.auth.setSession({
        access_token: renovada.session.access_token, refresh_token: renovada.session.refresh_token,
      })
      if (!error) return resposta
    }
  }

  // Sem volta (ou ela venceu): limpa a sessão e vai ao login.
  await escreve.auth.signOut({ scope: 'local' })
  resposta.headers.set('location', urlPublica(req, '/login').toString())
  return resposta
}
