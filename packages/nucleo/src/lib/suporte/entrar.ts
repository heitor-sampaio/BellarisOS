import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '../supabase/admin'
import { ler } from '../db'
import type { PlatformContext } from '../plataforma/contexto'

/**
 * A mecânica de "entrar como" um membro (fase 2 do suporte).
 *
 * Gera uma sessão REAL do Auth do membro, no servidor: `generateLink` (que
 * não envia e-mail) + `verifyOtp` num cliente sem persistência. O token nunca
 * sai daqui antes de a sessão ser ligada à de suporte (`suporte_sessao_ativar`,
 * que também grava o prazo em `auth.sessions.not_after`) — é por isso que o
 * cache de "esta sessão não é de suporte" nunca erra.
 *
 * Efeitos no membro (documentados): o "esqueci minha senha" pendente deixa de
 * valer, e `last_sign_in_at` muda (o último uso do painel vem das sessões).
 */
export interface SessaoDoAlvo {
  sessaoId:     string
  expiraEm:     string
  accessToken:  string
  refreshToken: string
  destino:      string
  alvo:         { id: string; nome: string }
}

type Resultado<T> = { ok: true; valor: T } | { ok: false; error: string }

/** O `session_id` de um access token (sem validar: ele acabou de sair do Auth). */
export function sessionIdDoToken(token: string): string | null {
  try {
    const corpo = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8')) as { session_id?: string }
    return typeof corpo.session_id === 'string' ? corpo.session_id : null
  } catch {
    return null
  }
}

export async function abrirSessaoDeSuporte(ctx: PlatformContext, pedido: {
  tenantId: string; userId: string; motivo: string; chamadoId: string | null; ip: string | null; userAgent: string | null
}): Promise<Resultado<SessaoDoAlvo>> {
  const admin = createAdminClient()

  const { data: aberta, error: eAbrir } = await admin.rpc('suporte_sessao_abrir', {
    p_tenant: pedido.tenantId, p_target: pedido.userId, p_staff: ctx.staffId, p_ticket: pedido.chamadoId,
    p_motivo: pedido.motivo, p_ip: pedido.ip, p_ua: pedido.userAgent,
  })
  if (eAbrir) return { ok: false, error: eAbrir.message }
  const sessao = ((aberta ?? []) as { sessao_id: string; expira_em: string; inclui_clinico: boolean; target_auth: string }[])[0]
  if (!sessao) return { ok: false, error: 'Não consegui abrir a sessão de suporte.' }

  const falhar = async (motivo: string): Promise<Resultado<SessaoDoAlvo>> => {
    await admin.rpc('suporte_sessao_encerrar', { p_sessao: sessao.sessao_id, p_motivo: motivo, p_falhou: true })
    return { ok: false, error: motivo }
  }

  try {
    const membro = await ler(admin.from('users').select('id, name, email, branch_id, branches(slug)')
      .eq('id', pedido.userId).eq('tenant_id', pedido.tenantId).single(), 'buscar o membro') as
      { id: string; name: string; email: string; branch_id: string | null; branches: { slug: string } | null }

    const { data: link, error: eLink } = await admin.auth.admin.generateLink({ type: 'magiclink', email: membro.email })
    if (eLink || !link?.properties?.hashed_token) return falhar(`O Auth não gerou o acesso: ${eLink?.message ?? 'sem token'}`)

    const anon = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: s, error: eOtp } = await anon.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' })
    if (eOtp || !s.session) {
      const limite = /rate limit/i.test(eOtp?.message ?? '')
      return falhar(limite ? 'O Auth está limitando acessos agora. Tente de novo em um minuto.' : `O Auth recusou o acesso: ${eOtp?.message ?? 'sem sessão'}`)
    }
    const authSession = sessionIdDoToken(s.session.access_token)
    if (!authSession) return falhar('O token do Auth veio sem sessão.')

    const { error: eAtivar } = await admin.rpc('suporte_sessao_ativar', { p_sessao: sessao.sessao_id, p_auth_session: authSession })
    if (eAtivar) {
      await admin.rpc('plataforma_encerrar_sessao_do_auth', { p_auth_session: authSession })
      return falhar(`Não consegui ligar a sessão: ${eAtivar.message}`)
    }

    return {
      ok: true,
      valor: {
        sessaoId: sessao.sessao_id, expiraEm: sessao.expira_em,
        accessToken: s.session.access_token, refreshToken: s.session.refresh_token,
        destino: membro.branch_id && membro.branches?.slug ? `/${membro.branches.slug}/dashboard` : '/admin/dashboard',
        alvo: { id: membro.id, nome: membro.name },
      },
    }
  } catch (e) {
    return falhar(e instanceof Error ? e.message : 'Falha ao entrar na conta.')
  }
}
