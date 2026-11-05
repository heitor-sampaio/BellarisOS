'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Avisa antes de sair de uma tela com alteração não salva (A12 da 7ª
 * simulação, 2026-11-05: a Camila montou uma automação, clicou em
 * "Automações" e perdeu o fluxo sem aviso nenhum).
 *
 * - Fechar a aba, recarregar ou digitar outro endereço: o aviso do navegador
 *   (`beforeunload` — o texto é dele, não nosso).
 * - Um link DENTRO do app (o menu, o "← Automações"): o clique é segurado e a
 *   tela pergunta (`destino` fica com o endereço; `sair()` vai, `ficar()` fica).
 *   Clique com Ctrl/⌘/Shift, botão do meio ou `target` (abre em outra aba)
 *   passa: a tela atual não se perde.
 */
export function useAvisoAoSair(sujo: boolean): { destino: string | null; sair: () => void; ficar: () => void } {
  const [destino, setDestino] = useState<string | null>(null)
  const liberado = useRef(false)
  const router = useRouter()

  useEffect(() => {
    if (!sujo) return
    const antesDeSair = (e: BeforeUnloadEvent) => { if (!liberado.current) { e.preventDefault(); e.returnValue = '' } }
    const noClique = (e: MouseEvent) => {
      if (liberado.current || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return
      const url = new URL(a.href, window.location.href)
      if (url.origin !== window.location.origin) return
      if (url.pathname === window.location.pathname && url.search === window.location.search) return
      e.preventDefault()
      e.stopPropagation()
      setDestino(url.pathname + url.search + url.hash)
    }
    window.addEventListener('beforeunload', antesDeSair)
    document.addEventListener('click', noClique, true)
    return () => {
      window.removeEventListener('beforeunload', antesDeSair)
      document.removeEventListener('click', noClique, true)
    }
  }, [sujo])

  return {
    destino,
    sair: () => {
      if (!destino) return
      liberado.current = true
      router.push(destino)
    },
    ficar: () => setDestino(null),
  }
}
