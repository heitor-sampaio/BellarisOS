'use client'
import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'

let listeners: (() => void)[] = []

export function emitNavStart() {
  listeners.forEach(fn => fn())
}

export function NavigationProgress() {
  const pathname   = usePathname()
  const [width,   setWidth]   = useState(0)
  const [opacity, setOpacity] = useState(1)
  const [active,  setActive]  = useState(false)
  const prevPath   = useRef(pathname)
  const doneRef    = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    const handler = () => {
      clearTimeout(doneRef.current)
      setActive(true)
      setOpacity(1)
      setWidth(0)
      // double rAF so the transition animates from 0 → 85
      requestAnimationFrame(() =>
        requestAnimationFrame(() => setWidth(85))
      )
    }
    listeners.push(handler)
    return () => { listeners = listeners.filter(fn => fn !== handler) }
  }, [])

  useEffect(() => {
    if (pathname === prevPath.current) return
    prevPath.current = pathname
    // Navigation complete: rush to 100 then fade
    setWidth(100)
    doneRef.current = setTimeout(() => setOpacity(0), 200)
    doneRef.current = setTimeout(() => { setActive(false); setWidth(0) }, 500)
  }, [pathname])

  if (!active) return null

  return (
    <div
      aria-hidden="true"
      style={{
        position:    'fixed',
        top:         0,
        left:        0,
        height:      3,
        width:       `${width}%`,
        background:  'var(--brand)',
        zIndex:      9999,
        opacity,
        pointerEvents: 'none',
        transition:
          width === 100
            ? 'width 180ms ease, opacity 280ms ease 180ms'
            : width === 0
              ? 'none'
              : 'width 12s cubic-bezier(0.05, 0.6, 0, 1)',
      }}
    />
  )
}
