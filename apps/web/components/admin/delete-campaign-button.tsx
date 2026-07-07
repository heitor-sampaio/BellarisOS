'use client'

import { Trash2 } from 'lucide-react'
import { useTransition } from 'react'

interface Props {
  action: () => Promise<{ error?: string } | void>
}

export function DeleteCampaignButton({ action }: Props) {
  const [pending, startTransition] = useTransition()

  function handleClick() {
    if (!confirm('Remover esta campanha permanentemente? Esta ação não pode ser desfeita.')) return
    startTransition(async () => {
      const result = await action()
      if (result && 'error' in result && result.error) {
        alert(result.error)
      }
    })
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className="btn-ghost"
      style={{ color: '#dc2626', display: 'flex', alignItems: 'center', gap: 5 }}
    >
      <Trash2 size={14} />
      {pending ? 'Removendo...' : 'Remover'}
    </button>
  )
}
