'use client'

import { useState, useTransition } from 'react'
import dynamic from 'next/dynamic'
import { Loader2 } from 'lucide-react'
import { getCheckoutPlan } from '@/actions/treatment-plans'
import { JanelaModal } from '@/components/shared/janela-modal'
import type { CheckoutPlan } from '@/components/branch/checkout-wizard'

// O assistente do plano é grande: só carrega quando alguém vai receber um.
const CheckoutWizard = dynamic(() => import('@/components/branch/checkout-wizard').then(m => m.CheckoutWizard))

/**
 * O receber do plano no PDV (PDV4 e PT1c, a revisão do Heitor de 2026-11-13):
 * o plano chega aceito, e aqui se escolhe a forma (à vista, crediário, cartão
 * em N vezes; o desconto e "Quem vendeu"), a cliente assina o contrato com ela
 * ("primeiro colhe assinatura, depois paga") e só então se recebe. As sessões
 * não se agendam aqui: são do plano, a qualquer momento depois do aceite.
 */
export function ReceberOPlano({ planoId, slug, aoReceber }: { planoId: string; slug: string; aoReceber: () => void }) {
  const [plano, setPlano] = useState<CheckoutPlan | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [abrindo, abrir] = useTransition()
  return (
    <>
      <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm-sz)' }}>
        O plano foi aceito. Escolha a forma, colha a assinatura do contrato e receba.
      </p>
      {erro && <p role="alert" style={{ color: 'var(--danger)', fontSize: 'var(--text-sm-sz)', fontWeight: 600 }}>{erro}</p>}
      <button type="button" className="btn-primary" disabled={abrindo}
        style={{ justifyContent: 'center', gap: 8 }}
        onClick={() => abrir(async () => {
          setErro(null)
          const r = await getCheckoutPlan(planoId)
          if (r.error || !r.plan) { setErro(r.error ?? 'Não foi possível abrir o plano.'); return }
          setPlano(r.plan)
        })}>
        {abrindo && <Loader2 size={15} className="animate-spin" aria-hidden />}
        Receber o plano
      </button>
      {plano && (
        <JanelaModal onFechar={() => setPlano(null)} rotulo="Receber o plano" largura={700} fechaNoFundo={false}>
          <div style={{ padding: '22px 24px' }}>
            <div className="esconde-impressao" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <h3 style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)' }}>Receber o plano</h3>
              <button type="button" onClick={() => setPlano(null)} className="btn-ghost" style={{ padding: '6px 10px' }}>Fechar</button>
            </div>
            <CheckoutWizard plan={plano} slug={slug} podeAgendar={false}
              onDone={() => { setPlano(null); aoReceber() }} />
          </div>
        </JanelaModal>
      )}
    </>
  )
}
