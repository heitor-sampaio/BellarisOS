'use client'

import { useState } from 'react'
import { formatBRL } from '@estetica-os/utils'
import { JanelaModal } from '@/components/shared/janela-modal'
import { rotuloDaForma, FORMAS_DA_DESPESA } from '@/lib/financeiro/formas'

/**
 * "Pagar despesa" (A15 da 9ª simulação; decidido pelo princípio 3): o "Pagar"
 * da despesa sem forma baixava sem perguntar, e a conta ficava "—" no CSV e
 * nos relatórios por forma — enquanto a parcela da cliente e a comissão
 * perguntavam. Agora a janela pergunta a forma (com o Boleto, A14), que nasce
 * vazia e é obrigatória, como em toda baixa.
 */
export function PagarDespesa({ descricao, valor, pendente, aoConfirmar, aoFechar }: {
  descricao: string; valor: number; pendente: boolean
  aoConfirmar: (forma: string) => void; aoFechar: () => void
}) {
  const [forma, setForma] = useState('')
  return (
    <JanelaModal rotulo="Pagar despesa" largura={400} travado={pendente} onFechar={aoFechar}>
      <div style={{ padding: 'var(--card-pad)', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)' }}>Pagar despesa</h2>
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
          <strong style={{ color: 'var(--text)' }}>{descricao}</strong> · {formatBRL(valor)}
        </p>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="field-label">Forma de pagamento</span>
          <select className="field" value={forma} onChange={e => setForma(e.target.value)} disabled={pendente}>
            <option value="">Selecione…</option>
            {FORMAS_DA_DESPESA.map(f => <option key={f} value={f}>{rotuloDaForma(f, null, { longo: true })}</option>)}
          </select>
        </label>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn-secondary" disabled={pendente} onClick={aoFechar}>Voltar</button>
          <button type="button" className="btn-primary" disabled={pendente || !forma} onClick={() => aoConfirmar(forma)}>
            {pendente ? 'Pagando…' : 'Confirmar pagamento'}
          </button>
        </div>
      </div>
    </JanelaModal>
  )
}
