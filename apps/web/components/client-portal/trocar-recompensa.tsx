'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { trocarPontosNoPortal } from '@/actions/fidelidade-portal'
import { erroParaTela } from '@/lib/erro-na-tela'
import { formatarPontos } from '@/lib/fidelidade/formato'

/**
 * Portal → trocar pontos por uma recompensa (só com `client_redeem` ligado na
 * rede). Em dois cliques — "Trocar" e "Confirmar" —, porque os pontos saem na
 * hora e o cliente não desfaz sozinho: cancelar o voucher é com a recepção.
 */
export function TrocarRecompensa({ slug, rewardId, nome, custo, saldo }: {
  slug: string; rewardId: string; nome: string; custo: number; saldo: number
}) {
  const router = useRouter()
  const [confirmando, setConfirmando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [trocando, iniciar] = useTransition()
  const alcanca = saldo >= custo

  function trocar() {
    setErro(null)
    iniciar(async () => {
      try {
        const res = await trocarPontosNoPortal({ slug, rewardId })
        if (res.error) { setErro(res.error); return }
        setConfirmando(false)
        router.refresh()
      } catch (e) {
        setErro(erroParaTela(e, 'Não foi possível trocar agora.'))
      }
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
      {!confirmando ? (
        <button type="button" className="btn-secondary" disabled={!alcanca}
          onClick={() => setConfirmando(true)} aria-label={`Trocar pontos por ${nome}`}>
          Trocar
        </button>
      ) : (
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" className="btn-secondary" onClick={() => setConfirmando(false)} disabled={trocando}>
            Voltar
          </button>
          <button type="button" className="btn-primary" onClick={trocar} disabled={trocando}>
            {trocando ? <><Loader2 size={14} className="animate-spin" /> Trocando…</> : `Confirmar (${formatarPontos(custo)})`}
          </button>
        </div>
      )}
      {erro && <p role="alert" style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--danger)', fontWeight: 600 }}>{erro}</p>}
    </div>
  )
}
