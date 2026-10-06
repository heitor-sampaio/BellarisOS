/**
 * O access token no navegador, para o Realtime.
 *
 * Os cookies da sessão são httpOnly (`cookie-de-sessao.ts`): o navegador não
 * lê a sessão. Quando precisa falar com o Supabase como a pessoa — só o
 * Realtime faz isso —, pede ao servidor o ACCESS token (até 1 h, sem o
 * refresh), por `/api/auth/token`. A fonte guarda o token em memória, renova
 * um minuto antes de vencer e não pede duas vezes ao mesmo tempo.
 */

export interface TokenDoServidor { access_token: string; expires_at: number }

/** Renova quando falta menos que isto para vencer. */
const FOLGA_SEG = 60

export function fonteDeToken(
  buscar: () => Promise<TokenDoServidor | null>,
  agora: () => number = Date.now,
): () => Promise<string | null> {
  let guardado: TokenDoServidor | null = null
  let emCurso: Promise<string | null> | null = null

  return function obter() {
    if (guardado && guardado.expires_at - agora() / 1000 > FOLGA_SEG) return Promise.resolve(guardado.access_token)
    if (emCurso) return emCurso
    emCurso = buscar()
      .then(t => { guardado = t; return t?.access_token ?? null })
      // Falha de rede ou do servidor: LANÇA, não vira "sem sessão" (null faria o
      // Realtime falar como anônimo). O realtime-js mantém o último token e a
      // próxima chamada tenta de novo.
      .catch((e: unknown) => { guardado = null; throw e })
      .finally(() => { emCurso = null })
    return emCurso
  }
}

/** A busca de verdade: `/api/auth/token`, que devolve 401 sem sessão. */
export async function buscarTokenNoServidor(): Promise<TokenDoServidor | null> {
  const res = await fetch('/api/auth/token', { cache: 'no-store', credentials: 'same-origin' })
  if (res.status === 401) return null
  if (!res.ok) throw new Error(`/api/auth/token respondeu ${res.status}`)
  return await res.json() as TokenDoServidor
}

/** Uma fonte só por página: todos os canais dividem o mesmo token. */
export const tokenDoNavegador = fonteDeToken(buscarTokenNoServidor)
