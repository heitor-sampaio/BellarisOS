'use client'

import { useState } from 'react'
import { formatBRL } from '@estetica-os/utils'
import { JanelaModal } from '@/components/shared/janela-modal'

/**
 * A confirmação do estorno de um lançamento, nos dois financeiros (rede e
 * unidade). Era um clique só, sem volta (simulação de um dia de clínica,
 * 2026-10-20): o estorno cria a contra-transação e não se desfaz. E pede o
 * MOTIVO, que fica gravado e aparece na lista (A36, 2026-10-27).
 *
 * O lançamento de uma VENDA DE PRODUTO estorna a venda inteira e pergunta se
 * o produto voltou (H2, decisão do Heitor, 2026-11-01): sem a resposta, não
 * confirma — "Sim" o devolve ao estoque, "Não" o deixa como perda.
 */
export function ConfirmarEstorno({ alvo, estornando, onConfirmar, onVoltar }: {
  alvo:        { descricao: string; valor: number; vendaDeProduto?: boolean }
  estornando:  boolean
  onConfirmar: (motivo: string, voltou?: boolean) => void
  onVoltar:    () => void
}) {
  const [motivo, setMotivo] = useState('')
  const [voltou, setVoltou] = useState<boolean | null>(null)
  const produto = !!alvo.vendaDeProduto
  const pronto = motivo.trim().length > 0 && (!produto || voltou !== null)
  const titulo = produto ? 'Estornar esta venda de produto?' : 'Estornar este lançamento?'
  return (
    <JanelaModal rotulo={titulo} largura={440} travado={estornando} onFechar={onVoltar}>
      <div style={{ padding: 'var(--card-pad)', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)' }}>{titulo}</h2>
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
          <strong style={{ color: 'var(--text)' }}>{alvo.descricao}</strong> · {formatBRL(alvo.valor)}
        </p>
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
          {produto
            ? 'Estorna a venda inteira: o que foi pago volta à cliente na mesma forma de pagamento, o que estava a receber é cancelado e a venda sai das Vendas e do custo. Não se desfaz.'
            : 'O estorno cria um lançamento ao contrário, na mesma forma de pagamento, e marca este como estornado. Não se desfaz.'}
        </p>
        {produto && (
          <div role="radiogroup" aria-labelledby="estorno-produto-voltou" data-produto-voltou
            style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span id="estorno-produto-voltou" className="field-label">O produto voltou ao estoque? *</span>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 'var(--text-sm-sz)', color: 'var(--text)', cursor: 'pointer' }}>
              <input type="radio" name="estorno-produto-voltou" checked={voltou === true} disabled={estornando}
                onChange={() => setVoltou(true)} style={{ accentColor: 'var(--brand)', marginTop: 3 }} />
              <span>Sim, voltou ao estoque <span style={{ color: 'var(--text-muted)' }}>— entra de novo nos lotes de onde saiu</span></span>
            </label>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 'var(--text-sm-sz)', color: 'var(--text)', cursor: 'pointer' }}>
              <input type="radio" name="estorno-produto-voltou" checked={voltou === false} disabled={estornando}
                onChange={() => setVoltou(false)} style={{ accentColor: 'var(--brand)', marginTop: 3 }} />
              <span>Não voltou <span style={{ color: 'var(--text-muted)' }}>— o estoque fica como está, e o produto entra nas perdas</span></span>
            </label>
          </div>
        )}
        <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <span className="field-label">Motivo do estorno *</span>
          <textarea className="field" rows={2} maxLength={500} value={motivo} disabled={estornando}
            onChange={e => setMotivo(e.target.value)}
            placeholder={produto ? 'Ex.: a cliente devolveu lacrado' : 'Ex.: a cliente desistiu do pacote'} />
        </label>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn-secondary" disabled={estornando} onClick={onVoltar}>Voltar</button>
          <button type="button" className="btn-primary" disabled={estornando || !pronto}
            onClick={() => onConfirmar(motivo.trim(), produto ? voltou ?? undefined : undefined)}>
            {estornando ? 'Estornando…' : 'Confirmar estorno'}
          </button>
        </div>
      </div>
    </JanelaModal>
  )
}
