'use client'

import { useTransition } from 'react'
import { toggleProcedureStatus } from '@/actions/procedures'

export function ToggleProcedureBtn({ procedureId, isActive }: { procedureId: string; isActive: boolean }) {
  const [pending, start] = useTransition()

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(() => toggleProcedureStatus(procedureId, !isActive))}
      className="btn-ghost"
      style={{ fontSize: 'var(--text-xs-sz)', padding: '5px 10px', opacity: pending ? 0.5 : 1 }}
    >
      {isActive ? 'Desativar' : 'Ativar'}
    </button>
  )
}
