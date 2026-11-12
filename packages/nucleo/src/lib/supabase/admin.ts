import { createClient } from '@supabase/supabase-js'
import { comMarcaDoSuporte, sessaoDeSuporteDaEscrita } from './marca-do-suporte'

// Client com service role — usa HTTPS, não precisa de DATABASE_URL
// Nunca expor no client-side
//
// Toda ESCRITA numa requisição da sessão de suporte leva o cabeçalho que diz
// ao banco quem grava (C2, F71 — `marca-do-suporte.ts`): o fato que o gatilho
// SQL cria sai marcado com a sessão, e só ele deixa de disparar automação.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { global: { fetch: comMarcaDoSuporte((input, init) => fetch(input, init), sessaoDeSuporteDaEscrita) } },
  )
}
