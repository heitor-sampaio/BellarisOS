'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { toggleProcedureStatus } from '@/actions/procedures'

export function ToggleProcedureBtn({ procedureId, isActive }: { procedureId: string; isActive: boolean }) {
  const [pending, start] = useTransition()

  return (
    <button
      type="button"
      disabled={pending}
      // A action devolve `{ error }` quando a gravação falha. Sem olhar, o
      // botão volta ao normal e o procedimento continua do jeito que estava —
      // igualzinho a ter dado certo.
      onClick={() => start(async () => {
        const r = await toggleProcedureStatus(procedureId, !isActive)
        if (r?.error) toast.error(r.error)
      })}
      className="btn-ghost"
      style={{ fontSize: 'var(--text-xs-sz)', padding: '5px 10px', opacity: pending ? 0.5 : 1 }}
    >
      {isActive ? 'Desativar' : 'Ativar'}
    </button>
  )
}
