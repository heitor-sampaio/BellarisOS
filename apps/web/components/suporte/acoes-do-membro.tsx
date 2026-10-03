'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { reenviarAcesso, reativarMembroDaRede } from '@/actions/plataforma'

/**
 * O que o suporte faz por um membro SEM entrar na conta dele: reenviar o
 * acesso (o e-mail de definir senha) e reativar quem foi desativado.
 */
export function AcoesDoMembro({ tenantId, userId, ativo }: { tenantId: string; userId: string; ativo: boolean }) {
  const router = useRouter()
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null)
  const [pendente, startTransition] = useTransition()

  function rodar(fazer: () => Promise<{ ok: true } | { ok: false; error: string }>, sucesso: string) {
    setAviso(null)
    startTransition(async () => {
      const r = await fazer()
      setAviso(r.ok ? { ok: true, texto: sucesso } : { ok: false, texto: r.error })
      if (r.ok) router.refresh()
    })
  }

  return (
    <div className="suporte-acoes">
      <button
        type="button" className="btn-ghost" disabled={pendente}
        onClick={() => rodar(() => reenviarAcesso(tenantId, userId), 'Link de acesso enviado.')}
      >
        Reenviar acesso
      </button>
      {!ativo && (
        <button
          type="button" className="btn-ghost" disabled={pendente}
          onClick={() => rodar(() => reativarMembroDaRede(tenantId, userId), 'Membro reativado.')}
        >
          Reativar
        </button>
      )}
      {aviso && <span className={aviso.ok ? 'suporte-ok' : 'suporte-erro'} role="status">{aviso.texto}</span>}
    </div>
  )
}
