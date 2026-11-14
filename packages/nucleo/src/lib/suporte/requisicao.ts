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
  return (await quemEscreveNaRequisicao()).sessaoId
}

/**
 * O login (auth id) de quem faz esta requisição, ou nulo — fora de requisição
 * (cron, webhook, script) e sem sessão. É o que o cliente de serviço manda ao
 * banco como `x-bellaris-ator` em toda escrita, para a auditoria (CF3b) dizer
 * QUEM gravou o que o servidor gravou em nome da pessoa.
 */
export async function loginDaRequisicaoAtual(): Promise<string | null> {
  return (await quemEscreveNaRequisicao()).authId
}

type QuemEscreve = { sessaoId: string | null; authId: string | null }
const NINGUEM: QuemEscreve = { sessaoId: null, authId: null }

async function quemEscreveNaRequisicao(): Promise<QuemEscreve> {
  try {
    // Toda ESCRITA do cliente de serviço pergunta por aqui (a marca do
    // suporte no fato do banco, F71; o autor na auditoria, CF3b): a resposta
    // fica guardada por token, 15 s, como o cache da sessão — sem isto cada
    // escrita conferiria o token.
    const chave = await chaveDoToken()
    if (chave === null) return NINGUEM
    const guardada = MEMO.get(chave)
    if (guardada && guardada.ate > Date.now()) return guardada.quem

    const { createClient } = await import('../supabase/server')
    const { data } = await (await createClient()).auth.getClaims()
    const claims = data?.claims as { session_id?: string; sub?: string } | undefined
    const sid = claims?.session_id
    let id: string | null = null
    if (sid) {
      const { sessaoDeSuporte } = await import('./sessao')
      id = (await sessaoDeSuporte(sid))?.id ?? null
    }
    const quem: QuemEscreve = { sessaoId: id, authId: claims?.sub ?? null }
    if (MEMO.size >= MEMO_MAX) MEMO.clear()
    MEMO.set(chave, { quem, ate: Date.now() + 15_000 })
    return quem
  } catch {
    return NINGUEM
  }
}

const MEMO = new Map<string, { quem: QuemEscreve; ate: number }>()
const MEMO_MAX = 500

/**
 * O token da requisição, resumido (SHA-256 dos cookies do Supabase): a chave
 * do que já se conferiu. Sem cookie de sessão, nulo — não há sessão de
 * suporte (o webhook, o cron, a página pública).
 */
async function chaveDoToken(): Promise<string | null> {
  const { cookies } = await import('next/headers')
  const pedacos = (await cookies()).getAll()
    .filter(c => /^sb-.*-auth-token(\.\d+)?$/.test(c.name))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
  if (!pedacos.length) return null
  const bruto = new TextEncoder().encode(pedacos.map(c => c.value).join(''))
  const resumo = new Uint8Array(await crypto.subtle.digest('SHA-256', bruto))
  return Array.from(resumo, b => b.toString(16).padStart(2, '0')).join('')
}
