'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, Check } from 'lucide-react'

export interface SegOption {
  key:   string
  label: string
}

interface Props {
  options: SegOption[]
  value:   string
  /** Modo callback (client components): navega/atualiza estado. */
  onSelect?: (key: string) => void
  /** Modo link (server components — props serializáveis): monta href. */
  basePath?:    string
  paramName?:   string
  extraParams?: Record<string, string>
  ariaLabel?:   string
}

/**
 * Seletor segmentado responsivo:
 *  - Desktop (≥640px): barra de chips (segmentado).
 *  - Mobile (<640px): botão único com a opção atual que abre um menu dropdown.
 *
 * Suporta navegação por callback (`onSelect`) ou por link serializável
 * (`basePath` + `paramName` + `extraParams`), para uso em Server Components.
 */
export function SegSelect({
  options, value, onSelect,
  basePath, paramName = 'period', extraParams,
  ariaLabel,
}: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const current = options.find(o => o.key === value) ?? options[0]

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const hrefFor = (key: string) => {
    if (!basePath) return '#'
    const q = new URLSearchParams(extraParams)
    q.set(paramName, key)
    return `${basePath}?${q.toString()}`
  }

  const chipStyle: React.CSSProperties = {
    fontSize: 'var(--text-xs-sz)', padding: '6px 12px', whiteSpace: 'nowrap',
  }

  const renderChip = (o: SegOption) => {
    const cls = o.key === value ? 'btn-primary' : 'btn-ghost'
    return basePath
      ? <Link key={o.key} href={hrefFor(o.key)} className={cls} style={chipStyle}>{o.label}</Link>
      : <button key={o.key} type="button" className={cls} style={chipStyle} onClick={() => onSelect?.(o.key)}>{o.label}</button>
  }

  const menuItemStyle = (active: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
    width: '100%', padding: '10px 12px', borderRadius: 9,
    fontSize: 13, fontWeight: 700, fontFamily: 'inherit', textAlign: 'left',
    border: 'none', cursor: 'pointer', textDecoration: 'none',
    background: active ? 'var(--brand-soft)' : 'transparent',
    color: active ? 'var(--brand)' : 'var(--text)',
  })

  const renderMenuItem = (o: SegOption) => {
    const active = o.key === value
    const inner = <>{o.label}{active && <Check size={14} />}</>
    return basePath
      ? <Link key={o.key} href={hrefFor(o.key)} onClick={() => setOpen(false)} style={menuItemStyle(active)}>{inner}</Link>
      : (
        <button
          key={o.key}
          type="button"
          onClick={() => { onSelect?.(o.key); setOpen(false) }}
          style={menuItemStyle(active)}
        >
          {inner}
        </button>
      )
  }

  return (
    <div ref={ref} className="seg-root" style={{ position: 'relative' }}>
      {/* Desktop — segmentado */}
      <div
        className="seg-desktop"
        style={{
          display: 'inline-flex', flexWrap: 'wrap', gap: 4, background: 'var(--surface)',
          borderRadius: 10, padding: 4, border: '1px solid var(--border)',
        }}
      >
        {options.map(renderChip)}
      </div>

      {/* Mobile — botão dropdown */}
      <button
        type="button"
        className="seg-mobile btn-secondary"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
        style={{ width: '100%', justifyContent: 'space-between' }}
      >
        {current?.label}
        <ChevronDown size={15} style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 150ms', flexShrink: 0 }} />
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 12, padding: 6, zIndex: 60,
            display: 'flex', flexDirection: 'column', gap: 2,
            boxShadow: '0 12px 32px rgba(34,22,25,.16)',
          }}
        >
          {options.map(renderMenuItem)}
        </div>
      )}
    </div>
  )
}
