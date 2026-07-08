'use client'
import { usePathname, useRouter } from 'next/navigation'
import { useTransition, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { emitNavStart } from '@/components/shared/navigation-progress'

interface NavItemProps {
  icon:  ReactNode
  label: string
  href:  string
}

export function NavItem({ icon, label, href }: NavItemProps) {
  const pathname             = usePathname()
  const router               = useRouter()
  const [isPending, startT]  = useTransition()

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
      style={{
        display:        'flex',
        alignItems:     'center',
        gap:            10,
        padding:        '9px 12px',
        borderRadius:   'var(--radius-field-token)',
        fontSize:       'var(--text-sm-sz)',
        fontWeight:     'var(--weight-bold)',
        border:         'none',
        cursor:         active && !isPending ? 'default' : 'pointer',
        width:          '100%',
        textAlign:      'left',
        transition:     'background 80ms ease, color 80ms ease, box-shadow 80ms ease',
        background:     showActive ? 'var(--brand)' : 'transparent',
        color:          showActive ? 'var(--on-brand)' : 'var(--text-muted)',
        boxShadow:      showActive ? 'var(--shadow-nav-active)' : 'none',
      }}
    >
      <span style={{ width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {isPending
          ? <Loader2 size={16} style={{ animation: 'spin 0.7s linear infinite' }} />
          : icon}
      </span>
      {label}
    </button>
  )
}
