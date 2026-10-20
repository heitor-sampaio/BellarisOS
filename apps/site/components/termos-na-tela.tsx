'use client'

import { useEffect } from 'react'

/** A folga da borda da tela, em px. */
const FOLGA = 8

/**
 * Mantém a explicação de cada termo (components/termo.tsx) DENTRO da tela
 * (2026-10-20). Ela abre acima do termo, alinhada à esquerda dele — no
 * celular, um termo do lado direito a empurrava para fora. Quando ela abre
 * (mouse ou foco), mede e desloca o que sobrou pela direita ou pela esquerda;
 * sem espaço em cima, abre embaixo. Sem JS, abre como sempre.
 */
export function TermosNaTela() {
  useEffect(() => {
    const ajustar = (ev: Event) => {
      const termo = (ev.target as Element | null)?.closest?.('.site-termo')
      const dica = termo?.querySelector<HTMLElement>('.site-termo-dica')
      if (!dica) return
      dica.style.removeProperty('--termo-x')
      dica.removeAttribute('data-abaixo')
      const r = dica.getBoundingClientRect()
      if (!r.width) return
      let x = 0
      if (r.right > window.innerWidth - FOLGA) x = window.innerWidth - FOLGA - r.right
      if (r.left + x < FOLGA) x = FOLGA - r.left
      if (x) dica.style.setProperty('--termo-x', `${Math.round(x)}px`)
      if (r.top < FOLGA) dica.setAttribute('data-abaixo', '')
    }
    document.addEventListener('pointerover', ajustar)
    document.addEventListener('focusin', ajustar)
    return () => {
      document.removeEventListener('pointerover', ajustar)
      document.removeEventListener('focusin', ajustar)
    }
  }, [])
  return null
}
