'use client'

import { useEffect, useRef } from 'react'
import { AlertTriangle } from 'lucide-react'
import type { MembroDaVenda } from '@/components/shared/vender'

/**
 * "Quem vendeu" (com-06, revisão de 2026-11-02 — o Heitor: "às vezes quem vai
 * registrar a venda é recepção e quem vendeu foi a profissional"): leva a
 * comissão da venda e aparece em Vendas. Nasce VAZIO em toda venda (r2-ven-12;
 * o Heitor: "nasce sempre vazio") — quem registra se acha pelo "(você)"; vazio
 * continua valendo (ninguém, sem comissão), e a venda pergunta antes.
 */
const GRUPOS_DE_QUEM_VENDEU: { rotulo: string; de: (m: MembroDaVenda) => boolean }[] = [
  { rotulo: 'Quem atende', de: m => m.atende },
  { rotulo: 'Quem recebe', de: m => !m.atende && !!m.recebe },
  // A42 da 11ª: só quem tem Vendas no cargo — a estoquista não vende.
  { rotulo: 'Quem tem Vendas no cargo', de: m => !m.atende && !m.recebe },
]

export function CampoQuemVendeu({ equipe, valor, aoMudar, comissao = null }: {
  equipe: MembroDaVenda[]; valor: string; aoMudar: (id: string) => void
  /** A18 da 12ª: a comissão de venda de quem foi escolhido e de onde vem (`textoDaComissaoDaVenda`). */
  comissao?: string | null
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span className="overline">Quem vendeu</span>
      <select className="field" aria-label="Quem vendeu" value={valor} onChange={e => aoMudar(e.target.value)}>
        {/* A46 da 11ª: o texto longo saía cortado no celular — a explicação vai embaixo. */}
        <option value="">Escolha quem vendeu</option>
        {/* A15 da 8ª simulação: quem atende e quem recebe primeiro; depois quem tem Vendas no cargo (A42 da 11ª). */}
        {GRUPOS_DE_QUEM_VENDEU.map(g => {
          const doGrupo = equipe.filter(g.de)
          return doGrupo.length ? (
            <optgroup key={g.rotulo} label={g.rotulo}>
              {doGrupo.map(m => <option key={m.id} value={m.id}>{m.eu ? `${m.nome} (você)` : m.nome}</option>)}
            </optgroup>
          ) : null
        })}
      </select>
      {!valor && (
        <span data-quem-vendeu-vazio style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)' }}>
          Vazio: ninguém vendeu — sem comissão de venda.
        </span>
      )}
      {valor && comissao && (
        <span data-comissao-da-venda style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-muted)', lineHeight: 1.45 }}>
          {comissao}
        </span>
      )}
    </label>
  )
}

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
  // A1 da 10ª simulação: no celular a pergunta nascia no fim da janela, fora da
  // tela, e o botão de vender parecia morto. Ao aparecer, ela rola até ficar
  // inteira à vista e o foco vai para a resposta ("Vender assim").
  const caixa = useRef<HTMLDivElement>(null)
  const confirmar = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    caixa.current?.scrollIntoView({ block: 'nearest' })
  }, [texto])
  useEffect(() => {
    if (!pendente) confirmar.current?.focus({ preventScroll: true })
  }, [texto, pendente])
  return (
    <div ref={caixa} data-pergunta-da-venda role="alertdialog" aria-label="Confirmar a venda" style={{
      display: 'flex', flexDirection: 'column', gap: 10, padding: '12px 14px', borderRadius: 'var(--radius-field-token)',
      background: 'var(--warning-soft)', border: '1px solid var(--warning-border)',
    }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <AlertTriangle size={15} style={{ color: 'var(--warning)', flexShrink: 0, marginTop: 2 }} aria-hidden />
        <p style={{ fontSize: 'var(--text-sm-sz)', color: 'var(--text)', lineHeight: 1.45 }}>{texto}</p>
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <button type="button" className="btn-secondary" onClick={aoVoltar} disabled={pendente}>Voltar e escolher</button>
        <button ref={confirmar} type="button" className="btn-primary" onClick={aoConfirmar} disabled={pendente}>{pendente ? 'Vendendo…' : rotuloConfirmar}</button>
      </div>
    </div>
  )
}
