'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

/** As abas do /sistema — a administração do negócio (só ADMIN). */
const ITENS = [
  { href: '/',               rotulo: 'Painel', exato: true },
  { href: '/redes',         rotulo: 'Redes' },
  { href: '/planos',        rotulo: 'Planos' },
  { href: '/equipe',        rotulo: 'Equipe' },
  { href: '/auditoria',     rotulo: 'Auditoria' },
  { href: '/configuracoes', rotulo: 'Configurações' },
]

export function NavDoSistema() {
  const pathname = usePathname()
  return (
    <nav className="suporte-nav" aria-label="Administração do sistema">
      {ITENS.map(i => {
        const ativo = i.exato ? pathname === i.href : pathname === i.href || pathname.startsWith(i.href + '/')
        return (
          <Link key={i.href} href={i.href} className="suporte-nav-item" aria-current={ativo ? 'page' : undefined}>
            {i.rotulo}
          </Link>
        )
      })}
    </nav>
  )
}
