'use client'

import { useState } from 'react'
import { formatBRL } from '@estetica-os/utils'
import { JanelaModal } from '@/components/shared/janela-modal'

/**
 * A confirmação do estorno de um lançamento, nos dois financeiros (rede e
 * unidade). Era um clique só, sem volta (simulação de um dia de clínica,
 * 2026-10-20): o estorno cria a contra-transação e não se desfaz. E pede o
 * MOTIVO, que fica gravado e aparece na lista (A36, 2026-10-27).
 */
export function ConfirmarEstorno({ alvo, estornando, onConfirmar, onVoltar }: {
  alvo:        { descricao: string; valor: number }
  estornando:  boolean
  onConfirmar: (motivo: string) => void
  onVoltar:    () => void
}) {
  const [motivo, setMotivo] = useState('')
  const pronto = motivo.trim().length > 0
  return (
    <JanelaModal rotulo="Estornar este lançamento?" largura={440} travado={estornando} onFechar={onVoltar}>
      <div style={{ padding: 'var(--card-pad)', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)' }}>Estornar este lançamento?</h2>
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
          <strong style={{ color: 'var(--text)' }}>{alvo.descricao}</strong> · {formatBRL(alvo.valor)}
        </p>
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
          O estorno cria um lançamento ao contrário, na mesma forma de pagamento, e marca este como estornado. Não se desfaz.
        </p>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <span className="field-label">Motivo do estorno *</span>
          <textarea className="field" rows={2} maxLength={500} value={motivo} disabled={estornando}
            onChange={e => setMotivo(e.target.value)} placeholder="Ex.: a cliente desistiu do pacote" />
        </label>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn-secondary" disabled={estornando} onClick={onVoltar}>Voltar</button>
          <button type="button" className="btn-primary" disabled={estornando || !pronto} onClick={() => onConfirmar(motivo.trim())}>
            {estornando ? 'Estornando…' : 'Confirmar estorno'}
          </button>
        </div>
      </div>
    </JanelaModal>
  )
}
