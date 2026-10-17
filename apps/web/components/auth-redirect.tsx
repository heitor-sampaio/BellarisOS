'use client'

import { useEffect } from 'react'
import { navegarInteira } from '@/lib/navegacao-inteira'

// Fallback para o "cold start" do app (Capacitor): o primeiro pedido pode
// chegar ao servidor sem os cookies (o cookie store do WebView ainda
// inicializando), e o `/` aparece como se não houvesse sessão. Depois da
// hidratação, pergunta ao SERVIDOR se há sessão — o JS não lê a sessão, que é
// httpOnly (lib/supabase/cookie-de-sessao.ts) — e, havendo, recarrega inteira.
// Sem sessão de fato, segue para `senaoPara` (o login, no `/`).
export function AuthRedirect({ senaoPara }: { senaoPara?: string }) {
  useEffect(() => {
    let ativo = true
    fetch('/api/auth/token', { cache: 'no-store', credentials: 'same-origin' })
      .then(res => {
        if (!ativo) return
        // Recarga inteira de propósito: o servidor precisa ler a sessão do zero.
        if (res.ok) navegarInteira('/auth/redirect')
        else if (senaoPara) window.location.replace(senaoPara)
      })
      .catch(() => { if (ativo && senaoPara) window.location.replace(senaoPara) })
    return () => { ativo = false }
  }, [senaoPara])

  return null
}
