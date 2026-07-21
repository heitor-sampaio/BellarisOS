import type { ReactNode } from 'react'
import { X } from 'lucide-react'

export interface TagBadgeStyle {
  bg:    string
  color: string
}

export interface TagBadgeProps {
  label:     ReactNode
  /** cores explícitas (ex.: sourceStyle(source)); default = neutro */
  style?:    TagBadgeStyle
  size?:     'xs' | 'sm'
  onRemove?: () => void
  title?:    string
}

const NEUTRAL: TagBadgeStyle = { bg: '#f3eef0', color: 'var(--text-muted)' }

/** Chip de classificação (origem de lead, tags). Linguagem "Rosé Vivo": pill, peso 700. */
export function TagBadge({ label, style, size = 'sm', onRemove, title }: TagBadgeProps) {
  const s = style ?? NEUTRAL
  return (
    <span
      title={title}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        fontSize: size === 'xs' ? 10 : 11, fontWeight: 700,
        padding: size === 'xs' ? '2px 8px' : '3px 10px',
        borderRadius: 'var(--radius-chip, 20px)',
        background: s.bg, color: s.color,
        whiteSpace: 'nowrap', lineHeight: 1.25,
      }}
    >
      {label}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remover"
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            border: 'none', background: 'transparent', padding: 0, margin: 0,
            cursor: 'pointer', color: 'inherit', opacity: 0.65,
          }}
        >
          <X size={12} />
        </button>
      )}
    </span>
  )
}
