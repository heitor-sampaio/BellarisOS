'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

/**
 * Os dois portais da plataforma, para quem é ADMIN: o Sistema (administrar o
 * negócio) e o Suporte (atender as clínicas). O SUPORTE nem vê o seletor — e
 * o /sistema o recusa por si (`getPlatformContext({ papel: 'ADMIN' })`).
 */
export function SeletorDePortal() {
  const pathname = usePathname()
  const noSistema = pathname === '/sistema' || pathname.startsWith('/sistema/')
  return (
    <nav className="portal-seletor" aria-label="Portal da plataforma">
      <Link href="/sistema" className="portal-seletor-item" aria-current={noSistema ? 'page' : undefined}>Sistema</Link>
      <Link href="/suporte" className="portal-seletor-item" aria-current={noSistema ? undefined : 'page'}>Suporte</Link>
    </nav>
  )
}
