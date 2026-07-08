'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { nativeStore } from '@/lib/supabase/native-store'

// Fallback client-side para cold start do Capacitor (Android + iOS):
// O request inicial pode chegar sem cookies (cookie store do WebView ainda
// inicializando). Após hidratação, tenta duas fontes em ordem:
// 1. Cookies via getSession() — funciona se WebView já tinha os cookies
// 2. Armazenamento nativo (Preferences) — fallback para cold start
export function AuthRedirect() {
  useEffect(() => {
    async function check() {
      const supabase = createClient()

      // 1. Tenta sessão em cookie (caso normal)
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        window.location.href = '/auth/redirect'
        return
      }

      // 2. Fallback: armazenamento nativo (Capacitor cold start)
      const stored = await nativeStore.load()
      if (!stored) return

      // Sincroniza tokens nativos de volta para cookies do servidor
      const res = await fetch('/api/auth/session', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(stored),
      })

      if (res.ok) {
        window.location.href = '/auth/redirect'
      } else {
        // Tokens expirados ou inválidos — limpa storage nativo
        await nativeStore.clear()
      }
    }
    check()
  }, [])

  return null
}
