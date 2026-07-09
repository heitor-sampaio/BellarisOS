'use client'

import { useState, useTransition, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, X, BellOff } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getClientNotifications, markAllNotificationsReceived, markNotificationRead } from '@/actions/notifications'
import { saveWebPushSubscription, savePushToken } from '@/actions/push-subscriptions'
import type { ClientNotification } from '@/actions/notifications'
import {
  NOTIFICATION_TYPE_CFG as TYPE_CFG,
  notificationRelativeTime as relativeTime,
} from '@/components/shared/notification-types'

// -- Push registration (native FCM via Capacitor or browser VAPID) --------
// Guard so os listeners nativos são registrados apenas uma vez por sessão do app
// (a montagem + o toque do sino não podem acumular listeners duplicados).
let pushListenersAdded = false

/**
 * Garante que o token de push do dispositivo esteja salvo no backend.
 * @param requestPermission  true = solicita permissão (toque do sino, intenção do usuário).
 *                           false = registra silenciosamente SÓ se a permissão já foi concedida
 *                           (chamado na montagem — re-registra tokens perdidos, ex: após migração).
 */
async function ensurePushRegistered(requestPermission: boolean) {
  try {
    const { Capacitor } = await import('@capacitor/core')
    if (Capacitor.isNativePlatform()) {
      const { PushNotifications } = await import('@capacitor/push-notifications')

      let perm = await PushNotifications.checkPermissions()
      if (perm.receive !== 'granted') {
        if (!requestPermission) return
        perm = await PushNotifications.requestPermissions()
        if (perm.receive !== 'granted') return
      }

      // Permissão de LocalNotifications (foreground) — mesmo OS permission no Android
      try {
        const { LocalNotifications } = await import('@capacitor/local-notifications')
        await LocalNotifications.requestPermissions()
      } catch { /* opcional */ }

      if (!pushListenersAdded) {
        pushListenersAdded = true
        // Listeners BEFORE register() — avoids race condition on fast devices
        await PushNotifications.addListener('registration', async ({ value: token }) => {
          await savePushToken({ token, platform: Capacitor.getPlatform() as 'android' | 'ios' })
        })
        // Foreground: o SO não exibe automaticamente — agenda uma notificação nativa
        await PushNotifications.addListener('pushNotificationReceived', async (notification) => {
          try {
            const { LocalNotifications } = await import('@capacitor/local-notifications')
            await LocalNotifications.schedule({
              notifications: [{
                id:    Math.floor(Math.random() * 100000),
                title: notification.title ?? '',
                body:  notification.body  ?? '',
                extra: notification.data,
              }],
            })
          } catch { /* local notifications are optional */ }
        })
      }
      await PushNotifications.register()
      return
    }
  } catch { /* not in Capacitor context */ }

  // Browser VAPID flow
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return
  let permission = Notification.permission
  if (permission !== 'granted') {
    if (!requestPermission) return
    permission = await Notification.requestPermission()
    if (permission !== 'granted') return
  }
  try {
    const reg = await navigator.serviceWorker.register('/sw.js')
    await navigator.serviceWorker.ready
    const existing = await reg.pushManager.getSubscription()
    const sub = existing ?? await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!),
    })
    const json = sub.toJSON()
    if (json.endpoint && json.keys) {
      await saveWebPushSubscription({ endpoint: json.endpoint, keys: json.keys as { p256dh: string; auth: string } })
    }
  } catch { /* push is optional */ }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

// -- Component ------------------------------------------------------------

interface Props {
  initialUnread: number
  clientId: string
}

