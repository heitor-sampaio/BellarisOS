'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

interface NavItemProps {
  icon: ReactNode
  label: string
  href: string
}

export function NavItem({ icon, label, href }: NavItemProps) {
  const pathname = usePathname()
  const active = pathname === href || pathname.startsWith(href + '/')

  return (
    <Link
      href={href}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '9px 12px',
        borderRadius: 'var(--radius-field-token)',
        fontSize: 'var(--text-sm-sz)',
        fontWeight: 'var(--weight-bold)',
        textDecoration: 'none',
        transition: 'background 120ms ease, color 120ms ease, box-shadow 120ms ease',
        background: active ? 'var(--brand)' : 'transparent',
        color: active ? 'var(--on-brand)' : 'var(--text-muted)',
        boxShadow: active ? 'var(--shadow-nav-active)' : 'none',
      }}
    >
      <span style={{ width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {icon}
      </span>
      {label}
    </Link>
  )
}
