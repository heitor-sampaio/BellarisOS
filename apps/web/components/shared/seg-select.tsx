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
 * Seletor segmentado responsivo. A aparência TODA mora em `.seg-desktop` /
 * `.seg-chip` / `.seg-mobile` no globals.css — não existe variante de tamanho,
 * e a tela que usa não escolhe altura. Ver §13 do CLAUDE.md.
 *
 * Comportamento:
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
  const [alignRight, setAlignRight] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const current = options.find(o => o.key === value) ?? options[0]

  const toggle = () => {
    if (!open) {
      const rect = ref.current?.getBoundingClientRect()
      // Abre o menu à direita se o botão estiver na metade direita da tela,
      // para não estourar/ser cortado pela viewport.
      if (rect) setAlignRight(rect.left + rect.width / 2 > window.innerWidth / 2)
    }
    setOpen(v => !v)
  }

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

  const renderChip = (o: SegOption) => {
    const cls = o.key === value ? 'seg-chip is-ativo' : 'seg-chip'
    return basePath
      ? <Link key={o.key} href={hrefFor(o.key)} className={cls} aria-current={o.key === value}>{o.label}</Link>
      : <button key={o.key} type="button" className={cls} aria-pressed={o.key === value} onClick={() => onSelect?.(o.key)}>{o.label}</button>
  }

  const menuItemStyle = (active: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
    width: '100%', padding: '10px 12px', borderRadius: 9,
    fontSize: 'var(--text-base-sz)', fontWeight: 700, fontFamily: 'inherit', textAlign: 'left',
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
      <div className="seg-desktop">{options.map(renderChip)}</div>

      {/* Mobile — botão dropdown (fundo branco) */}
      <button
        type="button"
        className="seg-mobile"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
      >
        {current?.label}
        <ChevronDown size={15} style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 150ms', flexShrink: 0 }} />
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute', top: 'calc(100% + 6px)',
            ...(alignRight ? { right: 0 } : { left: 0 }),
            minWidth: 180, width: 'max-content', maxWidth: 'min(78vw, 280px)',
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-field-token)', padding: 6, zIndex: 60,
            display: 'flex', flexDirection: 'column', gap: 2,
            boxShadow: 'var(--shadow-popover)',
          }}
        >
          {options.map(renderMenuItem)}
        </div>
      )}
    </div>
  )
}
