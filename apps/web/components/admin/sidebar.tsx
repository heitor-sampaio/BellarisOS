'use client'

import {
  LayoutGrid, Calendar, BarChart3,
  Settings, LogOut, Sparkles, Ticket, Boxes, Contact, CreditCard, Layers, Megaphone,
  UsersRound, Bell, ChevronLeft, ChevronRight, Inbox, FileText, ClipboardCheck, ClipboardList,
  Syringe, Workflow,
} from 'lucide-react'
import { SecaoDoMenu } from '@/components/shared/secao-do-menu'
import { logoutAction } from '@/actions/auth'
import { useSidebar } from '@/components/shared/sidebar-context'
import { ADMIN_MENU, menuSectionsFor } from '@/lib/menu'
import type { ResolvedPermissions } from '@estetica-os/types'

const SIDEBAR_GRADIENT = 'var(--gradient-brand)'

// A lista de itens e o que os libera vive em lib/menu.ts, para a tela de cargos
// poder pré-visualizar o menu sem virar uma segunda cópia da regra.
const ICONS: Record<string, React.ReactNode> = {
  dashboard:    <LayoutGrid size={18} />,
  agenda:       <Calendar   size={18} />,
  clients:      <Contact    size={18} />,
  planejamentos:<ClipboardList size={18} />,
  injetaveis:   <Syringe      size={18} />,
  checkout:     <ClipboardCheck size={18} />,
  reports:      <BarChart3  size={18} />,
  financial:    <CreditCard size={18} />,
  stock:        <Boxes      size={18} />,
  procedures:   <Sparkles   size={18} />,
  pacotes:      <Ticket     size={18} />,
  inbox:        <Inbox      size={18} />,
  oportunidades:<Layers     size={18} />,
  notificacoes: <Bell       size={18} />,
  marketing:    <Megaphone  size={18} />,
  templates:    <FileText   size={18} />,
  team:         <UsersRound size={18} />,
  settings:     <Settings   size={18} />,
  automations:  <Workflow   size={18} />,
}

export function AdminSidebar({ permissions, plano = null }: { permissions: ResolvedPermissions; plano?: { funcionalidades: readonly string[] } | null }) {
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

        {!collapsed && (
          <div style={{ padding: '0 12px', marginBottom: 6 }}>
            <span className="overline">Rede</span>
          </div>
        )}

        <nav
          onClick={close}
          style={{
            display: 'flex', flexDirection: 'column', gap: 1,
            flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden',
            scrollbarWidth: 'thin',
          }}
        >
          {/* Cada categoria recolhe pelo título; com a barra recolhida em
              ícones, o título vira um filete que ainda separa os blocos. */}
          {menuSectionsFor(ADMIN_MENU, permissions, plano).map(secao => (
            <SecaoDoMenu key={secao.key ?? '_topo'} chave={secao.key} titulo={secao.label}
              entradas={secao.entries} icones={ICONS} recolhida={collapsed} filete={separatorBg} />
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
