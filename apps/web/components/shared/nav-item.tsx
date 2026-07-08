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

  return (
    <button
      type="button"
      onClick={handleClick}
      title={collapsed ? label : undefined}
      onMouseEnter={e => { if (!showActive) e.currentTarget.style.background = 'rgba(255,255,255,0.14)' }}
      onMouseLeave={e => { if (!showActive) e.currentTarget.style.background = 'transparent' }}
      style={{
        display:        'flex',
        alignItems:     'center',
        justifyContent: collapsed ? 'center' : 'flex-start',
        gap:            collapsed ? 0 : 10,
        padding:        collapsed ? '10px 0' : '9px 12px',
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
        // Sidebar rosé: item ativo INVERTE (pill branco + texto rosé); inativo = branco translúcido
        background:     showActive ? 'var(--on-brand)' : 'transparent',
        color:          showActive ? 'var(--brand)' : 'rgba(255,255,255,0.85)',
        boxShadow:      showActive ? '0 6px 16px -6px rgba(90, 20, 40, 0.4)' : 'none',
      }}
    >
      <span style={{ width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {isPending
          ? <Loader2 size={16} style={{ animation: 'spin 0.7s linear infinite' }} />
          : icon}
      </span>
      {!collapsed && label}
    </button>
  )
}
