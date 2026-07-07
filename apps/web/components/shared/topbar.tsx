'use client'

import { useEffect } from 'react'
import { Bell, Menu } from 'lucide-react'
import { useSidebar } from '@/components/shared/sidebar-context'
import { savePushToken } from '@/actions/push-subscriptions'

interface TopbarProps {
  userName: string
  userRole: string
}

const ROLE_LABELS: Record<string, string> = {
  NETWORK_ADMIN: 'Admin da rede',
  BRANCH_ADMIN:  'Gerente',
  RECEPTIONIST:  'Recepcionista',
  PROFESSIONAL:  'Profissional',
  FINANCIAL:     'Financeiro',
}

export function Topbar({ userName, userRole }: TopbarProps) {
  const firstName  = userName.split(' ')[0] ?? userName
  const { toggle } = useSidebar()

  useEffect(() => {
    import('@capacitor/core').then(({ Capacitor }) => {
      if (!Capacitor.isNativePlatform()) return
      import('@capacitor/push-notifications').then(async ({ PushNotifications }) => {
        const { receive } = await PushNotifications.requestPermissions()
        if (receive !== 'granted') return
        await PushNotifications.register()
        await PushNotifications.addListener('registration', async ({ value: token }) => {
          await savePushToken({ token, platform: Capacitor.getPlatform() as 'android' | 'ios' })
        })
      })
    }).catch(() => { /* not in Capacitor context */ })
  }, [])

  return (
    <header style={{
      position:        'fixed',
      top:             0,
      left:            'var(--sidebar-w)',
      right:           0,
      height:          'var(--topbar-h)',
      background:      'var(--surface)',
      borderBottom:    '1px solid var(--border)',
      display:         'flex',
      alignItems:      'center',
      justifyContent:  'space-between',
      padding:         '0 var(--content-pad-x)',
      zIndex:          40,
      transition:      'left 240ms cubic-bezier(0.4, 0, 0.2, 1)',
    }}>
      {/* Hamburger — visível apenas em mobile (< 1024px) */}
      <button
        type="button"
        className="btn-ghost show-mobile"
        onClick={toggle}
        aria-label="Abrir menu"
        style={{ padding: 8, marginLeft: -8 }}
      >
        <Menu size={20} />
      </button>

      {/* Saudação — oculta em mobile para dar espaço */}
      <p className="hide-mobile" style={{
        fontSize:   'var(--text-sm-sz)',
        color:      'var(--text-muted)',
        fontWeight: 'var(--weight-semibold)',
      }}>
        Bom dia, {firstName} ✦
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          className="btn-ghost"
          style={{ padding: 8 }}
          aria-label="Notificações"
        >
          <Bell size={18} />
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width:          34,
            height:         34,
            borderRadius:   'var(--radius-full)',
            background:     'var(--brand-soft)',
            display:        'flex',
            alignItems:     'center',
            justifyContent: 'center',
            color:          'var(--brand)',
            fontWeight:     'var(--weight-extrabold)',
            fontSize:       'var(--text-xs-sz)',
            flexShrink:     0,
          }}>
            {firstName[0]?.toUpperCase()}
          </div>
          {/* Nome + cargo — oculto em mobile */}
          <div className="hide-mobile">
            <p style={{ fontSize: 'var(--text-sm-sz)', fontWeight: 'var(--weight-bold)', color: 'var(--text)' }}>
              {firstName}
            </p>
            <p style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>
              {ROLE_LABELS[userRole] ?? userRole}
            </p>
          </div>
        </div>
      </div>
    </header>
  )
}
