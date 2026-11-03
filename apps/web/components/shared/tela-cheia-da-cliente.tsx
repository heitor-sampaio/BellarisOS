'use client'

import { useEffect, useRef } from 'react'

/**
 * A tela ENTREGUE à cliente na clínica (A40 da 5ª simulação): "Entregar ao
 * cliente" mantinha o menu, a busca e o usuário da equipe à vista de quem
 * assinava no tablet. Agora o documento, o aceite e a assinatura vão para a
 * camada de cima do navegador (`<dialog>` com `showModal()`, a tela inteira):
 * o resto da página fica coberto e inerte. O Esc não a fecha — quem devolve o
 * aparelho é o "Continuar"/"Voltar" do fim.
 */
export function TelaCheiaDaCliente({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (d && !d.open) {
      try { d.showModal() } catch { /* sem suporte: fica como bloco comum */ }
    }
    return () => { if (d?.open) d.close() }
  }, [])
  return (
    <dialog
      ref={ref}
      data-tela-da-cliente
      aria-label="Assinatura da cliente"
      onCancel={e => e.preventDefault()}
      style={{
        margin: 0, border: 'none', width: '100vw', maxWidth: '100vw', height: '100dvh', maxHeight: '100dvh',
        padding: 'calc(16px + env(safe-area-inset-top, 0px)) 16px calc(16px + env(safe-area-inset-bottom, 0px))',
        background: 'var(--bg-app)', overflowY: 'auto',
      }}
    >
      {children}
    </dialog>
  )
}
