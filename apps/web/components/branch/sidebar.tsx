'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  LayoutGrid, Calendar, Users, Sparkles,
  Package, CreditCard, LogOut, UserCircle,
  ArrowLeft, ChevronDown, Check, ChevronLeft, ChevronRight,
} from 'lucide-react'
import { NavItem }    from '@/components/shared/nav-item'
import { logoutAction } from '@/actions/auth'
import { useSidebar } from '@/components/shared/sidebar-context'
import type { ResolvedPermissions } from '@/lib/permissions'

interface BranchSidebarProps {
  slug:            string
  branchName:      string
  permissions:     ResolvedPermissions
  isNetworkAdmin?: boolean
  allBranches?:    { name: string; slug: string }[]
}

const SIDEBAR_GRADIENT = 'linear-gradient(165deg, var(--brand) 0%, var(--brand-deep) 100%)'

export function BranchSidebar({
  slug, branchName, permissions, isNetworkAdmin, allBranches = [],
}: BranchSidebarProps) {
  const base = `/${slug}`
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const { isOpen, close, collapsed, toggleCollapsed } = useSidebar()

  // Recolhido = rosé; expandido = branco (original)
  const asideBg     = collapsed ? SIDEBAR_GRADIENT : 'var(--surface)'
  const asideBorder = collapsed ? 'none' : '1px solid var(--border)'
  const hairline    = collapsed ? '1px solid rgba(255,255,255,0.15)' : '1px solid var(--hairline)'
  const wordColor   = collapsed ? 'var(--on-brand)' : 'var(--brand)'
  const footerColor = collapsed ? 'var(--on-brand)' : 'var(--text-muted)'
  const footerHover = collapsed ? 'rgba(255,255,255,0.14)' : 'var(--bg-app)'

  return (
    <>
      {isOpen && <div className="sidebar-scrim" onClick={close} aria-hidden="true" />}

      <aside
        className={`main-sidebar${isOpen ? ' sidebar-open' : ''}`}
        style={{
          position:      'fixed',
          left:          0, top: 0, bottom: 0,
          background:    asideBg,
          borderRight:   asideBorder,
          display:       'flex',
          flexDirection: 'column',
          padding:       '0 12px',
          zIndex:        50,
          overflowY:     'auto',
          overflowX:     'hidden',
        }}
      >
        {/* Wordmark */}
        <div style={{
          height:         'var(--topbar-h)',
          display:        'flex',
          alignItems:     'center',
          justifyContent: collapsed ? 'center' : 'flex-start',
          paddingLeft:    collapsed ? 0 : 4,
          borderBottom:   hairline,
          marginBottom:   8,
          flexShrink:     0,
        }}>
          <span style={{
            fontSize:      18,
            fontWeight:    'var(--weight-extrabold)',
            color:         wordColor,
            letterSpacing: 'var(--tracking-tight)',
          }}>
            {collapsed ? '✦' : 'Lumière ✦'}
          </span>
        </div>

        {/* Network admin: voltar para rede + seletor (oculto quando recolhido) */}
        {!collapsed && (isNetworkAdmin ? (
          <div style={{ padding: '0 4px', marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Link
              href="/admin/dashboard"
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '5px 8px', borderRadius: 8,
                fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
                textDecoration: 'none', letterSpacing: '0.03em',
                transition: 'background 0.1s, color 0.1s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-app)'; e.currentTarget.style.color = 'var(--brand)' }}
              onMouseLeave={e => { e.currentTarget.style.background = ''; e.currentTarget.style.color = 'var(--text-muted)' }}
            >
              <ArrowLeft size={13} />
              Voltar para a rede
            </Link>

            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setSwitcherOpen(o => !o)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '7px 10px', borderRadius: 8, cursor: 'pointer',
                  background: 'var(--brand-soft)', border: '1.5px solid var(--brand-soft-border)',
                  fontSize: 12, fontWeight: 700, color: 'var(--brand)',
                  transition: 'background 0.1s',
                }}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{branchName}</span>
                <ChevronDown size={13} style={{ flexShrink: 0, transform: switcherOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
              </button>

              {switcherOpen && (
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 49 }} onClick={() => setSwitcherOpen(false)} />
                  <div style={{
                    position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
                    background: 'var(--surface)', border: '1px solid var(--border)',
                    borderRadius: 10, zIndex: 51, boxShadow: '0 8px 24px -6px rgba(34,22,25,.14)', overflow: 'hidden',
                  }}>
                    {allBranches.map(b => (
                      <Link
                        key={b.slug}
                        href={`/${b.slug}/dashboard`}
                        onClick={() => { setSwitcherOpen(false); close() }}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '9px 12px', textDecoration: 'none',
                          fontSize: 12, fontWeight: b.slug === slug ? 700 : 500,
                          color: b.slug === slug ? 'var(--brand)' : 'var(--text)',
                          borderBottom: '1px solid var(--hairline)', transition: 'background 0.1s',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-app)')}
                        onMouseLeave={e => (e.currentTarget.style.background = '')}
                      >
                        {b.name}
                        {b.slug === slug && <Check size={12} color="var(--brand)" />}
                      </Link>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        ) : (
          <div style={{ padding: '4px 12px', marginBottom: 16 }}>
            <span className="overline">{branchName}</span>
          </div>
        ))}

        {/* Navegação */}
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }} onClick={close}>
          <NavItem icon={<LayoutGrid size={18} />} label="Dashboard"      href={`${base}/dashboard`} />
          {permissions.agenda.view     && <NavItem icon={<Calendar    size={18} />} label="Agenda"        href={`${base}/agenda`} />}
          {permissions.clients.view    && <NavItem icon={<Users       size={18} />} label="Clientes"      href={`${base}/clients`} />}
          {permissions.financial.view  && <NavItem icon={<CreditCard  size={18} />} label="Financeiro"    href={`${base}/financial`} />}
          {permissions.procedures.view && <NavItem icon={<Sparkles    size={18} />} label="Procedimentos" href={`${base}/procedures`} />}
          {permissions.stock.view      && <NavItem icon={<Package     size={18} />} label="Estoque"       href={`${base}/stock`} />}
          {permissions.settings.view   && <NavItem icon={<UserCircle  size={18} />} label="Equipe"        href={`${base}/settings/team`} />}
        </nav>

        {/* Rodapé: recolher (desktop) + logout */}
        <div style={{ paddingBottom: 16, borderTop: hairline, paddingTop: 12, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <button
            type="button"
            onClick={toggleCollapsed}
            className="hide-mobile"
            title={collapsed ? 'Expandir menu' : 'Recolher menu'}
            aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start',
              gap: collapsed ? 0 : 10, padding: collapsed ? '10px 0' : '9px 12px',
              borderRadius: 'var(--radius-field-token)', border: 'none', cursor: 'pointer',
              background: 'transparent', color: footerColor,
              fontSize: 'var(--text-sm-sz)', fontWeight: 'var(--weight-bold)', width: '100%',
              transition: 'background 120ms ease',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = footerHover)}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <span style={{ width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
            </span>
            {!collapsed && 'Recolher'}
          </button>

          <form action={logoutAction}>
            <button
              type="submit"
              title={collapsed ? 'Sair' : undefined}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start',
                gap: collapsed ? 0 : 10, padding: collapsed ? '10px 0' : '9px 12px',
                borderRadius: 'var(--radius-field-token)', border: 'none', cursor: 'pointer',
                background: 'transparent', color: footerColor,
                fontSize: 'var(--text-sm-sz)', fontWeight: 'var(--weight-bold)', width: '100%',
                transition: 'background 120ms ease',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = footerHover)}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{ width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <LogOut size={16} />
              </span>
              {!collapsed && 'Sair'}
            </button>
          </form>
        </div>
      </aside>
    </>
  )
}
