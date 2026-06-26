'use client'

import { useState } from 'react'
import {
  LayoutGrid, Calendar, Users, Sparkles,
  Package, CreditCard, Settings, LogOut, UserCircle,
  ArrowLeft, ChevronDown, Check,
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

export function BranchSidebar({
  slug, branchName, permissions, isNetworkAdmin, allBranches = [],
}: BranchSidebarProps) {
  const base = `/${slug}`
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const { isOpen, close } = useSidebar()

  return (
    <>
      {/* Scrim (overlay) — clique fecha o sidebar no mobile */}
      {isOpen && (
        <div className="sidebar-scrim" onClick={close} aria-hidden="true" />
      )}

      <aside
        className={`main-sidebar${isOpen ? ' sidebar-open' : ''}`}
        style={{
          position:        'fixed',
          left:            0,
          top:             0,
          bottom:          0,
          width:           244,
          background:      'var(--surface)',
          borderRight:     '1px solid var(--border)',
          display:         'flex',
          flexDirection:   'column',
          padding:         '0 12px',
          zIndex:          50,
          overflowY:       'auto',
        }}
      >
        {/* Wordmark */}
        <div style={{
          height:       'var(--topbar-h)',
          display:      'flex',
          alignItems:   'center',
          paddingLeft:  4,
          borderBottom: '1px solid var(--hairline)',
          marginBottom: 8,
          flexShrink:   0,
        }}>
          <span style={{
            fontSize:      18,
            fontWeight:    'var(--weight-extrabold)',
            color:         'var(--brand)',
            letterSpacing: 'var(--tracking-tight)',
          }}>
            Lumière ✦
          </span>
        </div>

        {/* Network admin: voltar para rede + seletor de filial */}
        {isNetworkAdmin ? (
          <div style={{ padding: '0 4px', marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <a
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
            </a>

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
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {branchName}
                </span>
                <ChevronDown size={13} style={{ flexShrink: 0, transform: switcherOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
              </button>

              {switcherOpen && (
                <>
                  <div
                    style={{ position: 'fixed', inset: 0, zIndex: 49 }}
                    onClick={() => setSwitcherOpen(false)}
                  />
                  <div style={{
                    position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
                    background: 'var(--surface)', border: '1px solid var(--border)',
                    borderRadius: 10, zIndex: 51,
                    boxShadow: '0 8px 24px -6px rgba(34,22,25,.14)',
                    overflow: 'hidden',
                  }}>
                    {allBranches.map(b => (
                      <a
                        key={b.slug}
                        href={`/${b.slug}/dashboard`}
                        onClick={() => { setSwitcherOpen(false); close() }}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '9px 12px', textDecoration: 'none',
                          fontSize: 12, fontWeight: b.slug === slug ? 700 : 500,
                          color: b.slug === slug ? 'var(--brand)' : 'var(--text)',
                          borderBottom: '1px solid var(--hairline)',
                          transition: 'background 0.1s',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-app)')}
                        onMouseLeave={e => (e.currentTarget.style.background = '')}
                      >
                        {b.name}
                        {b.slug === slug && <Check size={12} color="var(--brand)" />}
                      </a>
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
        )}

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

        {/* Logout */}
        <div style={{ paddingBottom: 16, borderTop: '1px solid var(--hairline)', paddingTop: 12, flexShrink: 0 }}>
          <form action={logoutAction}>
            <button
              type="submit"
              className="btn-ghost"
              style={{ width: '100%', justifyContent: 'flex-start', gap: 10 }}
            >
              <LogOut size={16} />
              Sair
            </button>
          </form>
        </div>
      </aside>
    </>
  )
}
