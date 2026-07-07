'use client'

import { useEffect, useState } from 'react'

import '@/components/client-portal/new-appointment-wizard'

export function CapacitorNavFix() {
  const [layoutMounted, setLayoutMounted] = useState(false)

  useEffect(() => {
    setLayoutMounted(true)

    let navCleanup: (() => void) | undefined

    import('@capacitor/core')
      .then(async ({ Capacitor }) => {
        if (!Capacitor.isNativePlatform()) return

        // -- Navigation fix: intercept anchor clicks so Next.js client-router
        //    doesn't break inside the Capacitor WebView ----------------------
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

        // -- FCM push notification setup -----------------------------------
        try {
          const { PushNotifications } = await import('@capacitor/push-notifications')
          const { savePushToken }      = await import('@/actions/push-subscriptions')

          const { receive } = await PushNotifications.requestPermissions()
          if (receive !== 'granted') return

          // Listeners BEFORE register() — avoids race condition where the
          // 'registration' event fires before the listener is attached.
          await PushNotifications.addListener('registration', async ({ value: token }) => {
            await savePushToken({ token, platform: Capacitor.getPlatform() as 'android' | 'ios' })
          })

          await PushNotifications.addListener('registrationError', (err) => {
            console.error('[FCM] Registration error:', err)
          })

          // Foreground: Capacitor doesn't show a native banner automatically —
          // the Supabase realtime channel in NotificationBell already updates
          // the in-app badge/list, so no extra handling needed here.
          await PushNotifications.addListener('pushNotificationReceived', (_notification) => {
            // intentionally no-op: realtime channel handles in-app display
          })

          // Deep link: tapping a background/killed notification navigates to
          // the URL embedded in the FCM data payload.
          await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
            const url: string | undefined =
              (action.notification.data as Record<string, string>)?.url
            if (url) window.location.href = url
          })

          await PushNotifications.register()
        } catch (err) {
          console.error('[FCM] Setup error:', err)
        }
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
