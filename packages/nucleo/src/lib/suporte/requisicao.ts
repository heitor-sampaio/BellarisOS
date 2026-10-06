import { cache } from 'react'

/**
 * A sessão de suporte da REQUISIÇÃO em curso — para o que não recebe o
 * contexto do membro: o emissor de eventos (`domain_events.suporte_sessao_id`
 * e "fato do suporte não dispara automação") e o push ao paciente (que no
 * modo suporte não sai).
 *
 * Dois caminhos:
 *  - o marcador que `getTenantContext` deixa (`cache` do React: um objeto por
 *    renderização) — atalho, mas NÃO sobrevive numa server action;
 *  - a própria requisição: o `session_id` do token, achado em
 *    `support_sessions` (com o cache de `lib/suporte/sessao.ts`). É este que
 *    vale nas actions — provado em 2026-10-03, quando o push do cancelamento
 *    feito no suporte saiu para o cliente com só o marcador.
 *
 * Fora de requisição (cron, script) não há sessão de suporte: nulo.
 */
const marcador = cache((): { sessaoId: string | null } => ({ sessaoId: null }))

export function marcarSessaoDeSuporte(sessaoId: string): void {
  try { marcador().sessaoId = sessaoId } catch { /* fora de requisição */ }
}

export function sessaoDeSuporteDaRequisicao(): string | null {
  try { return marcador().sessaoId } catch { return null }
}

/**
 * O id da sessão de suporte desta requisição, ou nulo. Chame DENTRO da
 * requisição (antes de um `after()`, guarde a promessa): é dela que se leem
 * os cookies.
 */
export async function sessaoDeSuporteAtual(): Promise<string | null> {
  const marcada = sessaoDeSuporteDaRequisicao()
  if (marcada) return marcada
  try {
    const { createClient } = await import('../supabase/server')
    const { data } = await (await createClient()).auth.getClaims()
    const sid = (data?.claims as { session_id?: string } | undefined)?.session_id
    if (!sid) return null
    const { sessaoDeSuporte } = await import('./sessao')
    return (await sessaoDeSuporte(sid))?.id ?? null
  } catch {
    return null
  }
}
