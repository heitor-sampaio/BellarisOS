'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { nativeStore } from '@/lib/supabase/native-store'

// Mantém o armazenamento nativo (Preferences) sincronizado com a sessão Supabase.
// Roda em segundo plano em todas as páginas autenticadas.
// No-op em browser web (nativeStore.save/clear retorna sem fazer nada).
export function CapacitorSessionSync() {
  useEffect(() => {
    let subscription: { unsubscribe: () => void } | undefined
    try {
      const supabase = createClient()
      const { data } = supabase.auth.onAuthStateChange(
        async (event, session) => {
          if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session) {
            await nativeStore.save({
              access_token:  session.access_token,
              refresh_token: session.refresh_token,
            })
          } else if (event === 'SIGNED_OUT') {
            await nativeStore.clear()
          }
        }
      )
      subscription = data.subscription
    } catch { /* supabase url not available yet — no-op */ }
    return () => subscription?.unsubscribe()
  }, [])

  return null
}
