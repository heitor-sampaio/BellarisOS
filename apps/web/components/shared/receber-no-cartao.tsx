'use client'

import { useState } from 'react'
import { JanelaModal } from '@/components/shared/janela-modal'
import { CampoDaBandeira } from '@/components/shared/campo-da-bandeira'
import { rotuloDaForma } from '@/lib/financeiro/formas'

/**
 * "Marcar como pago" de um lançamento a receber no CARTÃO (r3-f13-01; o
 * Heitor, 2026-11-03: "Lembre-se, flexibilidade. Prazo por bandeira. Taxas
 * também configuráveis por bandeira."): antes de dar baixa, a bandeira,
 * opcional — vazia, vale a regra geral do prazo e das taxas. Fora do cartão a
 * baixa segue direta, como sempre.
 */
export function ReceberNoCartao({ descricao, metodo, pending, aoConfirmar, aoFechar }: {
  descricao: string
  metodo: string
  pending: boolean
  aoConfirmar: (bandeira: string | null) => void
  aoFechar: () => void
}) {
  const [bandeira, setBandeira] = useState('')
  return (
    <JanelaModal onFechar={aoFechar} rotulo="Receber no cartão" largura={420} travado={pending}>
      <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)' }}>Receber no cartão</h2>
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
          {descricao} · {rotuloDaForma(metodo)}
        </p>
        <CampoDaBandeira metodo={metodo} valor={bandeira} aoMudar={setBandeira} />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn-secondary" onClick={aoFechar} disabled={pending}>Cancelar</button>
          <button type="button" className="btn-primary" onClick={() => aoConfirmar(bandeira || null)} disabled={pending}>
            {pending ? 'Recebendo…' : 'Confirmar recebimento'}
          </button>
        </div>
      </div>
    </JanelaModal>
  )
}
