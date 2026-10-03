'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

/**
 * As abas do portal da plataforma. Equipe e Auditoria só para admin — a tela
 * confere de novo (o menu esconde, a página barra).
 */
export function NavDoSuporte({ ehAdmin }: { ehAdmin: boolean }) {
  const pathname = usePathname()
  const itens = [
    { href: '/suporte/redes',     rotulo: 'Redes' },
    ...(ehAdmin ? [
      { href: '/suporte/equipe',    rotulo: 'Equipe' },
      { href: '/suporte/auditoria', rotulo: 'Auditoria' },
    ] : []),
  ]
  return (
    <nav className="suporte-nav" aria-label="Portal do suporte">
      {itens.map(i => {
        const ativo = pathname === i.href || pathname.startsWith(i.href + '/')
        return (
          <Link key={i.href} href={i.href} className="suporte-nav-item" aria-current={ativo ? 'page' : undefined}>
            {i.rotulo}
          </Link>
        )
      })}
    </nav>
  )
}
