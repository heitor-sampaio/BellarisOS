'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  LayoutGrid, Calendar, Users, Sparkles,
  Package, CreditCard, LogOut, UserCircle, Layers, ClipboardList, BarChart3,
  ArrowLeft, ChevronDown, Check, ChevronLeft, ChevronRight, Inbox, ClipboardCheck, Settings,
  Syringe,
} from 'lucide-react'
import { NavItem }    from '@/components/shared/nav-item'
import { logoutAction } from '@/actions/auth'
import { useSidebar } from '@/components/shared/sidebar-context'
import { BRANCH_MENU, menuSectionsFor } from '@/lib/menu'
import type { ResolvedPermissions } from '@/lib/permissions'

// Ver o comentário em lib/menu.ts: a lista e os gates são compartilhados com a
// pré-visualização da tela de cargos.
const ICONS: Record<string, React.ReactNode> = {
  dashboard:  <LayoutGrid size={18} />,
  agenda:     <Calendar   size={18} />,
  clients:    <Users      size={18} />,
  planejamentos:<ClipboardList size={18} />,
  injetaveis:   <Syringe      size={18} />,
  checkout:   <ClipboardCheck size={18} />,
  inbox:        <Inbox    size={18} />,
  oportunidades:<Layers   size={18} />,
  reports:    <BarChart3  size={18} />,
  financial:  <CreditCard size={18} />,
  procedures: <Sparkles   size={18} />,
  stock:      <Package    size={18} />,
  team:       <UserCircle    size={18} />,
  settings:   <Settings      size={18} />,
}

interface BranchSidebarProps {
  slug:            string
  branchName:      string
  permissions:     ResolvedPermissions
  isNetworkAdmin?: boolean
  allBranches?:    { name: string; slug: string }[]
}

const SIDEBAR_GRADIENT = 'var(--gradient-brand)'

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
  const separatorBg = collapsed ? 'rgba(255,255,255,0.18)' : 'var(--hairline)'

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
          padding:       'env(safe-area-inset-top, 0px) 12px env(safe-area-inset-bottom, 0px)',
          zIndex:        50,
          // Quem rola é a lista, não a barra: com o aside rolando inteiro, o
          // rodapé (Recolher/Sair) sumia junto em tela baixa e a pessoa tinha
          // que descobrir que precisava rolar para sair do sistema.
          overflow:      'hidden',
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
          marginBottom:   6,
          flexShrink:     0,
        }}>
          <span style={{
            fontSize:      18,
            fontWeight:    'var(--weight-extrabold)',
            color:         wordColor,
            letterSpacing: 'var(--tracking-tight)',
          }}>
            {collapsed ? '✦' : 'BellarisOS ✦'}
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
                fontSize: 'var(--text-2xs)', fontWeight: 700, color: 'var(--text-muted)',
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
                  fontSize: 'var(--text-sm-sz)', fontWeight: 700, color: 'var(--brand)',
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
                    borderRadius: 10, zIndex: 51, boxShadow: 'var(--shadow-popover)', overflow: 'hidden',
                  }}>
                    {allBranches.map(b => (
                      <Link
                        key={b.slug}
                        href={`/${b.slug}/dashboard`}
                        onClick={() => { setSwitcherOpen(false); close() }}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '9px 12px', textDecoration: 'none',
                          fontSize: 'var(--text-sm-sz)', fontWeight: b.slug === slug ? 700 : 500,
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
          <div style={{ padding: '0 12px', marginBottom: 6 }}>
            <span className="overline">{branchName}</span>
          </div>
        ))}

        {/* Navegação */}
        <nav
          onClick={close}
          style={{
            display: 'flex', flexDirection: 'column', gap: 1,
            flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden',
            scrollbarWidth: 'thin',
          }}
        >
          {menuSectionsFor(BRANCH_MENU, permissions).map(secao => (
            <div key={secao.key ?? '_topo'} style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {/* Recolhida, a barra é só ícone: o título vira um filete. */}
              {secao.label && (collapsed
                ? <div aria-hidden style={{ height: 1, background: separatorBg, margin: '6px 10px 5px' }} />
                : <span className="overline" style={{ display: 'block', padding: '9px 12px 3px' }}>{secao.label}</span>
              )}
              {secao.entries.map(e => (
                <NavItem key={e.key} icon={ICONS[e.key]} label={e.label} href={`${base}${e.href}`} />
              ))}
            </div>
          ))}
        </nav>

        {/* Rodapé: recolher (desktop) + logout */}
        <div style={{ paddingBottom: 10, borderTop: hairline, paddingTop: 8, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <button
            type="button"
            onClick={toggleCollapsed}
            className="hide-mobile"
            title={collapsed ? 'Expandir menu' : 'Recolher menu'}
            aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'flex-start',
              gap: collapsed ? 0 : 10, padding: collapsed ? '6px 17px' : '6px 12px',
              borderRadius: 'var(--radius-field-token)', border: 'none', cursor: 'pointer',
              background: 'transparent', color: footerColor,
              fontSize: 'var(--text-sm-sz)', fontWeight: 'var(--weight-bold)', width: '100%',
              whiteSpace: 'nowrap', overflow: 'hidden', transition: 'background 120ms ease, padding var(--sidebar-anim) var(--sidebar-ease)',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = footerHover)}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <span style={{ width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
            </span>
            <span style={{ opacity: collapsed ? 0 : 1, maxWidth: collapsed ? 0 : 220, overflow: 'hidden', transition: 'opacity 160ms ease, max-width var(--sidebar-anim) var(--sidebar-ease)' }}>Recolher</span>
          </button>

          <form action={logoutAction}>
            <button
              type="submit"
              title={collapsed ? 'Sair' : undefined}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'flex-start',
                gap: collapsed ? 0 : 10, padding: collapsed ? '6px 17px' : '6px 12px',
                borderRadius: 'var(--radius-field-token)', border: 'none', cursor: 'pointer',
                background: 'transparent', color: footerColor,
                fontSize: 'var(--text-sm-sz)', fontWeight: 'var(--weight-bold)', width: '100%',
                whiteSpace: 'nowrap', overflow: 'hidden', transition: 'background 120ms ease, padding var(--sidebar-anim) var(--sidebar-ease)',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = footerHover)}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{ width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <LogOut size={16} />
              </span>
              <span style={{ opacity: collapsed ? 0 : 1, maxWidth: collapsed ? 0 : 220, overflow: 'hidden', transition: 'opacity 160ms ease, max-width var(--sidebar-anim) var(--sidebar-ease)' }}>Sair</span>
            </button>
          </form>
        </div>
      </aside>
    </>
  )
}
