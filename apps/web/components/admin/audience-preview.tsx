'use client'

import { useState, useEffect, useTransition, useRef } from 'react'
import { Users } from 'lucide-react'
import { previewAudienceCount } from '@/actions/notification-campaigns'
import type { AudienceRules } from '@/actions/notification-campaigns'

interface Props {
  rules: AudienceRules
}

export function AudiencePreview({ rules }: Props) {
  const [count,     setCount]     = useState<number | null>(null)
  const [isPending, startTransition] = useTransition()
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      startTransition(async () => {
        const res = await previewAudienceCount(rules)
        setCount(res.count)
      })
    }, 600)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(rules)])

  return (
    <div style={{
      display:     'inline-flex',
      alignItems:  'center',
      gap:         7,
      padding:     '7px 14px',
      borderRadius: 99,
      background:  isPending ? 'var(--surface)' : 'var(--brand-soft)',
      border:      '1px solid var(--border)',
      fontSize:    13,
      fontWeight:  700,
      color:       isPending ? 'var(--text-muted)' : 'var(--brand)',
      transition:  'background 200ms, color 200ms',
    }}>
      <Users size={14} />
      {isPending
        ? 'Calculando…'
        : count === null
          ? 'Estimando público…'
          : `~${count.toLocaleString('pt-BR')} cliente${count !== 1 ? 's' : ''}`}
    </div>
  )
}
