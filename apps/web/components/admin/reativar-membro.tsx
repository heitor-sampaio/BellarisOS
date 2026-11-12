'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { UserCheck } from 'lucide-react'
import { reactivateTeamMember } from '@/actions/team'

/**
 * O "Reativar membro" da linha da Equipe. Era um `<form>` de servidor que
 * descartava o `{ error }` da action (o limite do plano, o login que não
 * desbloqueou, o modo suporte): o clique não fazia nada, e ninguém dizia
 * por quê (C7/C9 da F63). Aqui o motivo aparece ao lado do botão.
 */
export function ReativarMembro({ membroId, redirectPath }: { membroId: string; redirectPath: string }) {
  const router = useRouter()
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()

  function reativar() {
    setErro(null)
    iniciar(async () => {
      try {
        const r = await reactivateTeamMember(membroId, redirectPath)
        if (r?.error) { setErro(r.error); return }
        router.refresh()
      } catch {
        setErro('Não deu certo. Tente de novo.')
      }
    })
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {erro && <span role="alert" style={{ fontSize: 'var(--text-2xs)', color: 'var(--danger)', fontWeight: 600, maxWidth: 260 }}>{erro}</span>}
      <button
        type="button"
        onClick={reativar}
        disabled={pendente}
        className="btn-ghost"
        style={{ padding: '5px 8px', color: 'var(--brand)' }}
        title="Reativar membro"
        aria-label="Reativar membro"
      >
        <UserCheck size={15} />
      </button>
    </span>
  )
}
