'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { Check, ChevronDown } from 'lucide-react'
import { rotaNaOutraUnidade } from '@/lib/rotas'
import { COOKIE_DA_ULTIMA_UNIDADE } from '@/lib/unidades/do-membro'

/**
 * "Unidade: Centro ▾" no topo (PO1 do Bloco Portais, 2026-11-14): a pessoa de
 * VÁRIAS unidades (EQ1a) troca de uma das dela para outra, na MESMA tela
 * (`rotaNaOutraUnidade`, lib/rotas). Só as unidades dela; quem tem a rede
 * inteira usa o portal da rede, e quem tem uma só não vê o seletor.
 *
 * Também anota a ÚLTIMA unidade usada (o cookie `bellaris-unidade`): o login
 * volta a ela. O servidor confere que ela ainda é da pessoa.
 */
export function SeletorDeUnidade({ atual, unidades }: {
  atual: { slug: string; name: string }
  unidades: { slug: string; name: string }[]
}) {
  const [aberto, setAberto] = useState(false)
  const pathname = usePathname()
  const router = useRouter()
  const raiz = useRef<HTMLDivElement>(null)

  useEffect(() => {
    document.cookie = `${COOKIE_DA_ULTIMA_UNIDADE}=${encodeURIComponent(atual.slug)}; path=/; max-age=31536000; samesite=lax`
  }, [atual.slug])

  useEffect(() => {
    if (!aberto) return
    const fora = (e: MouseEvent) => { if (!raiz.current?.contains(e.target as Node)) setAberto(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false) }
    document.addEventListener('mousedown', fora)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc) }
  }, [aberto])

  const trocar = (slug: string) => {
    setAberto(false)
    if (slug === atual.slug) return
    router.push(rotaNaOutraUnidade(pathname, slug, typeof window === 'undefined' ? '' : window.location.search))
  }

  return (
    <div ref={raiz} data-seletor-de-unidade style={{ position: 'relative', flexShrink: 0, minWidth: 0 }}>
      <button
        type="button"
        className="seletor-de-unidade"
        aria-haspopup="listbox"
        aria-expanded={aberto}
        onClick={() => setAberto(a => !a)}
      >
        <span className="seletor-de-unidade-rotulo">{'Unidade: '}</span>
        <span className="seletor-de-unidade-nome">{atual.name}</span>
        <ChevronDown size={13} aria-hidden style={{ flexShrink: 0, transform: aberto ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>
      {aberto && (
        <div role="listbox" aria-label="Trocar de unidade" className="seletor-de-unidade-painel">
          {unidades.map(u => (
            <button
              key={u.slug}
              type="button"
              role="option"
              aria-selected={u.slug === atual.slug}
              data-opcao-de-unidade
              onClick={() => trocar(u.slug)}
              className="seletor-de-unidade-opcao"
            >
              <span>{u.name}</span>
              {u.slug === atual.slug && <Check size={12} aria-hidden />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
