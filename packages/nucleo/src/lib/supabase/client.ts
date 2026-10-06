'use client'

import { createClient as criarCliente, type SupabaseClient } from '@supabase/supabase-js'
import { tokenDoNavegador } from './token-do-navegador'

function getConfig(): { url: string; key: string } {
  // Em produção o servidor injeta os valores via window globals (layout.tsx),
  // evitando dependência de build-time inlining de NEXT_PUBLIC_* vars.
  if (typeof window !== 'undefined') {
    const w = window as unknown as Record<string, string>
    if (w.__SUPABASE_URL__ && w.__SUPABASE_KEY__) {
      return { url: w.__SUPABASE_URL__, key: w.__SUPABASE_KEY__ }
    }
  }
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  }
}

let unico: SupabaseClient | null = null

/**
 * O cliente do Supabase no NAVEGADOR — e ele serve só ao Realtime.
 *
 * A sessão mora em cookie httpOnly (2026-10-06): o navegador não a lê, não a
 * renova e não a grava. O token de cada conexão vem do servidor, por
 * `/api/auth/token` (`tokenDoNavegador`), pedido de novo a cada heartbeat do
 * Realtime (ver `criarClienteDoNavegador`). Com o `accessToken`, `supabase.auth`
 * deixa de existir aqui de propósito: login, saída e "quem sou eu" são do
 * servidor (actions e `/api/auth/*`).
 *
 * Um só por página: os canais dividem a conexão e o token.
 */
export function createClient(): SupabaseClient {
  if (unico) return unico
  const { url, key } = getConfig()
  unico = criarClienteDoNavegador(url, key, tokenDoNavegador)
  return unico
}

/**
 * O cliente em si, com a fonte do token injetada (é o que o teste exercita).
 *
 * ⚠️ O realtime-js tem dois modos de token: o MANUAL (`setAuth(token)`, que
 * ele guarda e nunca troca sozinho) e o da FUNÇÃO (`setAuth()` sem argumento,
 * que ele chama de novo a cada heartbeat e rejoin). Com a opção `accessToken`,
 * o construtor do supabase-js usa o MANUAL — e o canal morria quando o
 * primeiro token (até 1 h) vencia, sem erro nenhum na tela. Por isso o
 * `setAuth` deste Realtime ignora o argumento: o token vem SEMPRE da função
 * (`tests/realtime-token.test.ts`).
 */
export function criarClienteDoNavegador(url: string, key: string, obterToken: () => Promise<string | null>): SupabaseClient {
  // Sem sessão, o Realtime fala como anônimo (a RLS não abre nada); a próxima
  // renovação pergunta de novo.
  const token = async () => (await obterToken()) ?? key
  const cliente = criarCliente(url, key, { accessToken: token, realtime: { accessToken: token } })
  const realtime = cliente.realtime
  const setAuthDaBiblioteca = realtime.setAuth.bind(realtime)
  realtime.setAuth = () => setAuthDaBiblioteca()
  return cliente
}
