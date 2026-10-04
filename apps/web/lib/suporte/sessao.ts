import { unstable_cache } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { ler } from '@/lib/db'

/**
 * A sessão de SUPORTE por trás de um token, achada pelo `session_id` do JWT.
 *
 * Toda requisição de um membro passa por aqui (via `getTenantContext`), por isso o
 * cache: 15 s por sessão do Auth, com a tag `suporte-sessao:<session_id>`
 * expirada na hora em que a sessão de suporte abre ou fecha. O "não é de
 * suporte" também fica em cache — e não erra: o token da sessão de suporte
 * nunca sai do servidor antes de ela ser ligada aqui (`suporte_sessao_ativar`).
 *
 * Não depende do hook de token do Supabase: com ele ligado, o token também
 * carrega `suporte`, mas a fonte é esta tabela.
 */
export interface SessaoDeSuporte {
  id:               string
  staffId:          string
  atendenteNome:    string
  tenantId:         string
  targetUserId:     string
  includesClinical: boolean
  status:           'abrindo' | 'ativa' | 'encerrada' | 'falhou'
  expiresAt:        string
  /** O atendente ainda está na equipe. Desativado, a sessão dele cai. */
  staffAtivo?:      boolean
  ticketId:         string | null
}

export const tagDaSessao = (authSessionId: string) => `suporte-sessao:${authSessionId}`

export function sessaoDeSuporte(authSessionId: string): Promise<SessaoDeSuporte | null> {
  return unstable_cache(
    async () => {
      const r = await ler(createAdminClient().from('support_sessions')
        .select('id, staff_id, tenant_id, target_user_id, includes_clinical, status, expires_at, ticket_id, platform_staff(name, is_active)')
        .eq('auth_session_id', authSessionId)
        .maybeSingle(), 'conferir a sessão de suporte') as {
          id: string; staff_id: string; tenant_id: string; target_user_id: string; includes_clinical: boolean
          status: SessaoDeSuporte['status']; expires_at: string; ticket_id: string | null
          platform_staff: { name: string; is_active: boolean } | null
        } | null
      if (!r) return null
      return {
        id: r.id, staffId: r.staff_id, atendenteNome: r.platform_staff?.name ?? 'Suporte',
        tenantId: r.tenant_id, targetUserId: r.target_user_id, includesClinical: r.includes_clinical,
        status: r.status, expiresAt: r.expires_at, ticketId: r.ticket_id,
        staffAtivo: r.platform_staff?.is_active ?? false,
      }
    },
    [`suporte-sessao-${authSessionId}`],
    { revalidate: 15, tags: [tagDaSessao(authSessionId)] },
  )()
}

/** Ainda vale? (Ativa, dentro do prazo e com o atendente na equipe — a cada requisição.) */
export function sessaoVigente(s: Pick<SessaoDeSuporte, 'status' | 'expiresAt' | 'staffAtivo'>, agoraMs = Date.now()): boolean {
  return s.status === 'ativa' && Date.parse(s.expiresAt) > agoraMs && s.staffAtivo !== false
}

/**
 * As sessões de suporte em curso de um membro (`alvo`) ou de um atendente.
 * Quem vai mexer na autorização lê ANTES: o banco as encerra junto (gatilho
 * de `support_grants`), e o cache delas (`tagDaSessao`) precisa expirar.
 */
export async function sessoesEmCurso(filtro: { alvo?: string; atendente?: string }): Promise<{ id: string; authSessionId: string | null }[]> {
  let q = createAdminClient().from('support_sessions').select('id, auth_session_id').in('status', ['abrindo', 'ativa'])
  if (filtro.alvo) q = q.eq('target_user_id', filtro.alvo)
  else if (filtro.atendente) q = q.eq('staff_id', filtro.atendente)
  else return []
  const linhas = await ler(q, 'buscar as sessões de suporte em curso') as { id: string; auth_session_id: string | null }[] | null
  return (linhas ?? []).map(l => ({ id: l.id, authSessionId: l.auth_session_id }))
}

/** Registra uma requisição feita na sessão de suporte (o que foi feito). */
export async function registrarAcessoDoSuporte(sessaoId: string, r: {
  method: string | null; path: string | null; actionId: string | null; ip: string | null
}): Promise<void> {
  const { error } = await createAdminClient().from('support_access_log').insert({
    session_id: sessaoId,
    method:     r.method?.slice(0, 10) ?? null,
    path:       r.path?.slice(0, 500) ?? null,
    action_id:  r.actionId?.slice(0, 120) ?? null,
    ip:         r.ip?.slice(0, 80) ?? null,
  })
  // Acessório para a requisição em curso, mas não pode sumir calado.
  if (error) console.error('[suporte] não registrou o acesso:', error.message)
}

/**
 * A requisição em curso é de uma sessão de suporte? Para as poucas actions que
 * não montam o contexto do membro (sair, trocar senha, aparelho de push).
 */
export async function emSessaoDeSuporte(): Promise<boolean> {
  const { createClient } = await import('@/lib/supabase/server')
  const { data } = await (await createClient()).auth.getClaims()
  const sid = (data?.claims as { session_id?: string } | undefined)?.session_id
  return !!sid && !!(await sessaoDeSuporte(sid))
}
