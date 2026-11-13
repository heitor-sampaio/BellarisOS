'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

/**
 * A lista do menu lateral, que rola sozinha (o rodapé — Recolher, Trocar
 * senha, Sair — fica preso embaixo). A4 da 14ª simulação (princípio 7): numa
 * tela de 900 px, o menu da rede terminava em "GESTÃO E CONFIGURAÇÃO", e
 * Equipe, Relatórios, Automações e Configurações ficavam abaixo, dentro da
 * rolagem, sem sinal de que havia mais — a dona achou que o grupo estava
 * recolhido. Com o fim da lista fora da vista, um "Mais abaixo" preso no pé da
 * lista diz que ela continua, e o toque rola até o fim. A barra de rolagem
 * segue fina (área de conteúdo, `design.md`): o sinal é o texto.
 *
 * Serve aos dois menus, o da rede e o da unidade.
 */
export function MenuComRolagem({ children, onClick, recolhida }: {
  children:  ReactNode
  /** O toque num item fecha a barra no celular. */
  onClick:   () => void
  /** A barra recolhida em ícones: o sinal é só a seta. */
  recolhida: boolean
}) {
  const ref = useRef<HTMLElement>(null)
  const [continua, setContinua] = useState(false)

  useEffect(() => {
    const nav = ref.current
    if (!nav) return
    const medir = () => setContinua(nav.scrollTop + nav.clientHeight < nav.scrollHeight - 8)
    medir()
    nav.addEventListener('scroll', medir, { passive: true })
    // A lista muda de altura quando uma categoria recolhe ou a janela muda.
    const observador = new ResizeObserver(medir)
    observador.observe(nav)
    for (const filho of Array.from(nav.children)) observador.observe(filho)
    const mutacoes = new MutationObserver(() => {
      for (const filho of Array.from(nav.children)) observador.observe(filho)
      medir()
    })
    mutacoes.observe(nav, { childList: true, subtree: true })
    return () => { nav.removeEventListener('scroll', medir); observador.disconnect(); mutacoes.disconnect() }
  }, [])

  return (
    <nav
      ref={ref}
      onClick={onClick}
      style={{
        display: 'flex', flexDirection: 'column', gap: 1,
        flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden',
        scrollbarWidth: 'thin',
      }}
    >
      {children}
      {continua && (
        <button
          type="button"
          data-menu-continua
          className="menu-continua"
          data-recolhida={recolhida || undefined}
          aria-label="Mais itens abaixo no menu"
          onClick={e => {
            // Rolar o menu não é navegar: a barra do celular continua aberta.
            e.stopPropagation()
            ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: 'smooth' })
          }}
        >
          <ChevronDown size={14} aria-hidden />
          {!recolhida && <span>Mais abaixo</span>}
        </button>
      )}
    </nav>
  )
}
