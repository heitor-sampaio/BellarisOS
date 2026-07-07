'use client'

import { useEffect, useState } from 'react'

// Static import forces the wizard module into this chunk so it lands in the
// client registry on initial page load — without this, Next.js loads it via
// dynamic import() during SPA navigation, which fails silently in Capacitor
// Android WebView.
import '@/components/client-portal/new-appointment-wizard'

export function CapacitorNavFix() {
  const [layoutMounted, setLayoutMounted] = useState(false)

  useEffect(() => {
    setLayoutMounted(true)

    let cleanup: (() => void) | undefined

    import('@capacitor/core')
      .then(({ Capacitor }) => {
        if (!Capacitor.isNativePlatform()) return

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
        cleanup = () => document.removeEventListener('click', handler, { capture: true })
      })
      .catch(() => {})

    return () => { cleanup?.() }
  }, [])

  // Green badge: confirms React is running in the layout.
  // If this never appears → React is broken at the layout level too.
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
