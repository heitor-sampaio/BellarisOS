'use client'

import {
  LayoutGrid, Calendar, BarChart3,
  Settings, LogOut, Sparkles, Boxes, Contact, CreditCard, Layers, Megaphone,
  UsersRound, Bell, ChevronLeft, ChevronRight,
} from 'lucide-react'
import { NavItem }    from '@/components/shared/nav-item'
import { logoutAction } from '@/actions/auth'
import { useSidebar } from '@/components/shared/sidebar-context'

const SIDEBAR_GRADIENT = 'linear-gradient(165deg, var(--brand) 0%, var(--brand-deep) 100%)'

export function AdminSidebar({ role }: { role: string }) {
  const { isOpen, close, collapsed, toggleCollapsed } = useSidebar()
  const isFinancial        = role === 'FINANCIAL'
  const isMarketing        = role === 'MARKETING'
  const isComercial        = role === 'COMERCIAL'
  const isGerenteComercial = role === 'GERENTE_COMERCIAL'
  // Cargos de rede com menu enxuto — sem Dashboard/Agenda/Equipe
  const isRestricted = isFinancial || isMarketing || isComercial || isGerenteComercial

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
          padding:       'env(safe-area-inset-top, 0px) 12px env(safe-area-inset-bottom, 0px)',
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
            {collapsed ? '✦' : 'BellarisOS ✦'}
          </span>
        </div>

        {!collapsed && (
          <div style={{ padding: '4px 12px', marginBottom: 16 }}>
            <span className="overline">Rede</span>
          </div>
        )}

        <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }} onClick={close}>
          {!isRestricted && (
            <>
              <NavItem icon={<LayoutGrid size={18} />} label="Dashboard" href="/admin/dashboard" />
              <NavItem icon={<Calendar   size={18} />} label="Agenda"    href="/admin/agenda" />
            </>
          )}
          {isMarketing ? (
            <>
              <NavItem icon={<BarChart3  size={18} />} label="Relatórios"    href="/admin/reports" />
              <NavItem icon={<Layers     size={18} />} label="CRM"           href="/admin/crm" />
              <NavItem icon={<Megaphone  size={18} />} label="Marketing"     href="/admin/marketing" />
            </>
          ) : isComercial ? (
            <NavItem icon={<Layers size={18} />} label="CRM" href="/admin/crm" />
          ) : isGerenteComercial ? (
            <>
              <NavItem icon={<BarChart3 size={18} />} label="Comercial" href="/admin/comercial" />
              <NavItem icon={<Layers    size={18} />} label="CRM"       href="/admin/crm" />
            </>
          ) : (
            <>
              <NavItem icon={<Contact    size={18} />} label="Clientes"      href="/admin/clients" />
              <NavItem icon={<BarChart3  size={18} />} label="Relatórios"    href="/admin/reports" />
              <NavItem icon={<CreditCard size={18} />} label="Financeiro"    href="/admin/financeiro" />
              <NavItem icon={<Boxes      size={18} />} label="Estoque"       href="/admin/estoque" />
              <NavItem icon={<Sparkles   size={18} />} label="Procedimentos" href="/admin/procedures" />
              <NavItem icon={<Layers     size={18} />} label="CRM"           href="/admin/crm" />
              <NavItem icon={<Bell       size={18} />} label="Notificações"  href="/admin/notificacoes" />
              <NavItem icon={<Megaphone  size={18} />} label="Marketing"     href="/admin/marketing" />
              {!isFinancial && (
                <>
                  <NavItem icon={<UsersRound size={18} />} label="Equipes"        href="/admin/team" />
                  <NavItem icon={<Settings   size={18} />} label="Configurações"  href="/admin/settings" />
                </>
              )}
            </>
          )}
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
              display: 'flex', alignItems: 'center', justifyContent: 'flex-start',
              gap: collapsed ? 0 : 10, padding: collapsed ? '9px 17px' : '9px 12px',
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
                gap: collapsed ? 0 : 10, padding: collapsed ? '9px 17px' : '9px 12px',
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
