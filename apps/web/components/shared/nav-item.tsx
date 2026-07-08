'use client'
import { usePathname, useRouter } from 'next/navigation'
import { useTransition, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { emitNavStart } from '@/components/shared/navigation-progress'
import { useSidebar } from '@/components/shared/sidebar-context'

interface NavItemProps {
  icon:  ReactNode
  label: string
  href:  string
}

export function NavItem({ icon, label, href }: NavItemProps) {
  const pathname             = usePathname()
  const router               = useRouter()
  const [isPending, startT]  = useTransition()
  const { collapsed }        = useSidebar()

  const active     = pathname === href || pathname.startsWith(href + '/')
  const showActive = active || isPending

  function handleClick() {
    if (active && !isPending) return
    emitNavStart()
    startT(() => router.push(href))
  }

  // Expandido = sidebar branco (original): ativo = pill rosé + texto branco.
  // Recolhido = sidebar rosé: ativo = pill branco + texto rosé; inativo = branco translúcido.
  const background = showActive
    ? (collapsed ? 'var(--on-brand)' : 'var(--brand)')
    : 'transparent'
  const color = showActive
    ? (collapsed ? 'var(--brand)' : 'var(--on-brand)')
    : (collapsed ? 'rgba(255,255,255,0.85)' : 'var(--text-muted)')
  const boxShadow = showActive
    ? (collapsed ? '0 6px 16px -6px rgba(90, 20, 40, 0.4)' : 'var(--shadow-nav-active)')
    : 'none'

  return (
    <button
      type="button"
      onClick={handleClick}
      title={collapsed ? label : undefined}
      onMouseEnter={e => { if (!showActive && collapsed) e.currentTarget.style.background = 'rgba(255,255,255,0.14)' }}
      onMouseLeave={e => { if (!showActive) e.currentTarget.style.background = 'transparent' }}
      style={{
        // Layout constante entre estados (ícone não "pula"): a largura da barra é
        // que anima; o rótulo some com fade + clip conforme encolhe.
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'flex-start',
        gap:            10,
        padding:        '9px 12px',
        borderRadius:   'var(--radius-field-token)',
        fontSize:       'var(--text-sm-sz)',
        fontWeight:     'var(--weight-bold)',
        border:         'none',
        cursor:         active && !isPending ? 'default' : 'pointer',
        width:          '100%',
        textAlign:      'left',
        whiteSpace:     'nowrap',
        overflow:       'hidden',
        transition:     'background 120ms ease, color 120ms ease, box-shadow 120ms ease',
        background,
        color,
        boxShadow,
      }}
    >
      <span style={{ width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {isPending
          ? <Loader2 size={16} style={{ animation: 'spin 0.7s linear infinite' }} />
          : icon}
      </span>
      <span style={{
        opacity:    collapsed ? 0 : 1,
        transition: 'opacity 160ms ease',
        overflow:   'hidden',
        textOverflow: 'ellipsis',
      }}>
        {label}
      </span>
    </button>
  )
}
