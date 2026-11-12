'use client'

import { useState } from 'react'
import { JanelaModal } from '@/components/shared/janela-modal'
import { CampoDaBandeira, useFaltaAMaquininha } from '@/components/shared/campo-da-bandeira'
import { AvisoDaTaxa } from '@/components/shared/aviso-da-taxa'
import { DicaDasVezes } from '@/components/shared/resumo-das-vezes'
import { useOpcoesDeVezes } from '@/components/shared/use-maximo-de-vezes'
import { rotuloDaForma } from '@/lib/financeiro/formas'

/** As formas de quem recebe agora (as do "Novo lançamento"). */
const FORMAS_DE_PAGAMENTO = ['PIX', 'CASH', 'DEBIT_CARD', 'CREDIT_CARD'] as const

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
 *
 * D6 da 6ª simulação: o lançamento SEM meio (a parcela do crediário da
 * clínica) pergunta a forma aqui — nasce vazia, é obrigatória (A37) — e, no
 * cartão, a bandeira e as vezes. Era dar baixa sem forma nenhuma.
 */
export function ReceberNoCartao({ descricao, metodo, valor, pending, aoConfirmar, aoFechar }: {
  descricao: string
  /** O meio do lançamento; nulo, a pessoa escolhe aqui. */
  metodo: string | null
  valor: number
  pending: boolean
  aoConfirmar: (bandeira: string | null, vezes: number, forma: string | null, maquininha: string | null) => void
  aoFechar: () => void
}) {
  const [bandeira, setBandeira] = useState('')
  const [vezes, setVezes] = useState(1)
  const [escolhida, setEscolhida] = useState('')
  // C75: "Qual maquininha?" (só com mais de uma na rede).
  const [maquininha, setMaquininha] = useState('')
  const opcoesDeVezes = useOpcoesDeVezes(maquininha)
  const pergunta = !metodo
  const forma = metodo ?? escolhida
  const faltaAMaquininha = useFaltaAMaquininha(forma, maquininha)
  const noCredito = forma === 'CREDIT_CARD'
  const titulo = pergunta ? 'Receber' : 'Receber no cartão'
  return (
    <JanelaModal onFechar={aoFechar} rotulo={titulo} largura={420} travado={pending}>
      <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h2 style={{ fontSize: 'var(--text-card-title)', fontWeight: 800, color: 'var(--text)' }}>{titulo}</h2>
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text-muted)' }}>
          {descricao}{metodo ? <> · {rotuloDaForma(metodo)}</> : null}
        </p>
        {pergunta && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span className="field-label">Forma de pagamento *</span>
            <select className="field" aria-label="Forma de pagamento" value={escolhida} disabled={pending}
              onChange={e => { setEscolhida(e.target.value); setVezes(1); setBandeira('') }}>
              <option value="">Selecione…</option>
              {FORMAS_DE_PAGAMENTO.map(f => <option key={f} value={f}>{rotuloDaForma(f, null, { longo: true })}</option>)}
            </select>
          </label>
        )}
        <CampoDaBandeira metodo={forma} valor={bandeira} aoMudar={setBandeira} total={valor}
          maquininha={maquininha} aoMudarMaquininha={v => { setMaquininha(v); setVezes(1) }} />
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
            <AvisoDaTaxa vezes={vezes} bandeira={bandeira} maquininha={maquininha} />
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn-secondary" onClick={aoFechar} disabled={pending}>Cancelar</button>
          <button type="button" className="btn-primary" onClick={() => aoConfirmar(bandeira || null, noCredito ? vezes : 1, pergunta ? escolhida : null, maquininha || null)}
            disabled={pending || !forma || !!faltaAMaquininha} title={faltaAMaquininha ?? undefined}>
            {pending ? 'Recebendo…' : 'Confirmar recebimento'}
          </button>
        </div>
      </div>
    </JanelaModal>
  )
}
