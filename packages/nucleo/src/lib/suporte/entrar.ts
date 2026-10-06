import 'server-only'
import { createHash, randomBytes } from 'node:crypto'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '../supabase/admin'
import { ler } from '../db'
import type { PlatformContext } from '../plataforma/contexto'

/**
 * A mecânica de "entrar como" um membro, ENTRE ORIGENS (2026-10-06).
 *
 * O painel do suporte e a clínica são hosts diferentes — e a sessão do
 * atendente nunca vai para a clínica. São duas metades:
 *
 *  1. no PAINEL (`apps/suporte`, `/api/entrar`): `abrirSessaoDeSuporte` abre a
 *     sessão (`suporte_sessao_abrir`: autorização vigente, motivo, uma por
 *     atendente e por conta) e cria um CÓDIGO de uso único (60 s; só o
 *     SHA-256 vai ao banco). A aba nova leva o código no corpo de um POST;
 *  2. na CLÍNICA (`/auth/suporte-entrada`): `ativarSessaoDeSuporte` consome o
 *     código (uma vez, atômico) e só então gera a sessão REAL do Auth do
 *     membro — `generateLink` (que não envia e-mail) + `verifyOtp` — e a liga
 *     à de suporte (`suporte_sessao_ativar`, que grava o prazo em
 *     `auth.sessions.not_after`). Os cookies nascem na clínica, httpOnly.
 *
 * Efeitos no membro (documentados): o "esqueci minha senha" pendente deixa de
 * valer, e `last_sign_in_at` muda (o último uso do painel vem das sessões).
 */

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

/** O hash do código (o que o banco guarda). */
export function hashDoCodigo(codigo: string): string {
  return createHash('sha256').update(codigo).digest('hex')
}

/** 32 bytes aleatórios: o código que a aba nova leva à clínica. */
export function novoCodigoDeEntrada(): string {
  return randomBytes(32).toString('base64url')
}

export interface EntradaAberta { sessaoId: string; codigo: string; alvo: { id: string; nome: string } }

/** Metade 1 — no painel do suporte. */
export async function abrirSessaoDeSuporte(ctx: PlatformContext, pedido: {
  tenantId: string; userId: string; motivo: string; chamadoId: string | null; ip: string | null; userAgent: string | null
}): Promise<Resultado<EntradaAberta>> {
  const admin = createAdminClient()
  const { data: aberta, error: eAbrir } = await admin.rpc('suporte_sessao_abrir', {
    p_tenant: pedido.tenantId, p_target: pedido.userId, p_staff: ctx.staffId, p_ticket: pedido.chamadoId,
    p_motivo: pedido.motivo, p_ip: pedido.ip, p_ua: pedido.userAgent,
  })
  if (eAbrir) return { ok: false, error: eAbrir.message }
  const sessao = ((aberta ?? []) as { sessao_id: string }[])[0]
  if (!sessao) return { ok: false, error: 'Não consegui abrir a sessão de suporte.' }

  const codigo = novoCodigoDeEntrada()
  const { error: eCodigo } = await admin.rpc('suporte_entrada_criar', { p_sessao: sessao.sessao_id, p_hash: hashDoCodigo(codigo) })
  if (eCodigo) {
    await admin.rpc('suporte_sessao_encerrar', { p_sessao: sessao.sessao_id, p_motivo: 'falhou ao abrir', p_falhou: true })
    return { ok: false, error: `Não consegui preparar a entrada: ${eCodigo.message}` }
  }
  const membro = await ler(admin.from('users').select('id, name').eq('id', pedido.userId).eq('tenant_id', pedido.tenantId).single(),
    'buscar o membro') as { id: string; name: string }
  return { ok: true, valor: { sessaoId: sessao.sessao_id, codigo, alvo: { id: membro.id, nome: membro.name } } }
}

export interface SessaoDoAlvo {
  sessaoId:     string
  tenantId:     string
  accessToken:  string
  refreshToken: string
  destino:      string
  alvo:         { id: string; nome: string }
  atendente:    string
  motivo:       string
}

/**
 * Metade 2 — na clínica. `null` quando o código não serve (usado, vencido,
 * inexistente, de sessão que não está mais abrindo): nada é criado.
 */
export async function ativarSessaoDeSuporte(codigo: string): Promise<Resultado<SessaoDoAlvo> | null> {
  if (typeof codigo !== 'string' || codigo.length < 40 || codigo.length > 100) return null
  const admin = createAdminClient()
  const { data: sessaoId, error: eConsumir } = await admin.rpc('suporte_entrada_consumir', { p_hash: hashDoCodigo(codigo) })
  if (eConsumir) {
    console.error('[suporte/entrada] consumir o código:', eConsumir.message)
    return null
  }
  if (!sessaoId) return null

  const falhar = async (motivo: string): Promise<Resultado<SessaoDoAlvo>> => {
    await admin.rpc('suporte_sessao_encerrar', { p_sessao: sessaoId, p_motivo: motivo, p_falhou: true })
    return { ok: false, error: motivo }
  }

  try {
    const sessao = await ler(admin.from('support_sessions')
      .select('id, tenant_id, target_user_id, motivo, platform_staff(name)')
      .eq('id', sessaoId).single(), 'buscar a sessão de suporte') as
      { id: string; tenant_id: string; target_user_id: string; motivo: string; platform_staff: { name: string } | null }
    const membro = await ler(admin.from('users').select('id, name, email, branch_id, branches(slug)')
      .eq('id', sessao.target_user_id).eq('tenant_id', sessao.tenant_id).single(), 'buscar o membro') as
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

    const { error: eAtivar } = await admin.rpc('suporte_sessao_ativar', { p_sessao: sessaoId, p_auth_session: authSession })
    if (eAtivar) {
      await admin.rpc('plataforma_encerrar_sessao_do_auth', { p_auth_session: authSession })
      return falhar(`Não consegui ligar a sessão: ${eAtivar.message}`)
    }

    return {
      ok: true,
      valor: {
        sessaoId, tenantId: sessao.tenant_id,
        accessToken: s.session.access_token, refreshToken: s.session.refresh_token,
        destino: membro.branch_id && membro.branches?.slug ? `/${membro.branches.slug}/dashboard` : '/admin/dashboard',
        alvo: { id: membro.id, nome: membro.name },
        atendente: sessao.platform_staff?.name ?? 'Suporte BellarisOS',
        motivo: sessao.motivo,
      },
    }
  } catch (e) {
    return falhar(e instanceof Error ? e.message : 'Falha ao entrar na conta.')
  }
}
