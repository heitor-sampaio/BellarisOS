'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { JanelaModal } from '@/components/shared/janela-modal'
import { Dica } from '@/components/shared/dica'
import { cancelarPlanoProposto } from '@/actions/treatment-plans'
import { AVISO_DO_CANCELAMENTO_PROPOSTO } from '@/lib/plano-de-tratamento/cancelar-proposto'

/**
 * "Cancelar plano" do rascunho e do PROPOSTO (A1a da 25ª simulação; o Heitor,
 * 18/11: "sim"). A forma do cancelamento do aceito (a janela com o motivo
 * obrigatório — princípio 7), sem a conta do dinheiro: nada foi vendido nem
 * recebido. Quem a abre é quem monta o plano; a action confere de novo.
 */
export function CancelarPlanoProposto({ planId, rascunho, onFechar, onCancelado }: {
  planId: string
  /** O rascunho ainda não foi mandado à cliente: o texto não fala do app. */
  rascunho: boolean
  onFechar: () => void
  /** A tela relê o plano aberto e a lista (o `router.refresh()` não chega ao estado do navegador). */
  onCancelado?: () => void
}) {
  const router = useRouter()
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [cancelando, startCancelar] = useTransition()

  function confirmar() {
    setErro(null)
    startCancelar(async () => {
      const res = await cancelarPlanoProposto(planId, { motivo: motivo.trim() })
      if (res.error) { setErro(res.error); return }
      toast.success('Plano cancelado.')
      onCancelado?.()
      onFechar()
      router.refresh()
    })
  }

  return (
    <JanelaModal rotulo="Cancelar plano" largura={440} travado={cancelando} onFechar={onFechar} fechaNoFundo={false}>
      <div data-cancelar-proposto-janela style={{ padding: 'var(--card-pad)', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span>{rascunho ? 'Cancelar este rascunho de plano?' : 'Cancelar o plano proposto?'}</span>
          {/* O que acontece mora na dica; a frase curta fica à vista (princípio 7). */}
          <Dica rotulo="O que acontece ao cancelar">{AVISO_DO_CANCELAMENTO_PROPOSTO}</Dica>
        </h2>
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
          Ainda não foi aceito: nada foi vendido nem recebido. Os documentos que esperam assinatura são cancelados
          {rascunho ? '.' : ', e o plano sai do app da cliente.'}
        </p>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <span className="field-label">Motivo do cancelamento *</span>
          <textarea className="field" rows={2} maxLength={500} value={motivo} disabled={cancelando} autoFocus
            onChange={e => setMotivo(e.target.value)} placeholder="Ex.: a cliente decidiu não fazer agora" />
        </label>

        {erro && <p role="alert" style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--danger)' }}>{erro}</p>}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn-secondary" disabled={cancelando} onClick={onFechar}>Voltar</button>
          <button type="button" className="btn-primary" data-confirmar-cancelamento disabled={cancelando || !motivo.trim()} onClick={confirmar}>
            {cancelando ? 'Cancelando…' : 'Cancelar plano'}
          </button>
        </div>
      </div>
    </JanelaModal>
  )
}
