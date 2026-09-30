'use client'

import { useEffect, useRef } from 'react'

/**
 * A janela modal do sistema: `<dialog>` nativo aberto por `showModal()`.
 *
 * Os modais eram um `div` fixo com `z-index`, e isso dava dois defeitos. A
 * topbar desenhava por cima do cabeçalho deles, que é onde mora o botão de
 * fechar. E o formulário longo saía da tela sem rolagem. O `<dialog>` vai para
 * a camada de cima do navegador, acima de qualquer `z-index`. O
 * `.modal-container` limita a altura à tela e o corpo rola. No celular vira a
 * folha de baixo (globals.css).
 *
 * - Esc fecha sempre: o `close` do dialog chama `onFechar`, e o estado de quem
 *   abriu acompanha.
 * - O clique no fundo fecha, a não ser com `fechaNoFundo={false}` (formulário
 *   longo, em que um clique fora perderia o que foi digitado).
 * - `travado` segura os dois enquanto algo grava.
 */
export function JanelaModal({
  onFechar, rotulo, largura = 520, fechaNoFundo = true, travado = false, papel, children,
}: {
  onFechar: () => void
  /** Nome acessível da janela (o título dela). */
  rotulo: string
  largura?: number
  fechaNoFundo?: boolean
  travado?: boolean
  papel?: 'alertdialog'
  children: React.ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (d && !d.open) d.showModal()
  }, [])
  return (
    <dialog ref={ref} className="modal modal-flex" style={{ maxWidth: largura, textAlign: 'left' }}
      aria-label={rotulo} role={papel}
      onCancel={e => { if (travado) e.preventDefault() }}
      onClose={onFechar}
      onClick={e => { if (fechaNoFundo && !travado && e.target === ref.current) onFechar() }}>
      <div className="modal-container">
        <div className="modal-body">{children}</div>
      </div>
    </dialog>
  )
}
