'use client'

import { useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { textoDoAviso } from '@/lib/aviso-da-url'

/**
 * Mostra o aviso que um redirecionamento do servidor deixou na URL
 * (`?aviso=`, `lib/aviso-da-url.ts` — J-29) e o tira dela: recarregar a tela
 * não o repete. O toast tem id: o efeito duplo do modo estrito não o duplica.
 */
export function AvisoDaUrl() {
  const chave = useSearchParams().get('aviso')
  useEffect(() => {
    const texto = textoDoAviso(chave)
    if (!texto) return
    toast.warning(texto, { id: `aviso-da-url-${chave}` })
    const url = new URL(window.location.href)
    url.searchParams.delete('aviso')
    window.history.replaceState(null, '', url)
  }, [chave])
  return null
}
