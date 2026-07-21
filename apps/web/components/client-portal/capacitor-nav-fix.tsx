'use client'

import { useEffect, useState } from 'react'
import { savePushToken } from '@/actions/push-subscriptions'

// Static import forces the wizard module into this chunk so it lands in the
// client registry on initial page load — without this, Next.js loads it via
// dynamic import() during SPA navigation, which fails silently in Capacitor
// Android WebView.
import '@/components/client-portal/new-appointment-wizard'

export function CapacitorNavFix() {
  const [layoutMounted, setLayoutMounted] = useState(false)

  useEffect(() => {
    setLayoutMounted(true)

    let navCleanup: (() => void) | undefined

    import('@capacitor/core')
      .then(async ({ Capacitor }) => {
        if (!Capacitor.isNativePlatform()) return

        // -- Navigation fix ------------------------------------------------
        const handler = (e: MouseEvent) => {
          const anchor = (e.target as HTMLElement).closest('a')
          if (!anchor?.href) return
          try {
            const url = new URL(anchor.href)
            if (url.origin !== window.location.origin) return
            e.stopImmediatePropagation()
            e.preventDefault()
            window.location.href = anchor.href
          } catch { /* ignore malformed hrefs */ }
        }
        document.addEventListener('click', handler, { capture: true })
        navCleanup = () => document.removeEventListener('click', handler, { capture: true })

        // -- FCM: silent re-registration (no dialog) -----------------------
        // Only runs if permission was already granted in a previous session.
        // First-time permission request happens in NotificationBell (bell tap).
        // Avoids showing a system dialog on mount, which pauses the Android
        // WebView and drops the Supabase realtime WebSocket connection.
        try {
          const { PushNotifications } = await import('@capacitor/push-notifications')
          const { receive } = await PushNotifications.checkPermissions()
          if (receive !== 'granted') return

          // Listeners BEFORE register() — avoids race condition
          await PushNotifications.addListener('registration', async ({ value: token }) => {
            await savePushToken({ token, platform: Capacitor.getPlatform() as 'android' | 'ios' })
          })

          // Foreground: show a native banner via LocalNotifications because
          // FCM does not display banners when the app is open.
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

          await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
            const url: string | undefined =
              (action.notification.data as Record<string, string>)?.url
            if (url) window.location.href = url
          })

          await PushNotifications.register()
        } catch { /* push is optional */ }
      })
      .catch(() => {})

    return () => { navCleanup?.() }
  }, [])

  return (
    <div
      style={{
        position:      'fixed',
        bottom:        84,
        left:          8,
        fontSize:      9,
        color:         '#fff',
        background:    layoutMounted ? '#16a34a' : '#dc2626',
        padding:       '2px 7px',
        borderRadius:  4,
        zIndex:        9999,
        pointerEvents: 'none',
        fontFamily:    'monospace',
      }}
    >
      {layoutMounted ? 'React ✓' : 'React ○'}
    </div>
  )
}
