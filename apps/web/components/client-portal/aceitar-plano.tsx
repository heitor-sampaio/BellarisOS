'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2 } from 'lucide-react'
import { aceitarPlanoPelaCliente } from '@/actions/plano-da-cliente'
import { erroParaTela } from '@/lib/erro-na-tela'
import { Dica } from '@/components/shared/dica'

/**
 * O "Aceitar o plano" do app (PT1b, a revisão do Heitor de 2026-11-13): só
 * "quero fazer", sem pergunta de dinheiro — o pagamento é combinado na
 * unidade, no PDV. Aceito, a página volta com o aviso (`?aceito=1`).
 */
export function AceitarPlano({ slug, planId }: { slug: string; planId: string }) {
  const router = useRouter()
  const [erro, setErro] = useState<string | null>(null)
  const [aceitando, iniciar] = useTransition()

  function aceitar() {
    setErro(null)
    iniciar(async () => {
      try {
        const res = await aceitarPlanoPelaCliente(planId)
        if (res.error) { setErro(res.error); return }
        router.replace(`/${slug}/cliente/planos/${planId}?aceito=1`)
        router.refresh()
      } catch (e) {
        setErro(erroParaTela(e, 'Não foi possível aceitar agora.'))
      }
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {/* O que é aceitar mora na dica, ao lado do botão (docs/regras/design.md). */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)' }}>
        <button type="button" className="btn-primary" onClick={aceitar} disabled={aceitando} style={{ justifyContent: 'center', flex: 1 }}>
          {aceitando ? <><Loader2 size={14} className="animate-spin" aria-hidden="true" /> Aceitando…</> : <><Check size={14} aria-hidden="true" /> Aceitar o plano</>}
        </button>
        {/* O rótulo não repete "Aceitar o plano": o botão é achado pelo nome. */}
        <Dica rotulo="Sobre o aceite">
          Aceitar é dizer que você quer fazer este tratamento. O pagamento é combinado depois, na unidade.
        </Dica>
      </div>
      {erro && <p role="alert" style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--danger)', fontWeight: 600 }}>{erro}</p>}
    </div>
  )
}
