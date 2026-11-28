'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'

/** A rota que diz a assinatura do menu de quem pergunta (`app/api/menu/route.ts`). */
export const ROTA_DA_ASSINATURA_DO_MENU = '/api/menu'

/**
 * A próxima navegação desenha o menu novo (LO-06; A7 da 43ª): o layout do
 * portal não se refaz na navegação do Next, e o menu ficava o de antes do
 * cargo mudar até recarregar. A cada navegação, pergunta a assinatura de agora
 * (`lib/sessao/assinatura-do-menu.ts`) e, se não é a que o layout desenhou,
 * redesenha (`router.refresh()`). A tela aberta não se redesenha sozinha.
 * Não desenha nada.
 */
export function MenuEmDia({ assinatura }: { assinatura: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const desenhada = useRef(assinatura)
  const primeira = useRef(true)
  // A que já pediu o redesenho: se o redesenho não a trouxe, não pede de novo a cada navegação.
  const pedida = useRef<string | null>(null)
  useEffect(() => { desenhada.current = assinatura }, [assinatura])

  useEffect(() => {
    // A primeira tela já veio com o menu de agora.
    if (primeira.current) { primeira.current = false; return }
    const controle = new AbortController()
    fetch(ROTA_DA_ASSINATURA_DO_MENU, { cache: 'no-store', signal: controle.signal })
      .then(r => (r.ok ? r.json() : null))
      .then((d: { assinatura?: string } | null) => {
        const agora = d?.assinatura
        if (!agora || agora === desenhada.current || agora === pedida.current) return
        pedida.current = agora
        router.refresh()
      })
      // Sem resposta, o menu fica como está: o recarregar o desenha.
      .catch(() => {})
    return () => controle.abort()
  }, [pathname, router])

  return null
}