export function NotificationBell({ initialUnread, clientId }: Props) {
  const [open,          setOpen]          = useState(false)
  const [notifications, setNotifications] = useState<ClientNotification[] | null>(null)
  const [unread,        setUnread]        = useState(initialUnread)
  const [selected,      setSelected]      = useState<ClientNotification | null>(null)
  const [isPending,     startTransition]  = useTransition()
  const panelRef = useRef<HTMLDivElement>(null)
  const bellRef  = useRef<HTMLButtonElement>(null)
  const router   = useRouter()

  function openLink(link?: string | null) {
    if (!link) return
    setSelected(null)
    setOpen(false)
    router.push(link)
  }

  // Deep link: tocar na notificação nativa (FCM) abre a tela correspondente.
  useEffect(() => {
    let cleanup: (() => void) | undefined
    import('@capacitor/core').then(async ({ Capacitor }) => {
      if (!Capacitor.isNativePlatform()) return
      const { PushNotifications } = await import('@capacitor/push-notifications')
      const handle = await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
        const link = (action.notification?.data as { link?: string } | undefined)?.link
        if (link) router.push(link)
      })
      cleanup = () => { handle.remove() }
    }).catch(() => { /* not in Capacitor context */ })
    return () => { cleanup?.() }
  }, [router])

  // Realtime: set auth token and subscribe to new notifications.
  // createBrowserClient is a singleton — supabase.channel() returns any existing
  // channel with the same topic. Since removeChannel() is async, the stale channel
  // from Effect 1 (React StrictMode double-invoke) is still in the registry when
  // Effect 2 runs, causing "cannot add callbacks after subscribe()".
  // Fix: unique per-invocation suffix so channel() always creates a fresh instance.
  useEffect(() => {
    const supabase = createClient()
    let active = true
    // Generated inside the effect (not a ref) so each invocation gets a different name
    const suffix = Math.random().toString(36).slice(2)

    const channel = supabase
      .channel(`notif-bell-${clientId}-${suffix}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'client_notifications', filter: `client_id=eq.${clientId}` },
        (payload) => {
          if (!active) return
          const n = payload.new as ClientNotification
          setUnread(prev => prev + 1)
          setNotifications(prev => prev ? [n, ...prev] : null)
          // No nativo (Capacitor) o FCM já dispara a notificação nativa via
          // pushNotificationReceived → LocalNotifications. Aqui só mostramos a
          // Web Notification no BROWSER (onde não há FCM) — senão duplica.
          const isNative = typeof window !== 'undefined'
            && !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } })
              .Capacitor?.isNativePlatform?.()
          if (!isNative && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            const webNotif = new Notification(n.title, { body: n.body ?? '', icon: '/icon-192.png' })
            const link = (n.data as { link?: string } | null)?.link
            if (link) webNotif.onclick = () => { window.focus(); router.push(link) }
          }
        },
      )

    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        if (!active) return
        if (session) supabase.realtime.setAuth(session.access_token)
        channel.subscribe()
      })
      .catch(() => { /* realtime is optional — app works without it */ })

    return () => {
      active = false
      supabase.removeChannel(channel)
    }
  }, [clientId])

  // Registra o token de push na montagem — silencioso se a permissão já foi
  // concedida. Cobre o caso da migração: quem já autorizou re-registra o token
  // perdido automaticamente, sem novo prompt. Primeira permissão: no toque do sino.
  useEffect(() => {
    ensurePushRegistered(false)
  }, [])

  // Close panel on outside click
  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        bellRef.current  && !bellRef.current.contains(e.target as Node)
      ) setOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    return () => window.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  // Close on ESC
  useEffect(() => {
    if (!open && !selected) return
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (selected) setSelected(null)
      else setOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, selected])

  function handleOpen() {
    if (open) { setOpen(false); return }
    setOpen(true)
    // Load list + reset badge
    startTransition(async () => {
      const res = await getClientNotifications()
      setNotifications(res.notifications)
      if (unread > 0) {
        setUnread(0)
        await markAllNotificationsReceived()
      }
    })
    ensurePushRegistered(true)
  }

  function handleNotifClick(n: ClientNotification) {
    setSelected(n)
    setOpen(false)
    startTransition(async () => {
      await markNotificationRead(n.id)
      setNotifications(prev => prev ? prev.filter(x => x.id !== n.id) : null)
    })
  }

  const badge = unread > 0 ? (unread > 9 ? '9+' : String(unread)) : null
  const { Icon: SelIcon, color: selColor } = selected ? (TYPE_CFG[selected.type] ?? TYPE_CFG['general']!) : { Icon: Bell, color: 'var(--brand)' }

  return (
    <div style={{ position: 'relative' }}>

      {/* Bell button */}
      <button
        ref={bellRef}
        type="button"
        onClick={handleOpen}
        aria-label="Notificações"
        aria-expanded={open}
        style={{
          position: 'relative', width: 38, height: 38, borderRadius: 10,
          border:     badge ? '1.5px solid var(--brand)' : '1px solid var(--border)',
          background: badge ? 'var(--brand-soft)' : 'transparent',
          color:      badge ? 'var(--brand)' : 'var(--text-muted)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', WebkitTapHighlightColor: 'transparent', flexShrink: 0,
          transition: 'border-color 150ms, background 150ms',
        }}
      >
        <Bell size={18} strokeWidth={badge ? 2.5 : 1.8} />
        {badge && (
          <span style={{
            position: 'absolute', top: -5, right: -5,
            minWidth: 18, height: 18, borderRadius: 9,
            background: 'var(--brand)', color: '#fff', fontSize: 10, fontWeight: 800,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 4px', border: '1.5px solid var(--surface)', lineHeight: 1,
          }}>
            {badge}
          </span>
        )}
      </button>

      {/* Dropdown panel — conditional render so the div is never in the DOM when closed.
          Using opacity+pointerEvents:none is unreliable on some Android WebViews
          (the invisible fixed div intercepts all taps on the page). */}
      {open && <div
        ref={panelRef}
        role="dialog"
        aria-label="Notificações"
        style={{
          position: 'fixed', top: 58, right: 12,
          width: 'min(380px, calc(100vw - 24px))',
          maxHeight: 'calc(100dvh - 78px)',
          zIndex: 300,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 16,
          boxShadow: '0 8px 32px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.06)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          animation: 'bell-panel-open 200ms cubic-bezier(0.34,1.4,0.64,1) both',
          transformOrigin: 'top right',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 16px 12px', borderBottom: '1px solid var(--hairline)', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Bell size={15} color="var(--brand)" strokeWidth={2.5} />
            <h2 style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.01em', margin: 0 }}>
              Notificações
            </h2>
            {notifications !== null && notifications.length === 0 && (
              <span style={{
                fontSize: 11, fontWeight: 700, color: 'var(--text-faint)',
                background: 'var(--bg-app)', border: '1px solid var(--hairline)',
                borderRadius: 99, padding: '1px 7px',
              }}>Em dia</span>
            )}
          </div>
          <button
            type="button" onClick={() => setOpen(false)}
            style={{
              width: 28, height: 28, borderRadius: 8,
              border: '1px solid var(--border)', background: 'var(--bg-app)',
              color: 'var(--text-muted)', display: 'flex', alignItems: 'center',
              justifyContent: 'center', cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
            }}
          ><X size={13} /></button>
        </div>

        {/* Content */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {isPending && !notifications && (
            <div style={{ padding: '32px 16px', textAlign: 'center' }}>
              <div style={{
                width: 20, height: 20, borderRadius: '50%',
                border: '2px solid var(--hairline)', borderTopColor: 'var(--brand)',
                margin: '0 auto 10px', animation: 'spin 0.7s linear infinite',
              }} />
              <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>Carregando...</p>
            </div>
          )}
          {!isPending && notifications?.length === 0 && (
            <div style={{ padding: '40px 16px', textAlign: 'center' }}>
              <div style={{
                width: 44, height: 44, borderRadius: 14,
                background: 'var(--bg-app)', border: '1px solid var(--hairline)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px',
              }}>
                <BellOff size={20} color="var(--text-faint)" />
              </div>
              <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>Tudo em dia</p>
              <p style={{ fontSize: 12.5, color: 'var(--text-faint)', lineHeight: 1.5 }}>Nenhuma notificacao por aqui.</p>
            </div>
          )}
          {notifications && notifications.length > 0 && (
            <ul style={{ listStyle: 'none', margin: 0, padding: '4px 0 8px' }}>
              {notifications.map(n => (
                <NotificationItem key={n.id} notification={n} onClick={() => handleNotifClick(n)} />
              ))}
            </ul>
          )}
        </div>
      </div>}

      {/* Notification modal */}
      {selected && (
        <>
          <div
            onClick={() => setSelected(null)}
            style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(0,0,0,0.5)' }}
          />
          <div
            role="dialog"
            aria-modal="true"
            style={{
              position: 'fixed', top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              width: 'min(400px, calc(100vw - 32px))',
              zIndex: 401,
              background: 'var(--surface)', borderRadius: 20,
              border: '1px solid var(--border)',
              boxShadow: '0 24px 64px rgba(0,0,0,0.2)',
              overflow: 'hidden',
            }}
          >
            {/* Modal header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '18px 18px 14px', borderBottom: '1px solid var(--hairline)',
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: `${selColor}18`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <SelIcon size={17} color={selColor} strokeWidth={2} />
              </div>
              <button
                type="button" onClick={() => setSelected(null)}
                style={{
                  width: 30, height: 30, borderRadius: 8,
                  border: '1px solid var(--border)', background: 'var(--bg-app)',
                  color: 'var(--text-muted)', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
                }}
              ><X size={14} /></button>
            </div>

            {/* Modal body */}
            <div style={{ padding: '20px 20px 24px' }}>
              <p style={{
                fontSize: 16, fontWeight: 800, color: 'var(--text)',
                letterSpacing: '-0.01em', lineHeight: 1.35, marginBottom: 10,
              }}>
                {selected.title}
              </p>
              {selected.body && (
                <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                  {selected.body}
                </p>
              )}
              <p style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 14 }}>
                {relativeTime(selected.created_at)}
              </p>
            </div>

            {/* Modal footer */}
            <div style={{ padding: '0 20px 20px', display: 'flex', gap: 10 }}>
              {selected.data?.link && (
                <button
                  type="button"
                  onClick={() => openLink(selected.data?.link)}
                  className="btn-primary"
                  style={{ flex: 1, justifyContent: 'center' }}
                >
                  {selected.type === 'appointment_completed' ? 'Confirmar atendimento' : 'Abrir'}
                </button>
              )}
              <button
                type="button"
                onClick={() => setSelected(null)}
                className={selected.data?.link ? 'btn-secondary' : 'btn-primary'}
                style={{ flex: 1, justifyContent: 'center' }}
              >
                Fechar
              </button>
            </div>
          </div>
        </>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes bell-panel-open {
          from { opacity: 0; transform: translateY(-6px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  )
}

// -- Notification item ----------------------------------------------------

function NotificationItem({ notification: n, onClick }: { notification: ClientNotification; onClick: () => void }) {
  const { Icon, color } = TYPE_CFG[n.type] ?? TYPE_CFG['general']!
  return (
    <li
      onClick={onClick}
      style={{
        display: 'flex', gap: 10, padding: '11px 14px',
        background: n.is_received ? 'transparent' : 'var(--brand-soft)',
        borderBottom: '1px solid var(--hairline)',
        alignItems: 'flex-start', cursor: 'pointer',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-app)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = n.is_received ? 'transparent' : 'var(--brand-soft)' }}
    >
      <div style={{
        width: 32, height: 32, borderRadius: 9,
        background: `${color}18`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, marginTop: 1,
      }}>
        <Icon size={15} color={color} strokeWidth={2} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          fontSize: 13.5, fontWeight: n.is_received ? 500 : 700,
          color: n.is_received ? 'var(--text-muted)' : 'var(--text)',
          marginBottom: 2, lineHeight: 1.35,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {n.title}
        </p>
        {n.body && (
          <p style={{
            fontSize: 12, color: 'var(--text-faint)', lineHeight: 1.4, marginBottom: 2,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {n.body}
          </p>
        )}
        <p style={{ fontSize: 11, color: 'var(--text-faint)' }}>{relativeTime(n.created_at)}</p>
      </div>
      {!n.is_received && (
        <div style={{
          width: 7, height: 7, borderRadius: '50%',
          background: 'var(--brand)', flexShrink: 0, marginTop: 5,
        }} />
      )}
    </li>
  )
}
