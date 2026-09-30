'use client'

import { useSyncExternalStore, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { ChevronDown } from 'lucide-react'
import { NavItem } from '@/components/shared/nav-item'

/**
 * Uma categoria do menu lateral (Atendimento, Vendas…), que se recolhe e se
 * expande pelo título. Serve aos dois menus, o da rede e o da unidade.
 *
 * - **Nasce aberta.** Recolher é escolha de quem usa: o menu não esconde nada
 *   sem ninguém pedir.
 * - **Recolhida, a página em que se está continua à mostra.** A categoria
 *   fechada ainda mostra o item ativo, então a pessoa nunca perde de vista onde
 *   está, e fechar a categoria da tela aberta não a esconde.
 * - **Lembra por navegador** (`localStorage`), como o "Recolher" da barra. É
 *   conveniência de tela, não dado: sem armazenamento, tudo fica aberto.
 * - Com a barra recolhida em ícones, as categorias não se recolhem: ali o
 *   título já não aparece e cada ícone precisa estar à mão.
 */

const CHAVE = 'menu-secoes-fechadas'

const ouvintes = new Set<() => void>()
function assinar(avisar: () => void) {
  ouvintes.add(avisar)
  return () => { ouvintes.delete(avisar) }
}
function lerCru(): string {
  try { return localStorage.getItem(CHAVE) ?? '[]' } catch { return '[]' }
}
function fechadasDe(cru: string): string[] {
  try {
    const v = JSON.parse(cru)
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch { return [] }
}
function alternar(chave: string) {
  const atual = fechadasDe(lerCru())
  const nova = atual.includes(chave) ? atual.filter(c => c !== chave) : [...atual, chave]
  try { localStorage.setItem(CHAVE, JSON.stringify(nova)) } catch { /* sem armazenamento: vale até recarregar */ }
  ouvintes.forEach(avisar => avisar())
}

export interface EntradaDoMenu { key: string; label: string; href: string }

export function SecaoDoMenu({ chave, titulo, entradas, icones, recolhida, filete }: {
  /** null = os itens soltos do topo (Dashboard), que não têm título. */
  chave:     string | null
  titulo:    string | null
  entradas:  EntradaDoMenu[]
  icones:    Record<string, ReactNode>
  /** A barra inteira está recolhida em ícones. */
  recolhida: boolean
  /** Cor do filete que separa as categorias na barra recolhida. */
  filete:    string
}) {
  const pathname = usePathname()
  // A string crua é o retrato estável para o useSyncExternalStore; o array sai dela.
  const cru = useSyncExternalStore(assinar, lerCru, () => '[]')
  const fechada = !recolhida && chave !== null && fechadasDe(cru).includes(chave)

  const ativa = (href: string) => pathname === href || pathname.startsWith(href + '/')
  const visiveis = fechada ? entradas.filter(e => ativa(e.href)) : entradas
  const idDaLista = chave ? `menu-secao-${chave}` : undefined

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {titulo && chave && (recolhida
        ? <div aria-hidden style={{ height: 1, background: filete, margin: '6px 10px 5px' }} />
        : (
          <button
            type="button"
            className="menu-secao-titulo"
            aria-expanded={!fechada}
            aria-controls={idDaLista}
            // O <nav> fecha a barra no celular a cada clique (é o clique num
            // item que navega); abrir ou fechar uma categoria não é navegar.
            onClick={e => { e.stopPropagation(); alternar(chave) }}
          >
            <span className="overline">{titulo}</span>
            <ChevronDown size={12} aria-hidden className="menu-secao-seta" data-fechada={fechada || undefined} />
          </button>
        )
      )}
      <div id={idDaLista} style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {visiveis.map(e => (
          <NavItem key={e.key} icon={icones[e.key]} label={e.label} href={e.href} />
        ))}
      </div>
    </div>
  )
}
