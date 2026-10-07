'use client'

import { useEffect } from 'react'
import { Menu } from 'lucide-react'
import { useSidebar } from '@/components/shared/sidebar-context'
import { savePushToken } from '@/actions/push-subscriptions'
import { StaffNotificationBell } from '@/components/shared/staff-notification-bell'
import { BuscaUniversal } from '@/components/shared/busca-universal'
import { BannerDoSuporte } from '@/components/shared/banner-do-suporte'
import { Ajuda } from '@/components/shared/ajuda'
import { AvisoDaAssinatura } from '@/components/shared/aviso-da-assinatura'
import type { AvisoDaAssinatura as AvisoDaAssinaturaDados } from '@/lib/redes/aviso'
import type { ResolvedPermissions, SuporteNoContexto } from '@estetica-os/types'

interface TopbarProps {
  userName:       string
  userRole:       string
  roleLabel?:     string
  internalUserId: string | null
  initialUnread:  number
  /** Slug do portal da unidade; nulo no portal da rede. A busca o usa. */
  slug:           string | null
  /** O que o cargo abre: decide as páginas que a busca oferece. */
  permissions:    ResolvedPermissions
  /** O plano da rede (`ctx.plano`): a busca não oferece página de funcionalidade fora dele. */
  plano?:         { funcionalidades: readonly string[] } | null
  /** A sessão é do suporte da plataforma: mostra o aviso fixo com o "Sair". */
  suporte?:       SuporteNoContexto | null
  /** Teste acabando ou pagamento em atraso — só para quem administra a rede. */
  assinatura?:    AvisoDaAssinaturaDados | null
}

const ROLE_LABELS: Record<string, string> = {
  NETWORK_ADMIN:     'Admin da rede',
  BRANCH_ADMIN:      'Gerente',
  RECEPTIONIST:      'Recepcionista',
  PROFESSIONAL:      'Profissional',
  FINANCIAL:         'Financeiro',
  MARKETING:         'Marketing',
  COMERCIAL:         'Comercial',
  GERENTE_COMERCIAL: 'Gerente comercial',
}

export function Topbar({ userName, userRole, roleLabel, internalUserId, initialUnread, slug, permissions, plano = null, suporte = null, assinatura = null }: TopbarProps) {
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
      top:             'env(safe-area-inset-top, 0px)',
      left:            'var(--sidebar-w)',
      right:           0,
      height:          'var(--topbar-h)',
      background:      'var(--surface)',
      borderBottom:    '1px solid var(--border)',
      display:         'flex',
      alignItems:      'center',
      justifyContent:  'space-between',
      gap:             16,
      padding:         '0 var(--content-pad-x)',
      zIndex:          40,
      transition:      'left var(--sidebar-anim) var(--sidebar-ease)',
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

      {/* No modo suporte, o aviso toma o lugar da saudação — e não some */}
      {suporte && <BannerDoSuporte suporte={suporte} />}

      {/* Saudação — cede o lugar à busca quando a topbar aperta (< 1280px) */}
      {!suporte && assinatura && <AvisoDaAssinatura aviso={assinatura} rotaDaAba="/admin/settings?tab=assinatura" />}
      {!suporte && !assinatura && <p className="topbar-saudacao" style={{
        fontSize:   'var(--text-sm-sz)',
        color:      'var(--text-muted)',
        fontWeight: 'var(--weight-semibold)',
      }}>
        Bom dia, {firstName} ✦
      </p>}

      {/* Busca universal — no celular vira a lupa do bloco da direita */}
      <BuscaUniversal slug={slug} permissions={permissions} plano={plano} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* Ajuda: chamado com o suporte. No modo suporte quem está aqui é o atendente */}
        {internalUserId && !suporte && <Ajuda internalUserId={internalUserId} />}
        {internalUserId && (
          <StaffNotificationBell internalUserId={internalUserId} initialUnread={initialUnread} comAjuda={!suporte} />
        )}

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
              {roleLabel || ROLE_LABELS[userRole] || userRole}
            </p>
          </div>
        </div>
      </div>
    </header>
  )
}
