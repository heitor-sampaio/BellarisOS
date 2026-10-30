'use client'

import { useRef, useState } from 'react'
import { Info } from 'lucide-react'

/**
 * A dica ao lado de um número: o "i" que abre a definição dele (J-55/J-56,
 * 2026-10-30). Taxas parecidas davam números diferentes sem dizer por quê, e
 * nenhum rótulo dizia qual data cada número usa.
 *
 * Abre no clique (o toque do celular não tem "passar o mouse") e fecha ao sair
 * do botão ou no Esc. O painel flutua (`--shadow-popover`) e, perto da borda
 * direita, abre para a esquerda — senão nasceria fora da tela (design.md).
 */
export function Dica({ rotulo, children }: {
  /** O nome acessível do botão: "O que é a taxa de aproveitamento". */
  rotulo: string
  /** A definição. */
  children: React.ReactNode
}) {
  const [aberta, setAberta] = useState(false)
  const [paraEsquerda, setParaEsquerda] = useState(false)
  const botao = useRef<HTMLButtonElement>(null)

  function alternar() {
    const r = botao.current?.getBoundingClientRect()
    if (r) setParaEsquerda(r.left + 260 > window.innerWidth - 16)
    setAberta(v => !v)
  }

  return (
    <span data-dica style={{ position: 'relative', display: 'inline-flex', verticalAlign: 'middle' }}>
      <button
        ref={botao}
        type="button"
        aria-label={rotulo}
        aria-expanded={aberta}
        onClick={e => { e.stopPropagation(); alternar() }}
        onBlur={() => setAberta(false)}
        onKeyDown={e => { if (e.key === 'Escape') setAberta(false) }}
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          padding: 2, border: 'none', background: 'transparent', cursor: 'pointer',
          // A cor do rótulo em que mora: no cartão rosé, o branco dele.
          color: 'currentColor', opacity: aberta ? 1 : 0.7, lineHeight: 0,
        }}
      >
        <Info size={13} />
      </button>
      {aberta && (
        <span
          role="tooltip"
          style={{
            position: 'absolute', top: 'calc(100% + 6px)', zIndex: 30,
            ...(paraEsquerda ? { right: 0 } : { left: 0 }),
            width: 'min(260px, calc(100vw - 32px))',
            padding: '10px 12px', borderRadius: 'var(--radius-field-token)',
            background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-popover)',
            fontSize: 'var(--text-xs-sz)', fontWeight: 500, lineHeight: 1.45, color: 'var(--text-muted)',
            textTransform: 'none', letterSpacing: 'normal', whiteSpace: 'normal', textAlign: 'left',
          }}
        >
          {children}
        </span>
      )}
    </span>
  )
}
