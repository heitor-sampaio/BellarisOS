import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { opcoesDoCookieDeSessao } from '@/lib/supabase/cookie-de-sessao'
import { revalidateTag } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { urlPublica } from '@/lib/origem'
import { tagDaSessao } from '@/lib/suporte/sessao'
import { sessionIdDoToken } from '@/lib/suporte/entrar'
import { avisarAcessoDoSuporte } from '@/lib/suporte/avisos'
import { urlDoHost } from '@estetica-os/nucleo/lib/plataforma/destino'

/**
 * O FIM de uma sessão de suporte — o "Sair" do banner, e para onde
 * `getTenantContext` manda quando ela vence ou é revogada.
 *
 * 1. Encerra a sessão de suporte e DERRUBA a do Auth (o refresh token some);
 * 2. apaga os cookies do membro NESTE host;
 * 3. leva de volta ao painel, no host do SUPORTE (o chamado, ou a rede) —
 *    onde o atendente continua logado na sessão DELE, que nunca veio para cá
 *    (2026-10-06: não há mais cookie de volta).
 *
 * GET de propósito: é um link (banner, redirect). Por isso, sem sessão de
 * suporte, NÃO faz nada: um link de outro site não pode deslogar um membro.
 */
type SessaoLida = {
  id: string; tenant_id: string; ticket_id: string | null; target_user_id: string; auth_session_id: string | null; status: string
  platform_staff: { name: string } | null; users: { name: string } | null
}

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

  let sessao: SessaoLida | null = null
  if (authSession) {
    const { data, error } = await admin.from('support_sessions')
      .select('id, tenant_id, ticket_id, target_user_id, auth_session_id, status, platform_staff(name), users!support_sessions_target_user_id_fkey(name)')
      .eq('auth_session_id', authSession).maybeSingle()
    if (error) console.error('[suporte-fim] não li a sessão de suporte:', error.message)
    sessao = data as SessaoLida | null
  }

  // Sem sessão de suporte: é um membro comum (ou um link de fora).
  if (!sessao) return NextResponse.redirect(urlPublica(req, '/'), 303)

  if (['abrindo', 'ativa'].includes(sessao.status)) {
    const { error: eFim } = await admin.rpc('suporte_sessao_encerrar', { p_sessao: sessao.id, p_motivo: motivo })
    if (eFim) console.error('[suporte-fim] não encerrou a sessão:', eFim.message)
    await avisarAcessoDoSuporte(sessao.tenant_id, { id: sessao.target_user_id, nome: sessao.users?.name ?? 'membro' },
      { atendente: sessao.platform_staff?.name ?? 'Suporte', motivo, entrou: false })
  }
  if (sessao.auth_session_id) revalidateTag(tagDaSessao(sessao.auth_session_id), { expire: 0 })

  // De volta ao painel, no host do suporte (endereço do ambiente, nunca do pedido).
  const caminho = sessao.ticket_id ? `/chamados/${sessao.ticket_id}` : `/redes/${sessao.tenant_id}`
  let destino: string
  try { destino = `${urlDoHost('suporte')}${caminho}` } catch { destino = urlPublica(req, '/login').toString() }
  const resposta = NextResponse.redirect(destino, 303)

  // Tira os cookies do membro (a sessão dele já foi apagada no Auth).
  const escreve = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (lista: { name: string; value: string; options?: CookieOptions }[]) =>
        lista.forEach(({ name, value, options }) => resposta.cookies.set(name, value, opcoesDoCookieDeSessao(value, options))),
    },
  })
  await escreve.auth.signOut({ scope: 'local' })
  return resposta
}
