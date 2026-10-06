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
 * `/api/auth/token` (`tokenDoNavegador`), e é o `supabase-js` que o pede de
 * novo a cada renovação do Realtime. Com o `accessToken`, `supabase.auth`
 * deixa de existir aqui de propósito: login, saída e "quem sou eu" são do
 * servidor (actions e `/api/auth/*`).
 *
 * Um só por página: os canais dividem a conexão e o token.
 */
export function createClient(): SupabaseClient {
  if (unico) return unico
  const { url, key } = getConfig()
  unico = criarCliente(url, key, {
    // Sem sessão, o Realtime fala como anônimo (a RLS não abre nada).
    accessToken: async () => (await tokenDoNavegador()) ?? key,
  })
  return unico
}
