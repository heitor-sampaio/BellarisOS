import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { opcoesDoCookieDeSessao } from './cookie-de-sessao'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              // 7 dias: garante que o refresh token persiste no WebView do Capacitor
              // mesmo quando o access token (1h) expira. O proxy renova automaticamente.
              cookieStore.set(name, value, opcoesDoCookieDeSessao(value, options))
            )
          } catch {
            // Ignorado em Server Components (sem escrita de cookie)
          }
        },
      },
    }
  )
}
