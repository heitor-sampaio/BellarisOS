'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Power } from 'lucide-react'

/**
 * O Reativar da unidade (D10 da 33ª simulação; PN-11, "a tela diz o limite";
 * CLAUDE.md §14). A recusa — o limite do plano cheio, ou não ser a Admin da
 * rede — aparece ao lado do botão, como no criar; era um `<form>` de servidor
 * que lançava, e a tela inteira virava "Limite do plano atingido". As duas
 * portas (a lista de unidades e o detalhe) passam a action delas.
 */
export function ReativarUnidade({ reativar, className = 'btn-ghost', style }: {
  reativar:   () => Promise<{ error?: string }>
  className?: string
  style?:     React.CSSProperties
}) {
  const router = useRouter()
  const [recusa, setRecusa] = useState<string | null>(null)
  const [fazendo, iniciar] = useTransition()

  function clicar() {
    setRecusa(null)
    iniciar(async () => {
      try {
        const r = await reativar()
        if (r?.error) { setRecusa(r.error); return }
        router.refresh()
      } catch {
        setRecusa('Não deu certo. Tente de novo.')
      }
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
      <button type="button" className={className} style={style} disabled={fazendo} onClick={clicar}>
        <Power size={13} /> {fazendo ? 'Um momento…' : 'Reativar'}
      </button>
      {recusa && (
        <p role="alert" data-reativar-unidade-recusa
          style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 'var(--weight-semibold)', color: 'var(--danger)', lineHeight: 'var(--leading-snug)', maxWidth: 360 }}>
          {recusa}
        </p>
      )}
    </div>
  )
}
