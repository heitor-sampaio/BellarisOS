'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export type Period = 'today' | '7d' | '15d' | 'month' | 'all' | 'custom'

const PERIODS: { key: Period; label: string }[] = [
  { key: 'today',  label: 'Hoje'          },
  { key: '7d',     label: '7 dias'        },
  { key: '15d',    label: '15 dias'       },
  { key: 'month',  label: 'Mês'           },
  { key: 'all',    label: 'Todo período'  },
  { key: 'custom', label: 'Personalizado' },
]

interface Props {
  current:   Period
  fromDate?: string
  toDate?:   string
}

export function PeriodSelector({ current, fromDate, toDate }: Props) {
  const router = useRouter()
  const [showCustom, setShowCustom] = useState(current === 'custom')
  const [from, setFrom] = useState(fromDate ?? '')
  const [to,   setTo  ] = useState(toDate   ?? '')

  const select = (p: Period) => {
    if (p === 'custom') { setShowCustom(true); return }
    setShowCustom(false)
    router.push(`?period=${p}`)
  }

  const canApply = !!from && !!to && from <= to
  const applyCustom = () => {
    if (!canApply) return
    router.push(`?period=custom&from=${from}&to=${to}`)
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', gap: 4, background: '#fff', borderRadius: 10, padding: 4, border: '1px solid var(--border)' }}>
        {PERIODS.map(p => {
          const active = current === p.key
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => select(p.key)}
              className={active ? 'btn-primary' : undefined}
              style={{
                padding: '6px 14px', fontSize: 12.5, fontWeight: 700,
                cursor: 'pointer', transition: 'all 100ms', fontFamily: 'inherit',
                whiteSpace: 'nowrap',
                ...(active ? {} : {
                  borderRadius: 'var(--radius-field-token)',
                  border: '1px solid transparent',
                  background: 'transparent',
                  color: 'var(--text-muted)',
                }),
              }}
            >
              {p.label}
            </button>
          )
        })}
      </div>
      {showCustom && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <input
            type="date"
            value={from}
            max={to || undefined}
            onChange={e => setFrom(e.target.value)}
            className="field"
            style={{ width: 140, fontSize: 12, padding: '5px 10px' }}
          />
          <span style={{ fontSize: 12, color: 'var(--text-faint)' }}>até</span>
          <input
            type="date"
            value={to}
            min={from || undefined}
            onChange={e => setTo(e.target.value)}
            className="field"
            style={{ width: 140, fontSize: 12, padding: '5px 10px' }}
          />
          <button
            type="button"
            onClick={applyCustom}
            disabled={!canApply}
            className="btn-primary"
            style={{ fontSize: 12, padding: '5px 12px', opacity: canApply ? 1 : 0.4, cursor: canApply ? 'pointer' : 'not-allowed' }}
          >
            Aplicar
          </button>
        </div>
      )}
    </div>
  )
}
