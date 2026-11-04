'use client'

import { useState } from 'react'
import { JanelaModal } from '@/components/shared/janela-modal'
import { CampoDaBandeira } from '@/components/shared/campo-da-bandeira'
import { AvisoDaTaxa } from '@/components/shared/aviso-da-taxa'
import { DicaDasVezes } from '@/components/shared/resumo-das-vezes'
import { useOpcoesDeVezes } from '@/components/shared/use-maximo-de-vezes'
import { rotuloDaForma } from '@/lib/financeiro/formas'

/**
 * "Marcar como pago" de um lançamento a receber no CARTÃO (r3-f13-01; o
 * Heitor, 2026-11-03: "Lembre-se, flexibilidade. Prazo por bandeira. Taxas
 * também configuráveis por bandeira."): antes de dar baixa, a bandeira,
 * opcional — vazia, vale a regra geral do prazo e das taxas. Fora do cartão a
 * baixa segue direta, como sempre.
 *
 * F17-5 (o Heitor: "pode"): no CRÉDITO, também as vezes — até o "Parcelar no
 * crédito até" da clínica. É UM pagamento que a operadora deposita em N, com
 * o prazo e a taxa daquelas vezes (o mesmo do "Novo lançamento"). Débito, 1x.
 */
export function ReceberNoCartao({ descricao, metodo, valor, pending, aoConfirmar, aoFechar }: {
  descricao: string
  metodo: string
  valor: number
  pending: boolean
  aoConfirmar: (bandeira: string | null, vezes: number) => void
  aoFechar: () => void
}) {
  const [bandeira, setBandeira] = useState('')
  const [vezes, setVezes] = useState(1)
  const opcoesDeVezes = useOpcoesDeVezes()
  const noCredito = metodo === 'CREDIT_CARD'
  return (
    <JanelaModal onFechar={aoFechar} rotulo="Receber no cartão" largura={420} travado={pending}>
      <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)' }}>Receber no cartão</h2>
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
          {descricao} · {rotuloDaForma(metodo)}
        </p>
        <CampoDaBandeira metodo={metodo} valor={bandeira} aoMudar={setBandeira} />
        {noCredito && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label htmlFor="baixa-vezes" style={{ fontSize: 'var(--text-xs-sz)', fontWeight: 700, color: 'var(--text-muted)' }}>Vezes no cartão</label>
            <select id="baixa-vezes" className="field" value={String(vezes)} onChange={e => setVezes(Number(e.target.value))} disabled={pending}>
              {opcoesDeVezes.map(n => <option key={n} value={String(n)}>{n === 1 ? 'À vista' : `${n}x`}</option>)}
            </select>
            <DicaDasVezes total={valor} vezes={vezes} opcoes={opcoesDeVezes} />
            {vezes > 1 && (
              <span data-credito-em-vezes style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', lineHeight: 1.45 }}>
                Um pagamento só: a cliente pagou tudo agora, e a operadora deposita em {vezes} parcelas
                (no “A receber da operadora”). Não é um parcelamento da cliente com a clínica.
              </span>
            )}
            <AvisoDaTaxa vezes={vezes} bandeira={bandeira} />
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn-secondary" onClick={aoFechar} disabled={pending}>Cancelar</button>
          <button type="button" className="btn-primary" onClick={() => aoConfirmar(bandeira || null, noCredito ? vezes : 1)} disabled={pending}>
            {pending ? 'Recebendo…' : 'Confirmar recebimento'}
          </button>
        </div>
      </div>
    </JanelaModal>
  )
}
