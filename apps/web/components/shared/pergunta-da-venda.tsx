'use client'

import { AlertTriangle } from 'lucide-react'

/**
 * A pergunta antes de vender (com-04/com-06, revisão de 2026-11-02 — o Heitor:
 * "se o campo ficar vazio, aviso e confirmação"): o campo da equipe vazio muda
 * quem recebe comissão, então a venda pergunta em vez de seguir calada. O
 * servidor faz a MESMA pergunta (devolve o texto sem gravar) e só vende com a
 * resposta.
 */
export function PerguntaDaVenda({ texto, pendente, aoConfirmar, aoVoltar, rotuloConfirmar = 'Vender assim' }: {
  texto: string
  pendente: boolean
  aoConfirmar: () => void
  aoVoltar: () => void
  rotuloConfirmar?: string
}) {
  return (
    <div data-pergunta-da-venda role="alertdialog" aria-label="Confirmar a venda" style={{
      display: 'flex', flexDirection: 'column', gap: 10, padding: '12px 14px', borderRadius: 'var(--radius-field-token)',
      background: 'var(--warning-soft)', border: '1px solid var(--warning-border)',
    }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <AlertTriangle size={15} style={{ color: 'var(--warning)', flexShrink: 0, marginTop: 2 }} aria-hidden />
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text)', lineHeight: 1.45 }}>{texto}</p>
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" className="btn-secondary" onClick={aoVoltar} disabled={pendente}>Voltar e escolher</button>
        <button type="button" className="btn-primary" onClick={aoConfirmar} disabled={pendente}>{pendente ? 'Vendendo…' : rotuloConfirmar}</button>
      </div>
    </div>
  )
}
