'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

// Fallback client-side para cold start do Capacitor WebView:
// O request inicial pode chegar sem cookies (cookie store ainda carregando),
// então o server não detecta a sessão. Após a página hidratar, o cookie já
// está acessível via document.cookie — se houver sessão, redireciona.
export function AuthRedirect() {
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) return
      // Deixa o servidor montar o destino certo via /auth/redirect
      window.location.href = '/auth/redirect'
    })
  }, [])

  return null
}
