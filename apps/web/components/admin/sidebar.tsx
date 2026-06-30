'use client'

import {
  LayoutGrid, Calendar, Users, BarChart3,
  Settings, LogOut, Sparkles, Boxes, Contact, CreditCard, Layers, Megaphone,
} from 'lucide-react'
import { NavItem }    from '@/components/shared/nav-item'
import { logoutAction } from '@/actions/auth'
import { useSidebar } from '@/components/shared/sidebar-context'

export function AdminSidebar({ role }: { role: string }) {
  const { isOpen, close } = useSidebar()
  const isFinancial  = role === 'FINANCIAL'
  const isMarketing  = role === 'MARKETING'
  const isRestricted = isFinancial || isMarketing  // sem Dashboard/Unidades/Equipe

  return (
    <>
      {isOpen && (
        <div className="sidebar-scrim" onClick={close} aria-hidden="true" />
      )}

      <aside
        className={`main-sidebar${isOpen ? ' sidebar-open' : ''}`}
        style={{
          position:      'fixed',
          left:          0,
          top:           0,
          bottom:        0,
          width:         244,
          background:    'var(--surface)',
          borderRight:   '1px solid var(--border)',
          display:       'flex',
          flexDirection: 'column',
          padding:       '0 12px',
          zIndex:        50,
          overflowY:     'auto',
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

        <div style={{ padding: '4px 12px', marginBottom: 16 }}>
          <span className="overline">Rede</span>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }} onClick={close}>
          {!isRestricted && (
            <>
              <NavItem icon={<LayoutGrid size={18} />} label="Dashboard" href="/admin/dashboard" />
              <NavItem icon={<Calendar   size={18} />} label="Agenda"    href="/admin/agenda" />
            </>
          )}
          {/* Marketing: apenas Marketing, CRM e Relatórios */}
          {isMarketing ? (
            <>
              <NavItem icon={<BarChart3  size={18} />} label="Relatórios"    href="/admin/reports" />
              <NavItem icon={<Layers     size={18} />} label="CRM"           href="/admin/crm" />
              <NavItem icon={<Megaphone  size={18} />} label="Marketing"     href="/admin/marketing" />
            </>
          ) : (
            <>
              <NavItem icon={<Contact    size={18} />} label="Clientes"      href="/admin/clients" />
              <NavItem icon={<BarChart3  size={18} />} label="Relatórios"    href="/admin/reports" />
              <NavItem icon={<CreditCard size={18} />} label="Financeiro"    href="/admin/financeiro" />
              <NavItem icon={<Boxes      size={18} />} label="Estoque"       href="/admin/estoque" />
              <NavItem icon={<Sparkles   size={18} />} label="Procedimentos" href="/admin/procedures" />
              <NavItem icon={<Layers     size={18} />} label="CRM"           href="/admin/crm" />
              <NavItem icon={<Megaphone  size={18} />} label="Marketing"     href="/admin/marketing" />
              {!isFinancial && (
                <NavItem icon={<Settings size={18} />} label="Configurações" href="/admin/settings" />
              )}
            </>
          )}
        </nav>

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
