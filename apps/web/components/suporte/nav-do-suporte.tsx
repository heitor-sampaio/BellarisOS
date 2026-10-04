'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

/**
 * As abas do portal do SUPORTE (o atendimento). Chamados mostra quantos
 * esperam o suporte (situação "aberto"), contados no layout. Equipe,
 * auditoria e a gestão das redes moram no /sistema (só ADMIN).
 */
export function NavDoSuporte({ naFila }: { naFila: number }) {
  const pathname = usePathname()
  const itens = [
    { href: '/suporte/chamados',  rotulo: 'Chamados', contador: naFila },
    { href: '/suporte/redes',     rotulo: 'Redes' },
  ]
  return (
    <nav className="suporte-nav" aria-label="Portal do suporte">
      {itens.map(i => {
        const ativo = pathname === i.href || pathname.startsWith(i.href + '/')
        return (
          <Link key={i.href} href={i.href} className="suporte-nav-item" aria-current={ativo ? 'page' : undefined}>
            {i.rotulo}
            {'contador' in i && !!i.contador && <span className="suporte-contador" aria-label={`${i.contador} em aberto`}>{i.contador}</span>}
          </Link>
        )
      })}
    </nav>
  )
}
