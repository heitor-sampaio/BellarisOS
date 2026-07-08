'use client'

import { useState, useTransition, useEffect, useRef } from 'react'
import { Bell, X, BellOff } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  getUserNotifications, markAllUserNotificationsReceived, markUserNotificationRead,
  type UserNotification,
} from '@/actions/user-notifications'
import { NOTIFICATION_TYPE_CFG, notificationRelativeTime } from '@/components/shared/notification-types'

interface Props {
  internalUserId: string
  initialUnread:  number
}

export function StaffNotificationBell({ internalUserId, initialUnread }: Props) {
  const [open,          setOpen]          = useState(false)
  const [notifications, setNotifications] = useState<UserNotification[] | null>(null)
  const [unread,        setUnread]        = useState(initialUnread)
  const [selected,      setSelected]      = useState<UserNotification | null>(null)
  const [isPending,     startTransition]  = useTransition()
  const panelRef = useRef<HTMLDivElement>(null)
  const bellRef  = useRef<HTMLButtonElement>(null)

  // Realtime: novas notificações de staff
  useEffect(() => {
    const supabase = createClient()
    let active = true
    const suffix = Math.random().toString(36).slice(2)

    const channel = supabase
      .channel(`staff-notif-${internalUserId}-${suffix}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'user_notifications', filter: `user_id=eq.${internalUserId}` },
        (payload) => {
          if (!active) return
          const n = payload.new as UserNotification
          setUnread(prev => prev + 1)
          setNotifications(prev => prev ? [n, ...prev] : null)
          // No nativo o FCM já dispara a notificação nativa — Web Notification só no browser (evita duplicar)
          const isNative = typeof window !== 'undefined'
            && !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } })
              .Capacitor?.isNativePlatform?.()
          if (!isNative && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            new Notification(n.title, { body: n.body ?? '', icon: '/icon-192.png' })
          }
        },
      )

    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        if (!active) return
        if (session) supabase.realtime.setAuth(session.access_token)
        channel.subscribe()
      })
      .catch(() => { /* realtime opcional */ })

    return () => { active = false; supabase.removeChannel(channel) }
  }, [internalUserId])

  // Fecha ao clicar fora / ESC
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

  useEffect(() => {
    if (!open && !selected) return
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (selected) setSelected(null); else setOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, selected])

  function handleOpen() {
    if (open) { setOpen(false); return }
    setOpen(true)
    startTransition(async () => {
      const res = await getUserNotifications()
      setNotifications(res.notifications)
      if (unread > 0) { setUnread(0); await markAllUserNotificationsReceived() }
    })
  }

  function handleNotifClick(n: UserNotification) {
    setSelected(n)
    setOpen(false)
    startTransition(async () => {
      await markUserNotificationRead(n.id)
      setNotifications(prev => prev ? prev.filter(x => x.id !== n.id) : null)
    })
  }

  const badge = unread > 0 ? (unread > 9 ? '9+' : String(unread)) : null
  const { Icon: SelIcon, color: selColor } = selected
    ? (NOTIFICATION_TYPE_CFG[selected.type] ?? NOTIFICATION_TYPE_CFG['general']!)
    : { Icon: Bell, color: 'var(--brand)' }

  return (
    <div style={{ position: 'relative' }}>
      <button
        ref={bellRef}
        type="button"
        onClick={handleOpen}
        className="btn-ghost"
        aria-label="Notificações"
        aria-expanded={open}
        style={{ padding: 8, position: 'relative' }}
      >
        <Bell size={18} strokeWidth={badge ? 2.5 : 1.8} color={badge ? 'var(--brand)' : undefined} />
        {badge && (
          <span style={{
            position: 'absolute', top: -2, right: -2,
            minWidth: 17, height: 17, borderRadius: 9,
            background: 'var(--brand)', color: '#fff', fontSize: 10, fontWeight: 800,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 4px', border: '1.5px solid var(--surface)', lineHeight: 1,
          }}>{badge}</span>
        )}
      </button>

      {open && <div
        ref={panelRef}
        role="dialog"
        aria-label="Notificações"
        style={{
          position: 'fixed', top: 'calc(var(--topbar-h) - 4px)', right: 12,
          width: 'min(380px, calc(100vw - 24px))', maxHeight: 'calc(100dvh - 90px)', zIndex: 300,
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16,
          boxShadow: '0 8px 32px rgba(0,0,0,0.14), 0 2px 8px rgba(0,0,0,0.06)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 16px 12px', borderBottom: '1px solid var(--hairline)', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Bell size={15} color="var(--brand)" strokeWidth={2.5} />
            <h2 style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.01em', margin: 0 }}>Notificações</h2>
          </div>
          <button
            type="button" onClick={() => setOpen(false)}
            style={{
              width: 28, height: 28, borderRadius: 8, border: '1px solid var(--border)',
              background: 'var(--bg-app)', color: 'var(--text-muted)', display: 'flex',
              alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            }}
          ><X size={13} /></button>
        </div>

        <div style={{ overflowY: 'auto', flex: 1 }}>
          {isPending && !notifications && (
            <div style={{ padding: '32px 16px', textAlign: 'center' }}>
              <div style={{
                width: 20, height: 20, borderRadius: '50%', border: '2px solid var(--hairline)',
                borderTopColor: 'var(--brand)', margin: '0 auto 10px', animation: 'spin 0.7s linear infinite',
              }} />
              <p style={{ fontSize: 13, color: 'var(--text-faint)' }}>Carregando...</p>
            </div>
          )}
          {!isPending && notifications?.length === 0 && (
            <div style={{ padding: '40px 16px', textAlign: 'center' }}>
              <div style={{
                width: 44, height: 44, borderRadius: 14, background: 'var(--bg-app)',
                border: '1px solid var(--hairline)', display: 'flex', alignItems: 'center',
                justifyContent: 'center', margin: '0 auto 12px',
              }}><BellOff size={20} color="var(--text-faint)" /></div>
              <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>Tudo em dia</p>
              <p style={{ fontSize: 12.5, color: 'var(--text-faint)', lineHeight: 1.5 }}>Nenhuma notificação por aqui.</p>
            </div>
          )}
          {notifications && notifications.length > 0 && (
            <ul style={{ listStyle: 'none', margin: 0, padding: '4px 0 8px' }}>
              {notifications.map(n => {
                const { Icon, color } = NOTIFICATION_TYPE_CFG[n.type] ?? NOTIFICATION_TYPE_CFG['general']!
                return (
                  <li
                    key={n.id}
                    onClick={() => handleNotifClick(n)}
                    style={{
                      display: 'flex', gap: 10, padding: '11px 14px',
                      background: n.is_received ? 'transparent' : 'var(--brand-soft)',
                      borderBottom: '1px solid var(--hairline)', alignItems: 'flex-start', cursor: 'pointer',
                    }}
                  >
                    <div style={{
                      width: 32, height: 32, borderRadius: 9, background: `${color}18`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1,
                    }}><Icon size={15} color={color} strokeWidth={2} /></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{
                        fontSize: 13.5, fontWeight: n.is_received ? 500 : 700,
                        color: n.is_received ? 'var(--text-muted)' : 'var(--text)',
                        marginBottom: 2, lineHeight: 1.35, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>{n.title}</p>
                      {n.body && (
                        <p style={{
                          fontSize: 12, color: 'var(--text-faint)', lineHeight: 1.4, marginBottom: 2,
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>{n.body}</p>
                      )}
                      <p style={{ fontSize: 11, color: 'var(--text-faint)' }}>{notificationRelativeTime(n.created_at)}</p>
                    </div>
                    {!n.is_received && <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--brand)', flexShrink: 0, marginTop: 5 }} />}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>}

      {selected && (
        <>
          <div onClick={() => setSelected(null)} style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(0,0,0,0.5)' }} />
          <div role="dialog" aria-modal="true" style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            width: 'min(400px, calc(100vw - 32px))', zIndex: 401, background: 'var(--surface)',
            borderRadius: 20, border: '1px solid var(--border)', boxShadow: '0 24px 64px rgba(0,0,0,0.2)', overflow: 'hidden',
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '18px 18px 14px', borderBottom: '1px solid var(--hairline)',
            }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: `${selColor}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <SelIcon size={17} color={selColor} strokeWidth={2} />
              </div>
              <button type="button" onClick={() => setSelected(null)} style={{
                width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-app)',
                color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
              }}><X size={14} /></button>
            </div>
            <div style={{ padding: '20px 20px 24px' }}>
              <p style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.01em', lineHeight: 1.35, marginBottom: 10 }}>{selected.title}</p>
              {selected.body && <p style={{ fontSize: 14, color: 'var(--text-muted)', lineHeight: 1.6 }}>{selected.body}</p>}
              <p style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 14 }}>{notificationRelativeTime(selected.created_at)}</p>
            </div>
            <div style={{ padding: '0 20px 20px' }}>
              <button type="button" onClick={() => setSelected(null)} className="btn-primary" style={{ width: '100%', justifyContent: 'center' }}>Fechar</button>
            </div>
          </div>
        </>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
