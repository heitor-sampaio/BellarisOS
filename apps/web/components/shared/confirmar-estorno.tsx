'use client'

import { formatBRL } from '@estetica-os/utils'
import { JanelaModal } from '@/components/shared/janela-modal'

/**
 * A confirmação do estorno de um lançamento, nos dois financeiros (rede e
 * unidade). Era um clique só, sem volta (simulação de um dia de clínica,
 * 2026-10-20): o estorno cria a contra-transação e não se desfaz.
 */
export function ConfirmarEstorno({ alvo, estornando, onConfirmar, onVoltar }: {
  alvo:        { descricao: string; valor: number }
  estornando:  boolean
  onConfirmar: () => void
  onVoltar:    () => void
}) {
  return (
    <JanelaModal rotulo="Estornar este lançamento?" largura={440} travado={estornando} onFechar={onVoltar}>
      <div style={{ padding: 'var(--card-pad)', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)' }}>Estornar este lançamento?</h2>
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
          <strong style={{ color: 'var(--text)' }}>{alvo.descricao}</strong> · {formatBRL(alvo.valor)}
        </p>
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
          O estorno cria um lançamento ao contrário e marca este como estornado. Não se desfaz.
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn-secondary" disabled={estornando} onClick={onVoltar}>Voltar</button>
          <button type="button" className="btn-primary" disabled={estornando} onClick={onConfirmar}>
            {estornando ? 'Estornando…' : 'Confirmar estorno'}
          </button>
        </div>
      </div>
    </JanelaModal>
  )
}
