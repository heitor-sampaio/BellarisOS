'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { SegSelect } from '@/components/shared/seg-select'
import { mesclarParams } from '@/lib/query-params'

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
  // Preserva o resto da query: montar a URL do zero apagava a aba aberta e,
  // agora, também o filtro de unidade.
  const searchParams = useSearchParams()
  const [showCustom, setShowCustom] = useState(current === 'custom')
  const [from, setFrom] = useState(fromDate ?? '')
  const [to,   setTo  ] = useState(toDate   ?? '')

  const select = (p: Period) => {
    if (p === 'custom') { setShowCustom(true); return }
    setShowCustom(false)
    router.push(mesclarParams(searchParams, { period: p, from: null, to: null }))
  }

  const canApply = !!from && !!to && from <= to
  const applyCustom = () => {
    if (!canApply) return
    router.push(mesclarParams(searchParams, { period: 'custom', from, to }))
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <SegSelect
        options={PERIODS}
        value={current}
        onSelect={(k) => select(k as Period)}
        ariaLabel="Selecionar período"
      />
      {showCustom && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <input
            type="date"
            value={from}
            max={to || undefined}
            onChange={e => setFrom(e.target.value)}
            className="field"
            style={{ width: 140, fontSize: 'var(--text-sm-sz)', padding: '5px 10px' }}
          />
          <span style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-faint)' }}>até</span>
          <input
            type="date"
            value={to}
            min={from || undefined}
            onChange={e => setTo(e.target.value)}
            className="field"
            style={{ width: 140, fontSize: 'var(--text-sm-sz)', padding: '5px 10px' }}
          />
          <button
            type="button"
            onClick={applyCustom}
            disabled={!canApply}
            className="btn-primary"
            style={{ fontSize: 'var(--text-sm-sz)', padding: '5px 12px', opacity: canApply ? 1 : 0.4, cursor: canApply ? 'pointer' : 'not-allowed' }}
          >
            Aplicar
          </button>
        </div>
      )}
    </div>
  )
}
