'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, CalendarDays, Clock3, UserCircle2 } from 'lucide-react'

interface Props { slug: string }

const TABS = [
  { path: 'home',         Icon: Home,           label: 'Início' },
  { path: 'agendamentos', Icon: CalendarDays,    label: 'Agenda' },
  { path: 'historico',    Icon: Clock3,          label: 'Histórico' },
  { path: 'perfil',       Icon: UserCircle2,     label: 'Perfil' },
]

export function ClientPortalNav({ slug }: Props) {
  const pathname = usePathname()

  return (
    <nav
      aria-label="Navegação principal"
      style={{
        position:      'fixed',
        bottom:        0,
        left:          '50%',
        transform:     'translateX(-50%)',
        width:         'min(100%, 640px)',
        zIndex:        100,
        background:    'var(--surface)',
        borderTop:     '1px solid var(--hairline)',
        display:       'flex',
        height:        'calc(60px + env(safe-area-inset-bottom, 0px))',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      {TABS.map(({ path, Icon, label }) => {
        const href   = `/${slug}/cliente/${path}`
        const active = pathname.startsWith(href)
        return (
          <Link
            key={path}
            href={href}
            style={{
              flex:           1,
              display:        'flex',
              flexDirection:  'column',
              alignItems:     'center',
              justifyContent: 'center',
              gap:            3,
              color:          active ? 'var(--brand)' : 'var(--text-faint)',
              textDecoration: 'none',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <Icon size={22} strokeWidth={active ? 2.5 : 1.8} />
            <span style={{
              fontSize:      10,
              fontWeight:    active ? 700 : 500,
              letterSpacing: '0.02em',
            }}>
              {label}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
