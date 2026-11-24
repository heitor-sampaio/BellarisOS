'use client'

import { useId } from 'react'
import { formatBRL, parseDinheiro, formatDinheiroCampo } from '@estetica-os/utils'
import { Dica } from '@/components/shared/dica'
import { contaDoTroco, recusaDoTroco } from '@/lib/checkout/troco'

/**
 * "Valor entregue" e o troco (item 14 do escopo de 18/11; o Heitor: "ok"): só
 * aparece quando parte do pagamento é em DINHEIRO (`emDinheiro`). Opcional;
 * preenchido, diz o troco, ou avisa que o entregue é menor — e a tela não
 * deixa confirmar (`recusaDoTroco`, a mesma frase). O entregue não se grava:
 * o pagamento é o que se registra (decisão do Claude, princípio 7).
 */
export function CampoDoTroco({ emDinheiro, entregue, aoMudar, desligado = false }: {
  /** O que se paga em dinheiro agora (0 = o campo não aparece). */
  emDinheiro: number
  entregue: string
  aoMudar: (entregue: string) => void
  desligado?: boolean
}) {
  const id = useId()
  if (!(emDinheiro > 0)) return null
  const conta = contaDoTroco(emDinheiro, entregue)
  const recusa = recusaDoTroco(emDinheiro, entregue)
  return (
    <div data-campo-do-troco style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: 260 }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <label htmlFor={id} className="field-label">Valor entregue (opcional)</label>
        <Dica rotulo="Sobre o valor entregue">
          <span>
            Quanto a cliente entregou em dinheiro, para a tela dizer o troco. Fica só aqui: o que se registra é
            o pagamento de {formatBRL(emDinheiro)} em dinheiro.
          </span>
        </Dica>
      </span>
      <input id={id} className="field" inputMode="decimal" placeholder="0,00" value={entregue} disabled={desligado}
        aria-invalid={!!recusa} onChange={e => aoMudar(e.target.value)}
        onBlur={e => { const n = parseDinheiro(e.target.value); if (e.target.value.trim() && Number.isFinite(n)) aoMudar(formatDinheiroCampo(n)) }} />
      {recusa ? (
        <span role="alert" data-entregue-menor style={{ fontSize: 'var(--text-xs-sz)', color: 'var(--danger)', fontWeight: 'var(--weight-semibold)' }}>
          {recusa}
        </span>
      ) : conta.situacao === 'troco' ? (
        <span role="status" data-troco style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text)', fontWeight: 'var(--weight-bold)' }}>
          {conta.troco > 0 ? `Troco: ${formatBRL(conta.troco)}` : 'Sem troco.'}
        </span>
      ) : null}
    </div>
  )
}
