'use client'

import { useEffect } from 'react'
import { navegarInteira } from '@/lib/navegacao-inteira'

// Fallback para o "cold start" do app (Capacitor): o primeiro pedido pode
// chegar ao servidor sem os cookies (o cookie store do WebView ainda
// inicializando), e a landing aparece para quem está logado. Depois da
// hidratação, pergunta ao SERVIDOR se há sessão — o JS não lê a sessão, que é
// httpOnly (lib/supabase/cookie-de-sessao.ts) — e, havendo, recarrega inteira.
export function AuthRedirect() {
  useEffect(() => {
    let ativo = true
    fetch('/api/auth/token', { cache: 'no-store', credentials: 'same-origin' })
      .then(res => {
        // Recarga inteira de propósito: o servidor precisa ler a sessão do zero.
        if (ativo && res.ok) navegarInteira('/auth/redirect')
      })
      .catch(() => { /* sem rede: fica na landing */ })
    return () => { ativo = false }
  }, [])

  return null
}
