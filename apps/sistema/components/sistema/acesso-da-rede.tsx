'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { desligarRede, religarRede } from '@/actions/sistema'

/**
 * Desligar a rede à mão (abuso, pedido): ninguém da equipe entra e o portal do
 * paciente fica indisponível. A cobrança NUNCA religa — só aqui.
 */
export function AcessoDaRede({ tenantId, ativa, motivo }: { tenantId: string; ativa: boolean; motivo: string | null }) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [texto, setTexto] = useState('')
  const [pendente, iniciar] = useTransition()

  function rodar(f: () => Promise<{ ok: true } | { ok: false; error: string }>, ok: string) {
    iniciar(async () => {
      const r = await f()
      if (!r.ok) { toast.error(r.error); return }
      toast.success(ok)
      setAberto(false); setTexto('')
      router.refresh()
    })
  }

  if (!ativa) {
    return (
      <div className="sistema-acoes">
        <span className="suporte-alerta">Desligada{motivo ? `: ${motivo}` : ''}.</span>
        <button type="button" className="btn-primary" disabled={pendente} onClick={() => rodar(() => religarRede(tenantId), 'Rede religada.')}>
          Religar rede
        </button>
      </div>
    )
  }
  return (
    <div className="suporte-pilha">
      <p className="suporte-texto-fraco">Desligada, ninguém da equipe da clínica entra e o portal do paciente fica indisponível. A cobrança não religa: só você.</p>
      {!aberto ? (
        <div className="sistema-acoes">
          <button type="button" className="btn-secondary" onClick={() => setAberto(true)}>Desligar rede…</button>
        </div>
      ) : (
        <div className="sistema-acoes">
          <input className="field" value={texto} onChange={e => setTexto(e.target.value)} placeholder="Motivo (fica registrado)"
            aria-label="Motivo para desligar" style={{ flex: '1 1 260px' }} />
          <button type="button" className="btn-primary" disabled={pendente || texto.trim().length < 3}
            onClick={() => rodar(() => desligarRede(tenantId, texto), 'Rede desligada.')}>Desligar</button>
          <button type="button" className="btn-ghost" onClick={() => setAberto(false)}>Cancelar</button>
        </div>
      )}
    </div>
  )
}
